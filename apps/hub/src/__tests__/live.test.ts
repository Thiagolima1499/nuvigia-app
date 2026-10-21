import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SignalMessage } from '@nuvigia/shared';
import { afterAll, describe, expect, it } from 'vitest';

import { handleCommand } from '../commands';
import { startHttp } from '../http';
import { LinkSigner } from '../links';
import { LiveService } from '../live';
import { Pairing } from '../pairing';
import { FakeBackend, FakeCloud, memStore, silent } from './fakes';

const signer = new LinkSigner(Buffer.alloc(32, 3));

describe('links assinados', () => {
  it('valida tipo, assinatura e validade', () => {
    const now = Date.now();
    const { token } = signer.sign('hls', 'cam-1', 60, now);
    expect(signer.verify(token, 'hls', now)?.id).toBe('cam-1');
    expect(signer.verify(token, 'file', now)).toBeNull();
    expect(signer.verify(token, 'hls', now + 61_000)).toBeNull();
    const [body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ k: 'hls', id: 'cam-2', exp: 9e9 })).toString('base64url');
    expect(signer.verify(`${forged}.${mac}`, 'hls', now)).toBeNull();
    expect(signer.verify(`${body}.x`, 'hls', now)).toBeNull();
    expect(new LinkSigner(Buffer.alloc(32, 4)).verify(token, 'hls', now)).toBeNull();
  });
});

describe('sinalização WebRTC', () => {
  const make = (online = true, fail = false) => {
    const sent: SignalMessage[] = [];
    const offers: string[] = [];
    const live = new LiveService({
      go2rtc: {
        webrtcAnswer: async (_id, sdp) => {
          if (fail) throw new Error('500');
          offers.push(sdp);
          return 'v=0 resposta';
        },
      },
      hasCamera: (id) => id === 'cam-1',
      isOnline: () => online,
      send: async (m) => void sent.push(m),
      log: silent,
    });
    return { live, sent, offers };
  };

  it('repassa a oferta ao go2rtc e devolve a resposta uma vez só', async () => {
    const { live, sent, offers } = make();
    const offer = { type: 'offer', sessionId: 's1', cameraId: 'cam-1', sdp: 'v=0 oferta' };
    await live.onSignal(offer);
    await live.onSignal(offer);
    await live.onSignal({ type: 'answer', sessionId: 's1', sdp: 'eco' }); // eco ignorado
    await live.onSignal({ lixo: true });
    expect(offers).toEqual(['v=0 oferta']);
    expect(sent).toEqual([{ type: 'answer', sessionId: 's1', sdp: 'v=0 resposta' }]);
  });

  it('erros: câmera desconhecida, offline e go2rtc recusando', async () => {
    const a = make();
    await a.live.onSignal({ type: 'offer', sessionId: 's1', cameraId: 'x', sdp: 'v=0' });
    const b = make(false);
    await b.live.onSignal({ type: 'offer', sessionId: 's2', cameraId: 'cam-1', sdp: 'v=0' });
    const c = make(true, true);
    await c.live.onSignal({ type: 'offer', sessionId: 's3', cameraId: 'cam-1', sdp: 'v=0' });
    expect([a.sent[0], b.sent[0], c.sent[0]]).toEqual([
      { type: 'error', sessionId: 's1', error: 'camera_not_found' },
      { type: 'error', sessionId: 's2', error: 'camera_offline' },
      { type: 'error', sessionId: 's3', error: 'stream_failed' },
    ]);
  });
});

describe('comandos do ao vivo', () => {
  const cameras = {
    has: (id: string) => id === 'cam-1',
    list: () => [{ id: 'cam-1' }, { id: 'cam-2' }],
    supportsTalk: (id: string) => id === 'cam-1',
  };
  const base = (publicUrl?: string) => {
    const store = memStore();
    const cloud = new FakeCloud();
    return { store, cloud, deps: { version: '1', backend: new FakeBackend(), cameras: cameras as never, cloud, onvif: {} as never, log: silent, publicUrl, signer, store } };
  };

  it('HLS só com túnel', async () => {
    await expect(handleCommand({ type: 'liveHls', cameraId: 'cam-1' }, base().deps, () => undefined)).rejects.toThrow('hls_unavailable');
    const r = (await handleCommand({ type: 'liveHls', cameraId: 'cam-1' }, base('https://hub.exemplo.com/').deps, () => undefined)) as { url: string };
    expect(r.url).toMatch(/^https:\/\/hub\.exemplo\.com\/hls\/[^/]+\/api\/stream\.m3u8$/);
  });

  it('gravação: pelo hub quando o arquivo está lá, senão o link do provedor', async () => {
    const withTunnel = base('https://hub.exemplo.com');
    withTunnel.store.addFile({ recordingId: 'r1', cameraId: 'cam-1', path: '/x.mp4', kind: 'video', startedAt: new Date().toISOString(), durationSec: 1, status: 'done' });
    const a = (await handleCommand({ type: 'recordingLink', recordingId: 'r1' }, withTunnel.deps, () => undefined)) as { kind: string; url: string };
    expect(a.kind).toBe('stream');
    expect(a.url).toContain('/files/');

    const noTunnel = base();
    noTunnel.cloud.link = 'https://drive.google.com/file/d/abc/view';
    expect(await handleCommand({ type: 'recordingLink', recordingId: 'r1' }, noTunnel.deps, () => undefined)).toEqual({ url: 'https://drive.google.com/file/d/abc/view', expiresAt: null, kind: 'web' });
    noTunnel.cloud.link = null;
    await expect(handleCommand({ type: 'recordingLink', recordingId: 'r1' }, noTunnel.deps, () => undefined)).rejects.toThrow('link_unavailable');
  });

  it('falar só em câmera com alto-falante', async () => {
    const { deps } = base();
    expect(await handleCommand({ type: 'startTalk', cameraId: 'cam-1' }, deps, () => undefined)).toEqual({ talking: true });
    await expect(handleCommand({ type: 'startTalk', cameraId: 'cam-2' }, deps, () => undefined)).rejects.toThrow('talk_unavailable');
  });
});

describe('página do hub pelo túnel', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nuvigia-http-'));
  const file = join(dir, 'r1.mp4');
  writeFileSync(file, Buffer.from('0123456789'));
  const go2rtcCalls: string[] = [];
  const server = startHttp(new Pairing(new FakeBackend(), silent, { printQr: false }), '127.0.0.1', 0, {
    signer,
    go2rtcUrl: 'http://go2rtc:1984',
    streamName: (id) => `cam_${id}`,
    filePath: (id) => (id === 'r1' ? file : null),
    fetchImpl: (async (u: URL) => {
      go2rtcCalls.push(u.toString());
      return new Response('#EXTM3U', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    }) as unknown as typeof fetch,
  });
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  afterAll(() => void server.close());

  it('serve o arquivo com Range e recusa token inválido', async () => {
    await new Promise((r) => (server.listening ? r(null) : server.once('listening', r)));
    const { token } = signer.sign('file', 'r1', 60);
    const full = await fetch(`${base()}/files/${token}`);
    expect(await full.text()).toBe('0123456789');
    const part = await fetch(`${base()}/files/${token}`, { headers: { range: 'bytes=2-4' } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe('234');
    expect((await fetch(`${base()}/files/nada.x`)).status).toBe(403);
  });

  it('HLS: força a câmera do token e só deixa passar rotas de HLS', async () => {
    const { token } = signer.sign('hls', 'cam-1', 60);
    const res = await fetch(`${base()}/hls/${token}/api/stream.m3u8?src=outra`);
    expect(await res.text()).toBe('#EXTM3U');
    expect(go2rtcCalls.at(-1)).toBe('http://go2rtc:1984/api/stream.m3u8?src=cam_cam-1');
    await fetch(`${base()}/hls/${token}/api/hls/segment.ts?id=abc&n=3`);
    expect(go2rtcCalls.at(-1)).toBe('http://go2rtc:1984/api/hls/segment.ts?id=abc&n=3');
    expect((await fetch(`${base()}/hls/${token}/api/streams`)).status).toBe(404);
  });

  it('pelo túnel não mostra a página de pareamento', async () => {
    expect((await fetch(`${base()}/`, { headers: { 'cf-connecting-ip': '1.2.3.4' } })).status).toBe(404);
    expect((await fetch(`${base()}/`)).status).toBe(200);
  });
});
