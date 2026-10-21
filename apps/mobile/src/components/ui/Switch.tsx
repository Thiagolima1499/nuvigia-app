import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useInteraction } from '@/hooks/useInteraction';
import { focusRing, neutral, sage, shadow } from '@/theme/theme';

import { Text } from './Text';

export type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
};

/** Interruptor 48×28: ligado sálvia-600, desligado neutro-400, botão 22px, transição 0,2s. */
export function Switch({ value, onValueChange, accessibilityLabel }: SwitchProps) {
  const { focused, handlers } = useInteraction();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      {...handlers}
      style={[focused && focusRing, styles.focusShape]}
    >
      <SwitchTrack value={value} />
    </Pressable>
  );
}

/** Só o visual do interruptor (usado também dentro de `SwitchRow`, onde a linha toda é tocável). */
export function SwitchTrack({ value }: { value: boolean }) {
  const anim = useState(() => new Animated.Value(value ? 1 : 0))[0];
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [anim, value]);
  const left = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 23] });
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [neutral[400], sage[600]] });
  return (
    <Animated.View style={[styles.track, { backgroundColor: bg }]}>
      <Animated.View style={[styles.knob, { left }]} />
    </Animated.View>
  );
}

export type SwitchRowProps = SwitchProps & {
  label: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
};

/** Linha de lista com rótulo, dica e interruptor (padding 14×16, hover neutro-300). */
export function SwitchRow({ value, onValueChange, label, hint, style }: Omit<SwitchRowProps, 'accessibilityLabel'> & { accessibilityLabel?: string }) {
  const { hovered, focused, handlers } = useInteraction();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      {...handlers}
      style={[styles.row, hovered && { backgroundColor: neutral[300] }, focused && { ...focusRing, outlineOffset: -2 }, style]}
    >
      <View style={styles.texts}>
        <Text size={14} weight="semibold">
          {label}
        </Text>
        {hint ? (
          <Text size={12} color={neutral[700]}>
            {hint}
          </Text>
        ) : null}
      </View>
      <SwitchTrack value={value} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  focusShape: { borderRadius: 999 },
  track: { width: 48, height: 28, borderRadius: 999 },
  knob: {
    position: 'absolute',
    top: 3,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: neutral[100],
    boxShadow: shadow.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 44 },
  texts: { flex: 1, gap: 2 },
});
