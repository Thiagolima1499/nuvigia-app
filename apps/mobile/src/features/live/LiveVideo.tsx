import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import type * as WebRTC from 'react-native-webrtc';

import { LiveOverlay } from './LiveOverlay';
import { useLive, type LiveAdapter } from './useLive';

export type LiveVideoProps = { cameraId: string; muted: boolean; talking: boolean };

type Mod = typeof WebRTC;
let mod: Mod | null | undefined;

/**
 * O react-native-webrtc só existe no app instalado (build de desenvolvimento ou loja).
 * No Expo Go o módulo nativo não existe, então carregamos sob demanda.
 */
function loadWebRTC(): Mod | null {
  if (mod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('react-native-webrtc') as Mod;
    } catch {
      mod = null;
    }
  }
  return mod;
}

function makeAdapter(m: Mod): LiveAdapter<WebRTC.MediaStream> {
  return {
    makePc: (config) => new m.RTCPeerConnection(config as never) as never,
    getMic: async () => {
      const s = await m.mediaDevices.getUserMedia({ audio: true, video: false });
      return { track: s.getAudioTracks()[0], stop: () => s.getTracks().forEach((t) => t.stop()) };
    },
    streamOf: (ev) => (ev as { streams?: WebRTC.MediaStream[] }).streams?.[0] ?? null,
  };
}

/** Vídeo ao vivo no celular (WebRTC; plano B por HLS). */
export function LiveVideo(props: LiveVideoProps) {
  const m = loadWebRTC();
  if (!m) return <LiveOverlay status="error" error="O vídeo ao vivo precisa do app instalado (não funciona no Expo Go)." onRetry={() => undefined} />;
  return <NativeLive {...props} m={m} />;
}

const adapters = new WeakMap<Mod, LiveAdapter<WebRTC.MediaStream>>();

function NativeLive({ cameraId, muted, talking, m }: LiveVideoProps & { m: Mod }) {
  if (!adapters.has(m)) adapters.set(m, makeAdapter(m));
  const live = useLive(cameraId, talking, adapters.get(m)!);
  const RTCView = m.RTCView;

  useEffect(() => {
    live.stream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [live.stream, muted]);

  return (
    <>
      {live.status === 'playing' && live.stream ? <RTCView streamURL={live.stream.toURL()} objectFit="cover" style={StyleSheet.absoluteFill} /> : null}
      {live.status === 'hls' && live.hlsUrl ? <Hls url={live.hlsUrl} muted={muted} /> : null}
      <LiveOverlay status={live.status} error={live.error} onRetry={live.retry} />
    </>
  );
}

/** Plano B: HLS pelo túnel do hub (um pouco mais de atraso que o WebRTC). */
function Hls({ url, muted }: { url: string; muted: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.muted = muted;
    p.play();
  });
  useEffect(() => {
    // o player do expo-video é um objeto nativo feito para ser alterado
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [player, muted]);
  return <VideoView player={player} contentFit="cover" nativeControls={false} style={StyleSheet.absoluteFill} />;
}
