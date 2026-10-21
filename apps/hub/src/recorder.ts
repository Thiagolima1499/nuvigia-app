import { randomUUID } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { Logger } from 'pino';

import type { Backend } from './backend';
import { tailStderr, type Proc, type Spawn } from './proc';
import type { LocalStore } from './store';

export type RecordReason = 'manual' | 'motion' | 'continuous';

export type RecorderDeps = {
  backend: Backend;
  store: LocalStore;
  spawn: Spawn;
  ffmpeg: string;
  /** Pasta base dos arquivos (DATA_DIR/recordings). */
  dir: string;
  log: Logger;
  /** Este arquivo deve subir para a nuvem? (nuvem conectada e câmera com envio ligado) */
  shouldUpload: () => boolean;
  /** Avisado quando um arquivo novo está pronto para envio. */
  onFileReady?: (recordingId: string) => void;
  /** Avisado quando uma gravação termina (por tempo, parada ou falha). */
  onFinished?: (reason: RecordReason, ok: boolean) => void;
  now?: () => number;
};

type Active = { id: string; reason: RecordReason; startedAt: number; proc: Proc; path: string; maxSec: number; stopTimer?: ReturnType<typeof setTimeout> };

/** Caminho local: recordings/<câmera>/<AAAA-MM-DD>/<id>.mp4 */
export function recordingPath(base: string, cameraId: string, startedAt: Date, id: string, ext = 'mp4') {
  const day = startedAt.toISOString().slice(0, 10);
  return join(base, cameraId, day, `${id}.${ext}`);
}

export function ffmpegRecordArgs(src: string, out: string, maxSec: number): string[] {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-i', src,
    '-t', String(maxSec),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'copy',
    // áudio de câmera costuma ser G.711, que não cabe em MP4: converte para AAC
    '-c:a', 'aac', '-b:a', '64k',
    '-movflags', '+faststart',
    '-y', out,
  ];
}

/**
 * Grava uma câmera com ffmpeg a partir do RTSP local do go2rtc (sem recodificar o vídeo).
 * Uma gravação por vez por câmera; cada arquivo vira uma linha em `recordings`.
 */
export class Recorder {
  private active: Active | null = null;
  private starting: Promise<string> | null = null;
  private finishing: Promise<boolean> | null = null;

  constructor(
    readonly cameraId: string,
    private readonly src: string,
    private readonly deps: RecorderDeps,
  ) {}

  get current() {
    return this.active ? { id: this.active.id, reason: this.active.reason, startedAt: this.active.startedAt } : null;
  }

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  /** Começa a gravar. Se já estiver gravando, devolve a gravação atual. */
  start(reason: RecordReason, maxSec: number): Promise<string> {
    if (this.active) return Promise.resolve(this.active.id);
    if (!this.starting) this.starting = this.doStart(reason, maxSec).finally(() => (this.starting = null));
    return this.starting;
  }

  private async doStart(reason: RecordReason, maxSec: number): Promise<string> {
    await this.finishing;
    const { backend, log } = this.deps;
    const id = randomUUID();
    const startedAt = this.now();
    const startedIso = new Date(startedAt).toISOString();
    const path = recordingPath(this.deps.dir, this.cameraId, new Date(startedAt), id);
    mkdirSync(join(path, '..'), { recursive: true });

    await backend.insertRecording({ id, camera_id: this.cameraId, started_at: startedIso, kind: 'video', status: 'recording', duration_sec: 0 });
    await backend.updateCamera(this.cameraId, { recording: true, rec_started_at: startedIso });

    const proc = this.deps.spawn(this.deps.ffmpeg, ffmpegRecordArgs(this.src, path, maxSec));
    const stderr = tailStderr(proc);
    const active: Active = { id, reason, startedAt, proc, path, maxSec };
    this.active = active;
    log.info({ cameraId: this.cameraId, recordingId: id, reason }, 'gravação iniciada');

    proc.once('error', (err) => log.error({ err }, 'não foi possível iniciar o ffmpeg'));
    proc.once('exit', (code) => {
      this.finishing = this.finish(active, code, stderr())
        .catch((err) => {
          log.error({ err }, 'falha ao finalizar gravação');
          return false;
        })
        .then((ok) => {
          this.deps.onFinished?.(reason, ok);
          return ok;
        });
    });
    return id;
  }

  /** Para a gravação atual com calma (o ffmpeg fecha o MP4 direito). */
  async stop(): Promise<string | null> {
    const a = this.active;
    if (!a) return null;
    try {
      a.proc.stdin?.write('q');
      a.proc.stdin?.end();
    } catch {
      // stdin já fechado
    }
    a.stopTimer = setTimeout(() => a.proc.kill('SIGINT'), 5000);
    await new Promise<void>((resolve) => {
      const wait = () => (this.active === a ? setTimeout(wait, 50) : resolve());
      wait();
    });
    await this.finishing;
    return a.id;
  }

  private async finish(a: Active, code: number | null, stderr: string): Promise<boolean> {
    if (a.stopTimer) clearTimeout(a.stopTimer);
    if (this.active === a) this.active = null;
    const { backend, store, log } = this.deps;
    const durationSec = Math.max(0, Math.min(a.maxSec, Math.round((this.now() - a.startedAt) / 1000)));
    let size = 0;
    try {
      size = statSync(a.path).size;
    } catch {
      size = 0;
    }
    await backend.updateCamera(this.cameraId, { recording: false, rec_started_at: null }).catch(() => undefined);

    if (size === 0) {
      log.warn({ cameraId: this.cameraId, code, stderr: stderr.slice(-400) }, 'gravação falhou');
      await backend.updateRecording(a.id, { status: 'failed', duration_sec: durationSec, error: 'Não foi possível gravar a câmera.' });
      return false;
    }
    const upload = this.deps.shouldUpload();
    store.addFile({
      recordingId: a.id,
      cameraId: this.cameraId,
      path: a.path,
      kind: 'video',
      startedAt: new Date(a.startedAt).toISOString(),
      durationSec,
      status: upload ? 'pending' : 'local',
    });
    await backend.updateRecording(a.id, { duration_sec: durationSec, status: upload ? 'uploading' : 'done', upload_progress: 0 });
    log.info({ cameraId: this.cameraId, recordingId: a.id, durationSec, upload }, 'gravação concluída');
    if (upload) this.deps.onFileReady?.(a.id);
    return true;
  }
}
