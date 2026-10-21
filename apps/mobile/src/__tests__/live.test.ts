import { openLive, liveErrorText, type PcLike, type SignalChannel } from '@/services/liveSession';

class FakePc implements PcLike {
  localDescription: { sdp?: string | null } | null = null;
  iceGatheringState = 'new';
  connectionState = 'new';
  transceivers: { kind: unknown; direction: string }[] = [];
  remote: string | null = null;
  closed = false;
  private listeners = new Map<string, ((ev: unknown) => void)[]>();
  async createOffer() {
    return { type: 'offer', sdp: 'v=0 sem candidatos' };
  }
  async setLocalDescription(d: { sdp?: string | null }) {
    this.localDescription = d;
    setTimeout(() => {
      this.localDescription = { sdp: 'v=0 com candidatos' };
      this.iceGatheringState = 'complete';
      this.fire('icegatheringstatechange');
    }, 5);
  }
  async setRemoteDescription(d: { sdp: string }) {
    this.remote = d.sdp;
    setTimeout(() => {
      this.connectionState = 'connected';
      this.fire('connectionstatechange');
    }, 5);
  }
  addTransceiver(kind: unknown, init: { direction: string }) {
    this.transceivers.push({ kind, direction: init.direction });
  }
  addEventListener(type: string, cb: (ev: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  fire(type: string) {
    this.listeners.get(type)?.forEach((cb) => cb({}));
  }
  close() {
    this.closed = true;
  }
}

function fakeHub(reply: (offer: { sessionId: string; sdp: string; cameraId: string }) => unknown): SignalChannel & { sent: unknown[] } {
  const listeners = new Set<(m: unknown) => void>();
  const sent: unknown[] = [];
  return {
    sent,
    signal: async (p) => {
      sent.push(p);
      const r = reply(p as never);
      if (r) setTimeout(() => listeners.forEach((l) => l(r)), 5);
    },
    onSignal: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

describe('ao vivo por WebRTC', () => {
  it('manda a oferta com candidatos, aplica a resposta e conecta', async () => {
    const pc = new FakePc();
    const hub = fakeHub((o) => ({ type: 'answer', sessionId: o.sessionId, sdp: 'v=0 resposta' }));
    const out = await openLive({ hub, cameraId: 'cam-1', makePc: () => pc, iceServers: [], onTrack: () => undefined });
    expect(out).toBe(pc);
    expect(hub.sent[0]).toMatchObject({ type: 'offer', cameraId: 'cam-1', sdp: 'v=0 com candidatos' });
    expect(pc.remote).toBe('v=0 resposta');
    expect(pc.transceivers).toEqual([
      { kind: 'video', direction: 'recvonly' },
      { kind: 'audio', direction: 'recvonly' },
    ]);
  });

  it('com microfone, o áudio vai nos dois sentidos', async () => {
    const pc = new FakePc();
    const hub = fakeHub((o) => ({ type: 'answer', sessionId: o.sessionId, sdp: 'v=0' }));
    const mic = { id: 'mic' };
    await openLive({ hub, cameraId: 'cam-1', makePc: () => pc, iceServers: [], micTrack: mic, onTrack: () => undefined });
    expect(pc.transceivers[1]).toEqual({ kind: mic, direction: 'sendrecv' });
  });

  it('erro do hub fecha a conexão; resposta de outra sessão é ignorada', async () => {
    const pc = new FakePc();
    const hub = fakeHub((o) => ({ type: 'error', sessionId: o.sessionId, error: 'camera_offline' }));
    await expect(openLive({ hub, cameraId: 'cam-1', makePc: () => pc, iceServers: [], onTrack: () => undefined })).rejects.toThrow('camera_offline');
    expect(pc.closed).toBe(true);
    expect(liveErrorText(new Error('camera_offline'))).toBe('A câmera está sem conexão.');

    const pc2 = new FakePc();
    const other = fakeHub(() => ({ type: 'answer', sessionId: 'outra', sdp: 'x' }));
    await expect(
      openLive({ hub: other, cameraId: 'cam-1', makePc: () => pc2, iceServers: [], onTrack: () => undefined, timeouts: { answer: 50 } }),
    ).rejects.toThrow('hub_timeout');
  });
});
