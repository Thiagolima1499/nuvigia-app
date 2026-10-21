import { IceServers, SignalMessage } from '@nuvigia/shared';

import { getSupabase } from '@/lib/supabase';

/** O mínimo de RTCPeerConnection usado aqui (navegador e react-native-webrtc). */
export type PcLike = {
  localDescription: { sdp?: string | null } | null;
  iceGatheringState: string;
  connectionState: string;
  createOffer(): Promise<{ type: string; sdp?: string | null }>;
  setLocalDescription(d: { type: string; sdp?: string | null }): Promise<void>;
  setRemoteDescription(d: { type: 'answer'; sdp: string }): Promise<void>;
  addTransceiver(kindOrTrack: unknown, init: { direction: 'recvonly' | 'sendrecv' }): unknown;
  addEventListener(type: string, cb: (ev: unknown) => void): void;
  close(): void;
};

export type SignalChannel = {
  signal(payload: unknown): Promise<void>;
  onSignal(l: (msg: unknown) => void): () => void;
};

export class LiveError extends Error {}

const ANSWER_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 15_000;
const GATHER_TIMEOUT_MS = 2_500;

let iceCache: { value: IceServers['iceServers']; until: number } | null = null;

/** STUN/TURN da função `turn-credentials` (guardados até perto de vencer). */
export async function getIceServers(): Promise<IceServers['iceServers']> {
  if (iceCache && iceCache.until > Date.now()) return iceCache.value;
  const fallback = [{ urls: ['stun:stun.l.google.com:19302'] }];
  const sb = getSupabase();
  if (!sb) return fallback;
  try {
    const { data, error } = await sb.functions.invoke('turn-credentials', { method: 'POST' });
    const parsed = IceServers.safeParse(data);
    if (error || !parsed.success) return fallback;
    iceCache = { value: parsed.data.iceServers, until: Date.now() + (parsed.data.ttl - 120) * 1000 };
    return parsed.data.iceServers;
  } catch {
    return fallback;
  }
}

/** Espera o navegador juntar os candidatos ICE (sem trickle), com limite de tempo. */
function waitGathering(pc: PcLike, timeoutMs: number) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

function waitConnected(pc: PcLike, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    if (pc.connectionState === 'connected') return resolve();
    const t = setTimeout(() => reject(new LiveError('webrtc_timeout')), timeoutMs);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(t);
        resolve();
      } else if (pc.connectionState === 'failed') {
        clearTimeout(t);
        reject(new LiveError('webrtc_failed'));
      }
    });
  });
}

export type LiveOptions = {
  hub: SignalChannel;
  cameraId: string;
  makePc: (config: { iceServers: IceServers['iceServers'] }) => PcLike;
  iceServers: IceServers['iceServers'];
  /** Faixa do microfone para falar pela câmera (abre a sessão com áudio nos dois sentidos). */
  micTrack?: unknown;
  onTrack: (ev: unknown) => void;
  timeouts?: { answer?: number; connect?: number; gather?: number };
};

/**
 * Abre o vídeo ao vivo: oferta WebRTC → hub (Realtime) → go2rtc → resposta.
 * Devolve a conexão já "connected"; quem chama fecha com `pc.close()`.
 */
export async function openLive(o: LiveOptions): Promise<PcLike> {
  const pc = o.makePc({ iceServers: o.iceServers });
  pc.addEventListener('track', o.onTrack);
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver(o.micTrack ?? 'audio', { direction: o.micTrack ? 'sendrecv' : 'recvonly' });

  const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let off = () => {};
  try {
    const answer = new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new LiveError('hub_timeout')), o.timeouts?.answer ?? ANSWER_TIMEOUT_MS);
      off = o.hub.onSignal((raw) => {
        const msg = SignalMessage.safeParse(raw);
        if (!msg.success || msg.data.sessionId !== sessionId) return;
        if (msg.data.type === 'answer') {
          clearTimeout(t);
          resolve(msg.data.sdp);
        } else if (msg.data.type === 'error') {
          clearTimeout(t);
          reject(new LiveError(msg.data.error));
        }
      });
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitGathering(pc, o.timeouts?.gather ?? GATHER_TIMEOUT_MS);
    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new LiveError('webrtc_failed');
    await o.hub.signal({ type: 'offer', sessionId, cameraId: o.cameraId, sdp });
    await pc.setRemoteDescription({ type: 'answer', sdp: await answer });
    await waitConnected(pc, o.timeouts?.connect ?? CONNECT_TIMEOUT_MS);
    return pc;
  } catch (e) {
    pc.close();
    throw e;
  } finally {
    off();
  }
}

/** Mensagem para a pessoa a partir do erro do ao vivo. */
export function liveErrorText(e: unknown): string {
  const code = e instanceof Error ? e.message : '';
  if (code === 'camera_offline') return 'A câmera está sem conexão.';
  if (code === 'hub_timeout') return 'O hub não respondeu.';
  return 'Não foi possível abrir o vídeo.';
}
