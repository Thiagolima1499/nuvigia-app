import { SignalMessage } from '@nuvigia/shared';
import type { Logger } from 'pino';

import type { Go2rtc } from './go2rtc';

export type LiveDeps = {
  go2rtc: Pick<Go2rtc, 'webrtcAnswer'>;
  hasCamera: (id: string) => boolean;
  isOnline: (id: string) => boolean;
  send: (msg: SignalMessage) => Promise<void>;
  log: Logger;
};

/**
 * Ao vivo remoto: recebe a oferta WebRTC do app pelo Realtime, entrega ao go2rtc
 * (que fala com a câmera) e devolve a resposta. O vídeo vai direto entre o app e o
 * hub (STUN) ou por um servidor TURN; nenhuma porta é aberta no roteador.
 */
export class LiveService {
  private seen = new Map<string, number>();

  constructor(private readonly d: LiveDeps) {}

  async onSignal(payload: unknown) {
    const parsed = SignalMessage.safeParse(payload);
    if (!parsed.success) return;
    const msg = parsed.data;
    if (msg.type !== 'offer') return;
    // a mesma oferta pode chegar repetida; responde uma vez
    if (this.seen.has(msg.sessionId)) return;
    this.seen.set(msg.sessionId, Date.now());
    this.prune();
    if (!this.d.hasCamera(msg.cameraId)) return this.d.send({ type: 'error', sessionId: msg.sessionId, error: 'camera_not_found' });
    if (!this.d.isOnline(msg.cameraId)) return this.d.send({ type: 'error', sessionId: msg.sessionId, error: 'camera_offline' });
    try {
      const sdp = await this.d.go2rtc.webrtcAnswer(msg.cameraId, msg.sdp);
      await this.d.send({ type: 'answer', sessionId: msg.sessionId, sdp });
      this.d.log.info({ cameraId: msg.cameraId }, 'ao vivo: sessão WebRTC aberta');
    } catch (err) {
      this.d.log.warn({ err: (err as Error).message }, 'ao vivo: go2rtc recusou a oferta');
      await this.d.send({ type: 'error', sessionId: msg.sessionId, error: 'stream_failed' });
    }
  }

  private prune() {
    const old = Date.now() - 10 * 60_000;
    for (const [id, at] of this.seen) if (at < old) this.seen.delete(id);
  }
}
