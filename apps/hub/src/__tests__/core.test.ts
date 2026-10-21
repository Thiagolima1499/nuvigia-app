import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { parseKey, Secrets } from '../crypto';
import { frameDiff, MotionGate } from '../motion';
import { pickProfile, redact, withCredentials } from '../onvif';
import { memStore, testSecrets } from './fakes';

describe('crypto', () => {
  const s = testSecrets();

  it('cifra e decifra', () => {
    const box = s.encrypt('senha-da-camera');
    expect(box).not.toContain('senha');
    expect(s.decrypt(box)).toBe('senha-da-camera');
  });

  it('usa IV novo a cada vez', () => {
    expect(s.encrypt('x')).not.toBe(s.encrypt('x'));
  });

  it('recusa dado adulterado, chave errada e AAD diferente', () => {
    const box = s.encrypt('segredo', 'camera:1');
    const parts = box.split('.');
    const flipped = Buffer.from(parts[3]!, 'base64url');
    flipped[0] = flipped[0]! ^ 1;
    parts[3] = flipped.toString('base64url');
    expect(() => s.decrypt(parts.join('.'), 'camera:1')).toThrow();
    expect(() => new Secrets(Buffer.alloc(32, 9)).decrypt(box, 'camera:1')).toThrow();
    expect(() => s.decrypt(box, 'camera:2')).toThrow();
  });

  it('lê chave em base64 e hex e recusa tamanho errado', () => {
    expect(parseKey(Buffer.alloc(32, 1).toString('base64')).length).toBe(32);
    expect(parseKey('ab'.repeat(32)).length).toBe(32);
    expect(() => parseKey('curta')).toThrow(/32 bytes/);
  });
});

describe('config', () => {
  const base = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'x'.repeat(40), HUB_SECRET_KEY: Buffer.alloc(32).toString('base64') };

  it('aplica padrões', () => {
    const c = loadConfig(base);
    expect(c.HTTP_PORT).toBe(8787);
    expect(c.SEGMENT_SECONDS).toBe(300);
    expect(c.MDNS).toBe(true);
  });

  it('explica o que falta', () => {
    expect(() => loadConfig({})).toThrow(/SUPABASE_URL/);
  });
});

describe('store', () => {
  it('guarda identidade e credenciais da câmera cifradas', () => {
    const st = memStore();
    st.setIdentity({ hubId: 'h1', email: 'hub@x', password: 'p4ss-secreta' });
    st.setCameraSecret('c1', { rtspUrl: 'rtsp://admin:minhasenha@10.0.0.2/stream1', username: 'admin', password: 'minhasenha' });
    expect(st.getIdentity()?.password).toBe('p4ss-secreta');
    expect(st.getCameraSecret('c1')?.password).toBe('minhasenha');
    // o que vai para o disco não tem a senha em claro
    const raw = (st as unknown as { db: { prepare: (q: string) => { all: () => unknown[] } } }).db.prepare('select * from camera_secrets union all select key, value from kv').all();
    expect(JSON.stringify(raw)).not.toMatch(/minhasenha|p4ss-secreta/);
    expect(st.cameraIds()).toEqual(['c1']);
  });

  it('fila de arquivos e limpeza', () => {
    const st = memStore();
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    st.addFile({ recordingId: 'r1', cameraId: 'c1', path: '/x/r1.mp4', kind: 'video', startedAt: old, durationSec: 30, status: 'pending' });
    st.addFile({ recordingId: 'r2', cameraId: 'c1', path: '/x/r2.mp4', kind: 'video', startedAt: old, durationSec: 30, status: 'local' });
    expect(st.nextUploads(new Date()).map((f) => f.recordingId)).toEqual(['r1']);
    st.updateFile('r1', { status: 'done', uploadedAt: old });
    const expired = st.expiredFiles(new Date(Date.now() - 3 * 86_400_000), new Date(Date.now() - 30 * 86_400_000));
    expect(expired.map((f) => f.recordingId).sort()).toEqual(['r1', 'r2']);
    // sem retenção ("nunca apagar"), arquivos só locais ficam
    expect(st.expiredFiles(new Date(0), null)).toEqual([]);
  });
});

describe('movimento', () => {
  it('mede a fração de pixels que mudou', () => {
    const a = new Uint8Array(100);
    const b = new Uint8Array(100);
    b.fill(200, 0, 10);
    expect(frameDiff(a, b)).toBeCloseTo(0.1);
    expect(frameDiff(a, a)).toBe(0);
  });

  it('dispara após dois quadros seguidos e respeita o intervalo', () => {
    const gate = new MotionGate(0.05, 10_000);
    const dark = new Uint8Array(100);
    const light = new Uint8Array(100).fill(255);
    expect(gate.push(dark, 0)).toBe(false);
    expect(gate.push(light, 500)).toBe(false);
    expect(gate.push(dark, 1000)).toBe(true);
    expect(gate.push(light, 1500)).toBe(false);
    expect(gate.push(dark, 2000)).toBe(false); // ainda no intervalo
    expect(gate.push(light, 12_000)).toBe(true);
  });

  it('ignora ruído pequeno', () => {
    const gate = new MotionGate(0.05, 0);
    const a = new Uint8Array(100).fill(100);
    const b = new Uint8Array(100).fill(110);
    for (let i = 0; i < 5; i++) expect(gate.push(i % 2 ? a : b, i * 500)).toBe(false);
  });
});

describe('onvif helpers', () => {
  const profiles = [
    { token: 'sub', width: 640, height: 360 },
    { token: 'main', width: 2560, height: 1440 },
    { token: 'mid', width: 1920, height: 1080 },
  ];
  it('escolhe o perfil pela qualidade', () => {
    expect(pickProfile(profiles, 1080)?.token).toBe('mid');
    expect(pickProfile(profiles, 1440)?.token).toBe('main');
    expect(pickProfile(profiles, 720)?.token).toBe('sub');
    expect(pickProfile([{ token: 'big', width: 3840, height: 2160 }], 720)?.token).toBe('big');
    expect(pickProfile([], 720)).toBeUndefined();
  });

  it('põe e esconde credenciais na URL', () => {
    const url = withCredentials('rtsp://10.0.0.2:554/stream1', 'admin', 'p@ss:word');
    expect(url).toBe('rtsp://admin:p%40ss%3Aword@10.0.0.2:554/stream1');
    expect(redact(url)).toBe('rtsp://***@10.0.0.2:554/stream1');
    expect(withCredentials('rtsp://10.0.0.2/s')).toBe('rtsp://10.0.0.2/s');
  });
});
