import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { accent, colors, neutral, sage } from '@/theme/theme';

import { Text } from './Text';

export type TagVariant = 'accent' | 'accent2' | 'neutral' | 'outline';

const palette: Record<TagVariant, { bg: string; fg: string; border: string }> = {
  accent: { bg: accent[100], fg: accent[800], border: 'transparent' },
  accent2: { bg: sage[100], fg: sage[800], border: 'transparent' },
  neutral: { bg: neutral[100], fg: neutral[800], border: 'transparent' },
  outline: { bg: 'transparent', fg: colors.accent, border: colors.accent },
};

export type TagProps = { label: string; variant?: TagVariant; style?: StyleProp<ViewStyle> };

/** `.tag` do Organic: 11px, tracking .02em, pílula. */
export function Tag({ label, variant = 'neutral', style }: TagProps) {
  const p = palette[variant];
  return (
    <View style={[styles.base, { backgroundColor: p.bg, borderColor: p.border }, style]}>
      <Text size={11} color={p.fg} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  label: { letterSpacing: 0.22, lineHeight: 14 },
});
