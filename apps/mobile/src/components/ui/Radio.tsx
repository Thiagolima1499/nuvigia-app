import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useInteraction } from '@/hooks/useInteraction';
import { accent, colors, focusRing, neutral } from '@/theme/theme';

import { Text } from './Text';

export type RadioProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Nota à direita (ex.: "15 GB grátis" no diálogo de nuvem). */
  note?: string;
  /** "pill": opção em pílula do diálogo (selecionada `accent-100`, demais `neutral-100`). */
  appearance?: 'plain' | 'pill';
  style?: StyleProp<ViewStyle>;
};

/** `.radio` do Organic. Use dentro de um `RadioGroup`. */
export function Radio({ label, selected, onPress, note, appearance = 'plain', style }: RadioProps) {
  const { hovered, focused, handlers } = useInteraction();
  const pill = appearance === 'pill';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={note ? `${label}, ${note}` : label}
      onPress={onPress}
      {...handlers}
      style={[
        styles.row,
        pill && styles.pill,
        pill && { backgroundColor: selected ? accent[100] : neutral[100] },
        style,
      ]}
    >
      <View
        style={[
          styles.dot,
          { borderColor: selected || hovered ? colors.accent : colors.divider },
          selected && styles.dotOn,
          focused && focusRing,
        ]}
      >
        {selected ? <View style={styles.dotCenter} /> : null}
      </View>
      <Text size={14} weight={pill ? 'semibold' : 'regular'} style={pill ? styles.grow : undefined}>
        {label}
      </Text>
      {note ? (
        <Text size={12} color={neutral[700]}>
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function RadioGroup({ accessibilityLabel, children, style }: { accessibilityLabel: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.group, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  pill: { gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999 },
  grow: { flex: 1 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.bg },
  dotCenter: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
});
