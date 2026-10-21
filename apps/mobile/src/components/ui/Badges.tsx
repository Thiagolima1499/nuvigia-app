import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { accent, colors, neutral } from '@/theme/theme';

import { Text } from './Text';

/** Ponto de gravação 7px pulsando (opacidade 1 → .25 → 1, 1,4s, infinito). */
export function PulseDot({ size = 7, color = neutral[100] }: { size?: number; color?: string }) {
  const opacity = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size, backgroundColor: color, opacity }} />;
}

/** Selo "AO VIVO" sobre a prévia (11px/600, tracking .04em, neutro-900 a 70%). */
export function LiveBadge({ label = 'AO VIVO', style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors.liveBadge }, style]}>
      <Text size={11} weight="semibold" color={neutral[100]} style={styles.caps}>
        {label}
      </Text>
    </View>
  );
}

/** Selo "REC" laranja com ponto pulsando. `label` permite o cronômetro na tela Ao vivo. */
export function RecBadge({ label = 'REC', style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityLabel={`Gravando ${label === 'REC' ? '' : label}`.trim()} style={[styles.badge, styles.rec, style]}>
      <PulseDot />
      <Text size={11} weight="semibold" color={neutral[100]} tabular style={styles.caps}>
        {label}
      </Text>
    </View>
  );
}

/** Spinner de 20px: borda 3px accent-300, topo accent. Gira em 1s, linear. */
export function Spinner({ size = 20 }: { size?: number }) {
  const spin = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando"
      style={{
        width: size,
        height: size,
        borderRadius: size,
        borderWidth: 3,
        borderColor: accent[300],
        borderTopColor: colors.accent,
        transform: [{ rotate }],
      }}
    />
  );
}

/** Barra de progresso em pílula (armazenamento e envio). */
export function ProgressBar({ value, height = 10, track, fill }: { value: number; height?: number; track: string; fill: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ height, borderRadius: 999, backgroundColor: track, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 999, backgroundColor: fill }} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999 },
  rec: { backgroundColor: colors.accent },
  caps: { letterSpacing: 0.44, lineHeight: 14 },
});
