import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CameraManager } from '../cameras';
import { HubChannel } from '../channel';
import { handleCommand } from '../commands';
import { Go2rtc, streamName } from '../go2rtc';
import { renderStatus } from '../http';
import { registerHub } from '../identity';
import { cleanLocalFiles } from '../janitor';
import { CameraAuthError, type OnvifService } from '../onvif';
import { Pairing } from '../pairing';
import { Recorder } from '../recorder';
import { FakeBackend, FakeCloud, FakeProc, memStore, silent } from './fakes';

const tmp = () => mkdtempSync(join(tmpdir(), 'nuvigia-hub-'));
const flush = () => new Promise((r) => setTimeout(r, 10));

afterEach(() => vi.useRealTimers());

// ------------------------------------------------------------------ pareamento
describe('pareamento', () => {
  it('gera código, renova antes de vencer e para quando alguém pareia', async () => {
    vi.useFakeTimers();
    const backend = new FakeBackend();
    let now = Date.now();
    backend.now = () => now;
    backend.codeTtlMs = 60_000;
    const p = new Pairing(backend, silent, { printQr: false, now: () => now });
    let paired = false;
    void p.start().then(() => (paired = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(p.state).toMatchObject({ status: 'waiting', code: '100001', url: 'nuvigia://parear?codigo=100001' });

    now += 10_000;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(backend.codes).toBe(1); // ainda vale

    now += 25_000; // faltam < 30 s
    await vi.advanceTimersByTimeAsync(5_000);
    expect(backend.codes).toBe(2);

    backend.owner = 'ana';
    await vi.advanceTimersByTimeAsync(5_000);
    expect(p.state.status).toBe('paired');
    expect(paired).toBe(true);
    p.stop();
  });

  it('já pareado: resolve na hora sem gerar código', async () => {
    const backend = new FakeBackend();
    backend.owner = 'ana';
    await new Pairing(backend, silent, { printQr: false }).start();
    expect(backend.codes).toBe(0);
  });
});

describe('página local', () => {
  it('mostra o código, o QR e escapa texto', async () => {
    const p = new Pairing(new FakeBackend(), silent, { printQr: false });
    p.state = { status: 'waiting', code: '123456', expiresAt: new Date().toISOString(), url: 'nuvigia://parear?codigo=123456' };
    const html = await renderStatus(p);
    expect(html).toContain('123 456');
    expect(html).toContain('<svg');
    expect(html).toContain('lang="pt-BR"');
    p.state = { status: 'error', message: '<script>' };
    expect(await renderStatus(p)).not.toContain('<script>');
  });
});

// -------------------------------------------------------------------- registro
describe('registro do hub', () => {
  const cfg = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'anon', HUB_REGISTRATION_SECRET: 's3', HUB_NAME: 'Casa', version: '0.1.0' };

  it('chama hub-register com o segredo e devolve a identidade', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ hubId: 'h', email: 'e', password: 'p' })));
    const id = await registerHub(cfg, fetchMock as unknown as typeof fetch);
    expect(id).toEqual({ hubId: 'h', email: 'e', password: 'p' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://abc.supabase.co/functions/v1/hub-register');
    expect((init.headers as Record<string, string>)['x-hub-registration-secret']).toBe('s3');
  });

  it('explica erro do servidor e falta de rede', async () => {
    await expect(registerHub(cfg, (async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch)).rejects.toThrow(/403/);
    await expect(
      registerHub(cfg, (async () => {
        throw new Error('fetch failed');
      }) as unknown as typeof fetch),
    ).rejects.toThrow(/não foi possível falar com o Supabase/);
  });
});

// ---------------------------------------------------------------------- go2rtc
describe('go2rtc', () => {
  it('monta as chamadas da API', async () => {
    const calls: string[] = [];
    const f = (async (u: URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${u.toString()}`);
      return new Response('{}');
    }) as unknown as typeof fetch;
    const g = new Go2rtc('http://go2rtc:1984', 'rtsp://go2rtc:8554', f);
    await g.addStream('a-b', 'rtsp://u:p@10.0.0.2/s');
    await g.removeStream('a-b');
    expect(streamName('a-b')).toBe('cam_ab');
    expect(calls[0]).toBe('PUT http://go2rtc:1984/api/streams?name=cam_ab&src=rtsp%3A%2F%2Fu%3Ap%4010.0.0.2%2Fs');
    expect(calls[1]).toBe('DELETE http://go2rtc:1984/api/streams?src=cam_ab');
    expect(g.localRtsp('a-b')).toBe('rtsp://go2rtc:8554/cam_ab');
  });
});

// -------------------------------------------------------------------- gravação
function recorderFixture(opts: { writeFile: boolean; upload: boolean }) {
  const backend = new FakeBackend();
  const store = memStore();
  const dir = tmp();
  const procs: FakeProc[] = [];
  const finished: boolean[] = [];
  const rec = new Recorder('cam-1', 'rtsp://go2rtc:8554/cam_1', {
    backend,
    store,
    dir,
    log: silent,
    ffmpeg: 'ffmpeg',
    shouldUpload: () => opts.upload,
    onFinished: (_r, ok) => finished.push(ok),
    spawn: (cmd, args) => {
      const p = new FakeProc(cmd, args, () => {
        if (opts.writeFile) writeFileSync(args.at(-1)!, 'mp4');
      });
      procs.push(p);
      return p;
    },
  });
  return { backend, store, rec, procs, finished };
}

describe('gravador', () => {
  it('grava, para com "q" e coloca na fila de envio', async () => {
    const { backend, store, rec, procs, finished } = recorderFixture({ writeFile: true, upload: true });
    const id = await rec.start('manual', 3600);
    expect(await rec.start('manual', 3600)).toBe(id); // uma por vez
    expect(backend.recordings.get(id)?.status).toBe('recording');
    expect(backend.cameraPatches.at(-1)?.patch.recording).toBe(true);
    expect(procs[0]!.args).toContain('rtsp://go2rtc:8554/cam_1');
    expect(procs[0]!.args).toContain('-c:v');

    await rec.stop();
    expect(backend.recordings.get(id)?.status).toBe('uploading');
    expect(store.getFile(id)?.status).toBe('pending');
    expect(backend.cameraPatches.at(-1)?.patch).toMatchObject({ recording: false, rec_started_at: null });
    expect(finished).toEqual([true]);
  });

  it('sem nuvem fica só no hub', async () => {
    const { backend, store, rec } = recorderFixture({ writeFile: true, upload: false });
    const id = await rec.start('motion', 30);
    await rec.stop();
    expect(backend.recordings.get(id)?.status).toBe('done');
    expect(store.getFile(id)?.status).toBe('local');
  });

  it('marca como falha quando o ffmpeg não gera arquivo', async () => {
    const { backend, store, rec, procs, finished } = recorderFixture({ writeFile: false, upload: true });
    const id = await rec.start('continuous', 300);
    procs[0]!.exit(1);
    await flush();
    await flush();
    expect(backend.recordings.get(id)?.status).toBe('failed');
    expect(store.getFile(id)).toBeNull();
    expect(finished).toEqual([false]);
  });
});

// -------------------------------------------------------------------- câmeras
function camerasFixture(onvif: Partial<OnvifService>, reachable = true) {
  const backend = new FakeBackend();
  backend.owner = 'ana';
  const store = memStore();
  const cloud = new FakeCloud();
  const events: unknown[] = [];
  const streams = new Set<string>();
  const go2rtc = {
    addStream: async (id: string) => void streams.add(id),
    removeStream: async (id: string) => void streams.delete(id),
    snapshot: async () => Buffer.from('jpeg'),
    localRtsp: (id: string) => `rtsp://go2rtc:8554/${streamName(id)}`,
  };
  let online = reachable;
  const procs: FakeProc[] = [];
  const mgr = new CameraManager({
    cfg: { FFMPEG_PATH: 'ffmpeg', DATA_DIR: tmp(), SEGMENT_SECONDS: 300, MOTION_CLIP_SECONDS: 30, MOTION_SENSITIVITY: 0.02, MAX_MANUAL_SECONDS: 3600 },
    backend,
    store,
    go2rtc: go2rtc as never,
    onvif: onvif as OnvifService,
    cloud,
    spawn: (cmd, args) => {
      const p = new FakeProc(cmd, args);
      procs.push(p);
      return p;
    },
    log: silent,
    emit: (e) => events.push(e),
    reachable: async () => online,
  });
  return { mgr, backend, store, cloud, events, streams, procs, setOnline: (v: boolean) => (online = v) };
}

const probeOk = async () => ({ model: 'TP-Link Tapo C200', rtspUrl: 'rtsp://admin:segredo@192.168.0.22:554/stream1', profileToken: 'main', supportsTalk: true, port: 2020 });

describe('câmeras', () => {
  it('adiciona por ONVIF: progresso, segredo só no hub e linha no Supabase', async () => {
    const { mgr, backend, store, streams } = camerasFixture({ probe: probeOk, watchMotion: async () => ({ events: new (await import('node:events')).EventEmitter(), close: () => undefined }) });
    await mgr.start(null);
    const steps: number[] = [];
    const r = await mgr.add({ type: 'addCamera', name: 'Portão', room: 'Entrada', ip: '192.168.0.22', username: 'admin', password: 'segredo', uploadToCloud: true }, (s) => steps.push(s));
    expect(steps).toEqual([2, 3]);
    expect(r.camera).toMatchObject({ name: 'Portão', model: 'TP-Link Tapo C200', ip: '192.168.0.22', rtspUrl: '' });
    expect(JSON.stringify(backend.cameras)).not.toContain('segredo');
    expect(store.getCameraSecret(r.cameraId)?.rtspUrl).toContain('segredo');
    expect(streams.has(r.cameraId)).toBe(true);
    await mgr.stop();
  });

  it('senha errada vira auth_failed; câmera fora do ar vira camera_unreachable', async () => {
    const auth = camerasFixture({
      probe: async () => {
        throw new CameraAuthError();
      },
    });
    await expect(auth.mgr.add({ type: 'addCamera', name: 'X', room: '', ip: '10.0.0.9', uploadToCloud: true }, () => undefined)).rejects.toThrow('auth_failed');

    const down = camerasFixture(
      {
        probe: async () => {
          throw new Error('timeout');
        },
      },
      false,
    );
    await expect(down.mgr.add({ type: 'addCamera', name: 'X', room: '', ip: '10.0.0.9', uploadToCloud: true }, () => undefined)).rejects.toThrow('camera_unreachable');
    await expect(down.mgr.add({ type: 'addCamera', name: 'X', room: '', ip: '', rtspUrl: 'rtsp://10.0.0.9/s', uploadToCloud: true }, () => undefined)).rejects.toThrow('camera_unreachable');
    await expect(down.mgr.add({ type: 'addCamera', name: 'X', room: '', ip: '', rtspUrl: 'http://x', uploadToCloud: true }, () => undefined)).rejects.toThrow('invalid_rtsp_url');
  });

  it('avisa quando a câmera cai e volta', async () => {
    const f = camerasFixture({});
    f.backend.cameras.push({ id: 'cam-1', hub_id: f.backend.hubId, owner_id: 'ana', name: 'Sala', room: 'Sala', model: 'M', ip: '10.0.0.2', online: true, recording: false, rec_started_at: null, record_mode: 'motion', upload_to_cloud: true, supports_talk: false, created_at: '' });
    f.store.setCameraSecret('cam-1', { rtspUrl: 'rtsp://10.0.0.2/s' });
    await f.mgr.start(null);
    f.setOnline(false);
    await f.mgr.checkHealth();
    f.setOnline(true);
    await f.mgr.checkHealth();
    expect(f.events).toEqual([
      { type: 'cameraStatus', cameraId: 'cam-1', online: false },
      { type: 'cameraStatus', cameraId: 'cam-1', online: true },
    ]);
    expect(f.backend.events.map((e) => e.type)).toEqual(['reconnected']);
    await f.mgr.stop();
  });

  it('foto vira gravação do tipo foto com miniatura', async () => {
    const f = camerasFixture({});
    f.backend.cameras.push({ id: 'cam-1', hub_id: f.backend.hubId, owner_id: 'ana', name: 'Sala', room: 'Sala', model: 'M', ip: '10.0.0.2', online: true, recording: false, rec_started_at: null, record_mode: 'motion', upload_to_cloud: true, supports_talk: false, created_at: '' });
    f.store.setCameraSecret('cam-1', { rtspUrl: 'rtsp://10.0.0.2/s' });
    f.cloud.connected = true;
    await f.mgr.start(null);
    const { recordingId } = await f.mgr.snapshot('cam-1');
    const rec = f.backend.recordings.get(recordingId)!;
    expect(rec).toMatchObject({ kind: 'photo', status: 'uploading' });
    expect(rec.thumbnail_path).toContain(recordingId);
    const file = f.store.getFile(recordingId)!;
    expect(readFileSync(file.path, 'utf8')).toBe('jpeg');
    expect(f.cloud.ready).toEqual([recordingId]);
    await expect(f.mgr.snapshot('nope')).rejects.toThrow('camera_not_found');
    await f.mgr.stop();
  });

  it('modo contínuo grava em segmentos; voltar para movimento para a gravação', async () => {
    const f = camerasFixture({});
    f.backend.cameras.push({ id: 'cam-1', hub_id: f.backend.hubId, owner_id: 'ana', name: 'Sala', room: 'Sala', model: 'M', ip: '10.0.0.2', online: true, recording: false, rec_started_at: null, record_mode: 'motion', upload_to_cloud: false, supports_talk: false, created_at: '' });
    f.store.setCameraSecret('cam-1', { rtspUrl: 'rtsp://10.0.0.2/s' });
    await f.mgr.start(null);
    const motionProc = f.procs.find((p) => p.args.includes('rawvideo'));
    expect(motionProc).toBeDefined();
    await f.mgr.applySettings({ record_mode: 'continuous', quality: '1080p' });
    await flush();
    const seg = f.procs.find((p) => p.args.includes('300'));
    expect(seg).toBeDefined();
    expect(motionProc!.killed).toBe(true);
    await f.mgr.applySettings({ record_mode: 'motion', quality: '1080p' });
    await flush();
    expect([...f.backend.recordings.values()].every((r) => r.status !== 'recording')).toBe(true);
    await f.mgr.stop();
  });
});

// ------------------------------------------------------------------- comandos
describe('comandos', () => {
  const deps = () => {
    const f = camerasFixture({ discover: async (cb: (c: { ip: string; model: string; port: number }) => void) => (cb({ ip: '10.0.0.5', model: 'Câmera ONVIF', port: 80 }), 1) } as never);
    return { f, deps: { version: '0.1.0', backend: f.backend, cameras: f.mgr, cloud: f.cloud, onvif: f.mgr['d'].onvif, log: silent } };
  };

  it('ping e descoberta', async () => {
    const { deps: d } = deps();
    const emitted: unknown[] = [];
    expect(await handleCommand({ type: 'ping' }, d, () => undefined)).toEqual({ version: '0.1.0', cameras: 0 });
    expect(await handleCommand({ type: 'discoverCameras' }, d, (e) => emitted.push(e))).toEqual({ count: 1 });
    expect(emitted).toEqual([
      { type: 'cameraDiscovered', model: 'Câmera ONVIF', ip: '10.0.0.5', needsCredentials: true },
      { type: 'discoveryFinished', count: 1 },
    ]);
  });

  it('falar pela câmera: câmera desconhecida', async () => {
    const { deps: d } = deps();
    await expect(handleCommand({ type: 'startTalk', cameraId: 'x' }, d, () => undefined)).rejects.toThrow('camera_not_found');
  });

  it('canal: valida, responde e esconde erros internos', async () => {
    const sent: { event: string; payload: unknown }[] = [];
    const fakeChannel = {
      on: () => fakeChannel,
      subscribe: () => fakeChannel,
      send: async (m: { event: string; payload: unknown }) => {
        sent.push(m);
        return 'ok';
      },
    };
    const sb = { channel: () => fakeChannel, removeChannel: async () => 'ok' };
    const run = vi.fn(async (cmd: { type: string }) => {
      if (cmd.type === 'snapshot') throw new Error('boom com detalhes internos');
      if (cmd.type === 'stopRecording') throw new Error('camera_not_found');
      return { pong: true };
    });
    const ch = new HubChannel(sb as never, 'h', run as never, silent);
    ch.start();
    await ch.onCommand({ requestId: 'r1', command: { type: 'ping' } });
    await ch.onCommand({ requestId: 'r2', command: { type: 'naoExiste' } });
    await ch.onCommand({ requestId: 'r3', command: { type: 'snapshot', cameraId: 'c' } });
    await ch.onCommand({ requestId: 'r4', command: { type: 'stopRecording', cameraId: 'c' } });
    await ch.onCommand({ nada: true });
    expect(sent.map((s) => s.payload)).toEqual([
      { requestId: 'r1', ok: true, data: { pong: true } },
      { requestId: 'r2', ok: false, error: 'invalid_command' },
      { requestId: 'r3', ok: false, error: 'internal' },
      { requestId: 'r4', ok: false, error: 'camera_not_found' },
    ]);
    expect(sent.every((s) => s.event === 'command_result')).toBe(true);
  });
});

// -------------------------------------------------------------------- limpeza
describe('limpeza do disco', () => {
  it('apaga enviados antigos e locais vencidos', async () => {
    const store = memStore();
    const backend = new FakeBackend();
    const dir = tmp();
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const mk = (id: string, status: 'done' | 'local' | 'pending') => {
      const path = join(dir, `${id}.mp4`);
      writeFileSync(path, 'x');
      store.addFile({ recordingId: id, cameraId: 'c', path, kind: 'video', startedAt: old, durationSec: 1, status });
      if (status === 'done') store.updateFile(id, { uploadedAt: old });
      return path;
    };
    const sent = mk('enviado', 'done');
    const local = mk('local', 'local');
    const pending = mk('pendente', 'pending');
    expect(await cleanLocalFiles({ store, backend, keepDays: 3, retentionDays: 30, log: silent })).toBe(2);
    expect(existsSync(sent)).toBe(false);
    expect(existsSync(local)).toBe(false);
    expect(existsSync(pending)).toBe(true);
    expect(backend.deletedRecordings).toEqual(['local']);
  });
});
