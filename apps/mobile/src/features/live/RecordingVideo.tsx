import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet } from 'react-native';

/** Toca uma gravação que está no hub (pelo túnel), com os controles do sistema. */
export function RecordingVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => p.play());
  return <VideoView player={player} contentFit="contain" nativeControls style={StyleSheet.absoluteFill} />;
}
