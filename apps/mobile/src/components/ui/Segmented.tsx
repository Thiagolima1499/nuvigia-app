import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useInteraction } from '@/hooks/useInteraction';
import { colors, focusRing } from '@/theme/theme';

import { Text } from './Text';

export type SegmentedProps<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** Rola na horizontal quando não cabe (filtro de Gravações). */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** `.seg` do Organic: grupo de opções em pílula com divisórias. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel, scrollable, style }: SegmentedProps<T>) {
  const row = (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.group}>
      {options.map((opt, i) => (
        <SegOption key={opt} label={opt} selected={opt === value} first={i === 0} onPress={() => onChange(opt)} />
      ))}
    </View>
  );
  if (!scrollable) return <View style={[styles.wrap, style]}>{row}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.wrap, style]} contentContainerStyle={styles.scroll}>
      {row}
    </ScrollView>
  );
}

function SegOption({ label, selected, first, onPress }: { label: string; selected: boolean; first: boolean; onPress: () => void }) {
  const { hovered, focused, handlers } = useInteraction();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      {...handlers}
      style={[
        styles.opt,
        !first && styles.divider,
        { backgroundColor: selected ? colors.accent : hovered ? colors.textWash7 : 'transparent' },
        focused && { ...focusRing, outlineOffset: -2 },
      ]}
    >
      <Text size={13} color={selected ? colors.bg : colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', maxWidth: '100%', flexGrow: 0 },
  scroll: { flexGrow: 0 },
  group: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 999,
    overflow: 'hidden',
  },
  opt: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.divider },
});
