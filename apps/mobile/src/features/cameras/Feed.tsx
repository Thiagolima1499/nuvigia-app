import { Svg, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';

import { neutral } from '@/theme/theme';

/**
 * Placeholder do vídeo: fundo neutro-800 com brilho radial (neutro-700 ou -600).
 * No app real, é substituído pelo stream (WebRTC/HLS) na etapa 6.
 */
export function FeedPlaceholder({ cx = '70%', cy = '30%', glow = neutral[700], radius = '65%' }: { cx?: string; cy?: string; glow?: string; radius?: string }) {
  // id único: na web, vários SVGs com o mesmo id de gradiente se confundem.
  const id = `glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx={cx} cy={cy} r={radius} fx={cx} fy={cy} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={glow} stopOpacity="1" />
            <Stop offset="1" stopColor={glow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={neutral[800]} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
