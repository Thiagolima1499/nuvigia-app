import { createElement } from 'react';

import { LiveOverlay } from './LiveOverlay';
import { useLive, type LiveAdapter } from './useLive';

export type LiveVideoProps = { cameraId: string; muted: boolean; talking: boolean };

const adapter: LiveAdapter<MediaStream> = {
  makePc: (config) => new RTCPeerConnection(config as RTCConfiguration) as never,
  getMic: async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { track: s.getAudioTracks()[0], stop: () => s.getTracks().forEach((t) => t.stop()) };
  },
  streamOf: (ev) => (ev as RTCTrackEvent).streams?.[0] ?? null,
};

const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } as const;

/** Vídeo ao vivo no navegador (WebRTC nativo do browser; HLS toca direto no Safari). */
export function LiveVideo({ cameraId, muted, talking }: LiveVideoProps) {
  const live = useLive(cameraId, talking, adapter);
  const stream = live.stream;
  const attach = (el: HTMLVideoElement | null) => {
    if (el && stream && el.srcObject !== stream) el.srcObject = stream;
  };

  return (
    <>
      {live.status === 'playing' ? createElement('video', { ref: attach, autoPlay: true, playsInline: true, muted, style: fill }) : null}
      {live.status === 'hls' && live.hlsUrl ? createElement('video', { src: live.hlsUrl, autoPlay: true, playsInline: true, muted, style: fill }) : null}
      <LiveOverlay status={live.status} error={live.error} onRetry={live.retry} />
    </>
  );
}
