import { statSync } from 'node:fs';
import { basename } from 'node:path';

import type { CloudProviderId, HubEvent, SettingsRow } from '@nuvigia/shared';
import type { Logger } from 'pino';

import type { Backend } from '../backend';
import type { CloudControl, ConnectCloud } from '../cloud';
import { forgetRecording } from '../janitor';
import type { LocalFile, LocalStore } from '../store';
import { AuthExpiredError, safeName, TransientError, type CloudProvider } from './provider';

const DAY = 86_400_000;
/** Espera entre tentativas: 1 min, 5 min, 15 min, 1 h, 3 h; depois marca como falha. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
const TICK_MS = 15_000;
const QUOTA_MS = 30 * 60_000;
const RETENTION_MS = 6 * 60 * 60_000;

export type UploaderDeps = {
  backend: Backend;
  store: LocalStore;
  log: Logger;
  /** Cria o provedor (com os tokens guardados no cofre local). */
  makeProvider: (id: CloudProviderId) => CloudProvider;
  cameraName: (cameraId: string) => string;
  settings: () => SettingsRow | null;
  emit: (e: HubEvent) => void;
  now?: () => number;
};

/** Pasta Nuvigia/{Câmera}/{AAAA-MM-DD} e nome do arquivo. */
export function cloudPath(cameraName: string, startedAt: string): string[] {
  return ['Nuvigia', safeName(cameraName), startedAt.slice(0, 10)];
}

export function fileName(f: Pick<LocalFile, 'startedAt' | 'kind' | 'path'>): string {
  const t = f.startedAt.slice(11, 19).replace(/:/g, '-');
  return `${t}${f.kind === 'photo' ? '-foto' : ''}${basename(f.path).slice(basename(f.path).lastIndexOf('.'))}`;
}

/**
 * Fila persistente de envio (tabela local_files): um arquivo por vez, com novas
 * tentativas espaçadas, progresso no Realtime e retenção na nuvem.
 */
export class Uploader implements CloudControl {
  private provider: CloudProvider | null = null;
  private providerId: CloudProviderId | null = null;
  private paused = false;
  private running = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private kickTimer: ReturnType<typeof setTimeout> | null = null;
  /** Uso somado localmente, para provedores que não informam cota. */
  private usedBytes = 0;

  constructor(private readonly d: UploaderDeps) {}

  private now() {
    return this.d.now?.() ?? Date.now();
  }

  isConnected() {
    return this.provider !== null && !this.paused;
  }

  /** Retoma o provedor salvo (se houver) e liga os temporizadores. */
  start() {
    const s = this.d.settings();
    if (s?.cloud_provider && s.cloud_connected && this.d.store.getCloudToken(s.cloud_provider)) {
      this.providerId = s.cloud_provider;
      this.provider = this.d.makeProvider(s.cloud_provider);
      this.usedBytes = Number(s.cloud_used_bytes) || 0;
    }
    // envio interrompido por queda do hub volta para a fila
    for (const f of this.d.store.filesByStatus('uploading')) this.d.store.updateFile(f.recordingId, { status: 'pending' });
    this.timers.push(setInterval(() => void this.drain(), TICK_MS));
    this.timers.push(setInterval(() => void this.refreshQuota(), QUOTA_MS));
    this.timers.push(setInterval(() => void this.applyRetention(), RETENTION_MS));
    void this.drain();
    void this.applyRetention();
  }

  async stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (this.kickTimer) clearTimeout(this.kickTimer);
  }

  notifyFileReady() {
    if (this.kickTimer) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.drain();
    }, 200);
  }

  async connect(cmd: ConnectCloud) {
    const provider = this.d.makeProvider(cmd.provider);
    const { account } = await provider.connect(cmd);
    const folderRef = await provider.ensureFolder(['Nuvigia']);
    // trocar de provedor não move gravações antigas; só apaga os tokens do anterior
    for (const other of ['google', 'onedrive', 'icloud'] as const) if (other !== cmd.provider) this.d.store.deleteCloudToken(other);
    this.provider = provider;
    this.providerId = cmd.provider;
    this.paused = false;
    const quota = await provider.getQuota().catch(() => ({ usedBytes: null, totalBytes: null }));
    this.usedBytes = quota.usedBytes ?? 0;
    await this.d.backend.updateCloud({
      cloud_provider: cmd.provider,
      cloud_connected: true,
      cloud_account: account,
      cloud_folder_ref: folderRef,
      cloud_used_bytes: quota.usedBytes ?? 0,
      cloud_total_bytes: quota.totalBytes,
    });
    this.d.log.info({ provider: cmd.provider }, 'nuvem conectada');
    void this.drain();
    return { account: account ?? undefined };
  }

  async disconnect() {
    this.d.store.deleteCloudTokens();
    this.provider = null;
    this.providerId = null;
    // o que estava na fila fica só no hub
    for (const f of this.d.store.filesByStatus('pending', 'uploading', 'failed')) {
      this.d.store.updateFile(f.recordingId, { status: 'local' });
      await this.d.backend.updateRecording(f.recordingId, { status: 'done', upload_progress: 0, error: null }).catch(() => undefined);
    }
    await this.d.backend.updateCloud({ cloud_provider: null, cloud_connected: false, cloud_account: null, cloud_folder_ref: null, cloud_used_bytes: 0, cloud_total_bytes: null });
    this.d.log.info('nuvem desconectada');
  }

  async webLink(recordingId: string) {
    if (!this.provider) return null;
    const rec = await this.d.backend.getRecording(recordingId);
    if (!rec?.cloud_file_ref || rec.provider !== this.provider.id) return null;
    return this.provider.webLink(rec.cloud_file_ref).catch(() => null);
  }

  async retry(recordingId: string) {
    if (!this.provider) throw new Error('cloud_unavailable');
    const f = this.d.store.getFile(recordingId);
    if (!f) throw new Error('recording_not_found');
    this.d.store.updateFile(recordingId, { status: 'pending', attempts: 0, nextAttemptAt: null, lastError: null });
    await this.d.backend.updateRecording(recordingId, { status: 'uploading', upload_progress: 0, error: null });
    void this.drain();
  }

  /** Envia o que estiver pronto, um por vez. */
  async drain() {
    if (this.running || !this.provider || this.paused) return;
    this.running = true;
    try {
      for (;;) {
        const [next] = this.d.store.nextUploads(new Date(this.now()), 1);
        if (!next || !this.provider || this.paused) break;
        await this.uploadOne(this.provider, next);
      }
    } finally {
      this.running = false;
    }
  }

  private async uploadOne(provider: CloudProvider, f: LocalFile) {
    const { backend, store, log, emit } = this.d;
    store.updateFile(f.recordingId, { status: 'uploading' });
    let lastDb = -1;
    let lastEmit = -1;
    let lastDbAt = 0;
    try {
      const size = statSync(f.path).size;
      const folderRef = await provider.ensureFolder(cloudPath(this.d.cameraName(f.cameraId), f.startedAt));
      const ref = await provider.uploadResumable({
        filePath: f.path,
        size,
        folderRef,
        name: fileName(f),
        mimeType: f.kind === 'photo' ? 'image/jpeg' : 'video/mp4',
        onProgress: (sent, total) => {
          const pct = total ? Math.min(99, Math.floor((sent / total) * 100)) : 0;
          if (pct - lastEmit >= 2) {
            lastEmit = pct;
            emit({ type: 'uploadProgress', recordingId: f.recordingId, progress: pct });
          }
          if (pct - lastDb >= 10 || this.now() - lastDbAt > 5000) {
            lastDb = pct;
            lastDbAt = this.now();
            void backend.updateRecording(f.recordingId, { upload_progress: pct }).catch(() => undefined);
          }
        },
      });
      store.updateFile(f.recordingId, { status: 'done', uploadedAt: new Date(this.now()).toISOString(), lastError: null });
      await backend.updateRecording(f.recordingId, { status: 'done', upload_progress: 100, provider: provider.id, cloud_file_ref: ref, error: null });
      emit({ type: 'uploadProgress', recordingId: f.recordingId, progress: 100 });
      await this.addUsage(size);
      log.info({ recordingId: f.recordingId, provider: provider.id }, 'enviado para a nuvem');
    } catch (e) {
      await this.onError(f, e);
    }
  }

  private async onError(f: LocalFile, e: unknown) {
    const { backend, store, log, emit } = this.d;
    const msg = (e as Error)?.message ?? String(e);
    if (e instanceof AuthExpiredError) {
      // login vencido: pausa a fila e avisa o app para conectar de novo
      this.paused = true;
      store.updateFile(f.recordingId, { status: 'pending', lastError: msg });
      await backend.updateCloud({ cloud_connected: false }).catch(() => undefined);
      log.warn({ provider: this.providerId }, 'login da nuvem expirou; conecte de novo pelo app');
      return;
    }
    const attempts = f.attempts + 1;
    const wait = BACKOFF_MS[attempts - 1];
    const missing = (e as NodeJS.ErrnoException)?.code === 'ENOENT';
    if (wait !== undefined && !missing && (e instanceof TransientError || attempts < 3)) {
      store.updateFile(f.recordingId, { status: 'pending', attempts, lastError: msg, nextAttemptAt: new Date(this.now() + wait).toISOString() });
      log.warn({ recordingId: f.recordingId, attempts, err: msg }, 'envio falhou; nova tentativa programada');
      return;
    }
    store.updateFile(f.recordingId, { status: 'failed', attempts, lastError: msg });
    const reason = missing ? 'O arquivo não está mais no hub.' : /sem espaço/.test(msg) ? 'Sem espaço na nuvem.' : 'Não foi possível enviar para a nuvem.';
    await backend.updateRecording(f.recordingId, { status: 'failed', error: reason }).catch(() => undefined);
    emit({ type: 'uploadFailed', recordingId: f.recordingId, reason });
    log.error({ recordingId: f.recordingId, err: msg }, 'envio falhou de vez');
  }

  /** Provedores sem cota (iCloud) somam o que o Nuvigia enviou. */
  private async addUsage(bytes: number) {
    if (!this.provider) return;
    const q = await this.provider.getQuota().catch(() => null);
    if (q && q.usedBytes !== null) {
      await this.d.backend.updateCloud({ cloud_used_bytes: q.usedBytes, cloud_total_bytes: q.totalBytes });
    } else {
      this.usedBytes += bytes;
      await this.d.backend.updateCloud({ cloud_used_bytes: this.usedBytes });
    }
  }

  async refreshQuota() {
    if (!this.provider || this.paused) return;
    const q = await this.provider.getQuota().catch(() => null);
    if (q && q.usedBytes !== null) await this.d.backend.updateCloud({ cloud_used_bytes: q.usedBytes, cloud_total_bytes: q.totalBytes }).catch(() => undefined);
  }

  /** Apaga da nuvem (e do app) o que passou da retenção escolhida nos Ajustes. */
  async applyRetention() {
    const days = this.d.settings()?.retention_days;
    if (!this.provider || this.paused || !days) return 0;
    const cutoff = new Date(this.now() - days * DAY);
    const rows = await this.d.backend.listCloudRecordingsBefore(cutoff.toISOString(), 200).catch(() => []);
    const mine = rows.filter((r) => r.provider === this.provider!.id && r.cloud_file_ref);
    const byRef = new Map(mine.map((r) => [r.cloud_file_ref!, r.id]));
    let removed: string[] = [];
    try {
      removed = await this.provider.deleteOlderThan(cutoff, mine.map((r) => ({ ref: r.cloud_file_ref!, startedAt: r.started_at })));
    } catch (e) {
      this.d.log.warn({ err: (e as Error).message }, 'retenção: falha ao apagar da nuvem');
    }
    for (const ref of removed) {
      const id = byRef.get(ref);
      if (!id) continue;
      forgetRecording(this.d.store, id);
      await this.d.backend.deleteRecording(id).catch(() => undefined);
    }
    if (removed.length) {
      this.d.log.info({ count: removed.length, days }, 'retenção: gravações antigas apagadas da nuvem');
      void this.refreshQuota();
    }
    return removed.length;
  }
}
