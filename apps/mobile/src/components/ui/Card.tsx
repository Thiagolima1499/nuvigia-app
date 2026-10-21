import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useInteraction } from '@/hooks/useInteraction';
import { colors, focusRing, radius, shadow, space } from '@/theme/theme';

export type CardProps = {
  children: React.ReactNode;
  /** Cor de fundo (padrão `surface`). */
  background?: string;
  padding?: number;
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Cartão do Organic: raio 28px, fundo `surface`. Tocável quando recebe `onPress`. */
export function Card({ children, background = colors.surface, padding = space[4], elevation = 'none', onPress, accessibilityLabel, style }: CardProps) {
  const { hovered, focused, handlers } = useInteraction();
  const base = [
    styles.card,
    { backgroundColor: background, padding },
    elevation !== 'none' && { boxShadow: shadow[elevation] },
  ];
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [base, (hovered || pressed) && { opacity: pressed ? 0.85 : 0.94 }, focused && focusRing, style]}
    >
      {children}
    </Pressable>
  );
}

/** Lista agrupada em cartão (Ajustes): linhas sem divisória, cantos de 28px. */
export function ListCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.list, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, gap: space[2] },
  list: { borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
});
