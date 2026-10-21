import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HubEvent, SettingsRow } from '@nuvigia/shared';
import { describe, expect, it } from 'vitest';

import { AuthExpiredError, TransientError, type CloudProvider, type UploadInput } from '../cloud/provider';
import { BACKOFF_MS, cloudPath, fileName, Uploader } from '../cloud/uploader';
import { FakeBackend, HUB, memStore, silent } from './fakes';

const settle = () => new Promise((r) => setTimeout(r, 20));

class MemProvider implements CloudProvider {
  readonly id = 'google' as const;
  files = new Map<string, { folder: string; name: string; size: number }>();
  folders: string[] = [];
  failWith: Error[] = [];
  async connect() {
    return { account: 'ana@gmail.com' };
  }
  async ensureFolder(path: string[]) {
    const ref = path.join('/');
    this.folders.push(ref);
    return ref;
  }
  async uploadResumable(u: UploadInput) {
    const err = this.failWith.shift();
    if (err) throw err;
    u.onProgress?.(u.size / 2, u.size);
    u.onProgress?.(u.size, u.size);
    const ref = `ref-${this.files.size + 1}`;
    this.files.set(ref, { folder: u.folderRef, name: u.name, size: u.size });
    return ref;
  }
  async deleteFile(ref: string) {
    this.files.delete(ref);
  }
  async deleteOlderThan(cutoff: Date, files: { ref: string; startedAt: string }[]) {
    const old = files.filter((f) => Date.parse(f.startedAt) < cutoff.getTime()).map((f) => f.ref);
    old.forEach((r) => this.files.delete(r));
    return old;
  }
  async getQuota() {
    return { usedBytes: 1000, totalBytes: 15_000 };
  }
}

const settingsRow = (patch: Partial<SettingsRow> = {}): SettingsRow => ({
  hub_id: HUB,
  owner_id: 'ana',
  quality: '1080p',
  record_mode: 'motion',
  wifi_only: true,
  notify_motion: true,
  retention_days: 30,
  cloud_provider: null,
  cloud_connected: false,
  cloud_account: null,
  cloud_used_bytes: 0,
  cloud_total_bytes: null,
  cloud_folder_ref: null,
  updated_at: '',
  ...patch,
});

function fixture() {
  let now = Date.parse('2026-10-21T13:00:00Z');
  const backend = new FakeBackend();
  const store = memStore();
  const provider = new MemProvider();
  const events: HubEvent[] = [];
  let settings = settingsRow();
  const up = new Uploader({
    backend,
    store,
    log: silent,
    makeProvider: () => provider,
    cameraName: () => 'Portão',
    settings: () => settings,
    emit: (e) => events.push(e),
    now: () => now,
  });
  const dir = mkdtempSync(join(tmpdir(), 'nuvigia-up-'));
  const addFile = async (id: string, startedAt = '2026-10-21T10:15:00.000Z', status: 'pending' | 'local' = 'pending') => {
    const path = join(dir, `${id}.mp4`);
    writeFileSync(path, Buffer.alloc(500));
    await backend.insertRecording({ id, camera_id: 'cam-1', started_at: startedAt, kind: 'video', status: status === 'pending' ? 'uploading' : 'done' });
    store.addFile({ recordingId: id, cameraId: 'cam-1', path, kind: 'video', startedAt, durationSec: 30, status });
  };
  return {
    up,
    backend,
    store,
    provider,
    events,
    addFile,
    advance: (ms: number) => (now += ms),
    setSettings: (p: Partial<SettingsRow>) => (settings = settingsRow(p)),
  };
}

describe('caminho na nuvem', () => {
  it('Nuvigia/{Câmera}/{AAAA-MM-DD} e nome pela hora', () => {
    expect(cloudPath('Portão/Frente', '2026-10-21T10:15:00Z')).toEqual(['Nuvigia', 'Portão-Frente', '2026-10-21']);
    expect(fileName({ startedAt: '2026-10-21T10:15:07.000Z', kind: 'video', path: '/x/abc.mp4' })).toBe('10-15-07.mp4');
    expect(fileName({ startedAt: '2026-10-21T10:15:07.000Z', kind: 'photo', path: '/x/abc.jpg' })).toBe('10-15-07-foto.jpg');
  });
});

describe('fila de envio', () => {
  it('conecta, envia e publica o progresso', async () => {
    const f = fixture();
    await f.up.connect({ type: 'connectCloud', provider: 'google', code: 'c', codeVerifier: 'v', redirectUri: 'r', clientId: 'id' });
    expect(f.backend.cloudPatches[0]).toMatchObject({ cloud_provider: 'google', cloud_connected: true, cloud_account: 'ana@gmail.com', cloud_used_bytes: 1000, cloud_total_bytes: 15_000 });
    await f.addFile('r1');
    await f.up.drain();
    const rec = f.backend.recordings.get('r1')!;
    expect(rec).toMatchObject({ status: 'done', upload_progress: 100, provider: 'google', cloud_file_ref: 'ref-1' });
    expect(f.provider.files.get('ref-1')).toEqual({ folder: 'Nuvigia/Portão/2026-10-21', name: '10-15-00.mp4', size: 500 });
    expect(f.events.filter((e) => e.type === 'uploadProgress').map((e) => (e as { progress: number }).progress)).toEqual([50, 99, 100]);
    expect(f.store.getFile('r1')?.status).toBe('done');
  });

  it('erro passageiro: tenta de novo depois do intervalo', async () => {
    const f = fixture();
    await f.up.connect({ type: 'connectCloud', provider: 'google' });
    await f.addFile('r1');
    f.provider.failWith.push(new TransientError('503'));
    await f.up.drain();
    expect(f.store.getFile('r1')).toMatchObject({ status: 'pending', attempts: 1 });
    await f.up.drain();
    expect(f.provider.files.size).toBe(0); // ainda esperando
    f.advance(BACKOFF_MS[0]!);
    await f.up.drain();
    expect(f.backend.recordings.get('r1')?.status).toBe('done');
  });

  it('desiste depois das tentativas e avisa o app', async () => {
    const f = fixture();
    await f.up.connect({ type: 'connectCloud', provider: 'google' });
    await f.addFile('r1');
    for (let i = 0; i < 3; i++) {
      f.provider.failWith.push(new Error('google: 400 arquivo inválido'));
      await f.up.drain();
      f.advance(4 * 60 * 60_000);
    }
    expect(f.store.getFile('r1')?.status).toBe('failed');
    expect(f.backend.recordings.get('r1')).toMatchObject({ status: 'failed', error: 'Não foi possível enviar para a nuvem.' });
    expect(f.events.at(-1)).toEqual({ type: 'uploadFailed', recordingId: 'r1', reason: 'Não foi possível enviar para a nuvem.' });

    await f.up.retry('r1');
    await settle();
    expect(f.backend.recordings.get('r1')?.status).toBe('done');
  });

  it('login expirado pausa a fila e marca a nuvem como desconectada', async () => {
    const f = fixture();
    await f.up.connect({ type: 'connectCloud', provider: 'google' });
    await f.addFile('r1');
    f.provider.failWith.push(new AuthExpiredError('google'));
    await f.up.drain();
    expect(f.up.isConnected()).toBe(false);
    expect(f.backend.cloudPatches.at(-1)).toEqual({ cloud_connected: false });
    expect(f.store.getFile('r1')?.status).toBe('pending');
    // conectar de novo retoma
    await f.up.connect({ type: 'connectCloud', provider: 'google' });
    await settle();
    expect(f.backend.recordings.get('r1')?.status).toBe('done');
  });

  it('desconectar deixa a fila só no hub', async () => {
    const f = fixture();
    await f.up.connect({ type: 'connectCloud', provider: 'google' });
    f.store.setCloudToken('google', { x: 1 });
    await f.addFile('r1');
    f.provider.failWith.push(new TransientError('503'));
    await f.up.drain();
    await f.up.disconnect();
    expect(f.store.getFile('r1')?.status).toBe('local');
    expect(f.backend.recordings.get('r1')?.status).toBe('done');
    expect(f.store.getCloudToken('google')).toBeNull();
    expect(f.backend.cloudPatches.at(-1)).toMatchObject({ cloud_provider: null, cloud_connected: false });
    await expect(f.up.retry('r1')).rejects.toThrow('cloud_unavailable');
  });

  it('retenção apaga da nuvem o que passou de 30 dias', async () => {
    const f = fixture();
    await f.up.connect({ type: 'connectCloud', provider: 'google' });
    await f.addFile('velho', '2026-09-01T10:00:00.000Z');
    await f.addFile('novo', '2026-10-20T10:00:00.000Z');
    await f.up.drain();
    expect(f.provider.files.size).toBe(2);
    expect(await f.up.applyRetention()).toBe(1);
    expect(f.backend.recordings.has('velho')).toBe(false);
    expect(f.backend.recordings.has('novo')).toBe(true);
    expect(f.store.getFile('velho')).toBeNull();

    f.setSettings({ retention_days: null }); // "nunca apagar"
    expect(await f.up.applyRetention()).toBe(0);
  });

  it('retoma provedor salvo e devolve à fila envios interrompidos', async () => {
    const f = fixture();
    f.setSettings({ cloud_provider: 'google', cloud_connected: true });
    f.store.setCloudToken('google', { accessToken: 'a' });
    await f.addFile('r1');
    f.store.updateFile('r1', { status: 'uploading' });
    f.up.start();
    await f.up.drain();
    await f.up.stop();
    expect(f.up.isConnected()).toBe(true);
    expect(f.backend.recordings.get('r1')?.status).toBe('done');
  });
});
