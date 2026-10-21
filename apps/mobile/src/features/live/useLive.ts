import { useEffect, useState } from 'react';

import { hubClientRef } from '@/services/sync';
import { getIceServers, liveErrorText, openLive, type PcLike } from '@/services/liveSession';

export type LiveStatus = 'connecting' | 'playing' | 'hls' | 'error';

/** Partes que mudam entre celular (react-native-webrtc) e navegador. */
export type LiveAdapter<S> = {
  makePc: (config: { iceServers: unknown[] }) => PcLike;
  /** Abre o microfone para falar pela câmera. */
  getMic: () => Promise<{ track: unknown; stop: () => void }>;
  streamOf: (trackEvent: unknown) => S | null;
};

const RETRY_MS = 2000;

/**
 * Liga o vídeo ao vivo da câmera: tenta WebRTC e, se não der, o HLS pelo túnel
 * do hub (quando existe). Reabre a sessão ao ligar/desligar o "Falar".
 */
export function useLive<S>(cameraId: string, talking: boolean, adapter: LiveAdapter<S>) {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [stream, setStream] = useState<S | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pc: PcLike | null = null;
    let mic: { stop: () => void } | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      setStatus('connecting');
      setError(null);
      const hub = hubClientRef.current;
      if (!hub) {
        setError('O hub não está conectado.');
        setStatus('error');
        return;
      }
      try {
        const m = talking ? await adapter.getMic() : null;
        mic = m;
        const iceServers = await getIceServers();
        pc = await openLive({
          hub,
          cameraId,
          iceServers,
          makePc: adapter.makePc as never,
          micTrack: m?.track,
          onTrack: (ev) => {
            const s = adapter.streamOf(ev);
            if (s && !cancelled) setStream(s);
          },
        });
        if (cancelled) return pc.close();
        setStatus('playing');
        const conn = pc;
        conn.addEventListener('connectionstatechange', () => {
          // conexão caiu (troca de rede, câmera reiniciou): reabre sozinho
          if (!cancelled && (conn.connectionState === 'failed' || conn.connectionState === 'disconnected')) {
            retryTimer = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
          }
        });
      } catch (e) {
        if (cancelled) return;
        try {
          const r = await hub.send<{ url: string }>({ type: 'liveHls', cameraId });
          if (cancelled) return;
          setHlsUrl(r.url);
          setStatus('hls');
        } catch {
          setError(liveErrorText(e));
          setStatus('error');
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      pc?.close();
      mic?.stop();
      setStream(null);
    };
    // o adaptador é fixo por plataforma
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, talking, attempt]);

  return { status, stream, hlsUrl, error, retry: () => setAttempt((a) => a + 1) };
}
