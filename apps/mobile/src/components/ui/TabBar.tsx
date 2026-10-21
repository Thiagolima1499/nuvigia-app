import { CloudUpload, SlidersHorizontal, Video, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInteraction } from '@/hooks/useInteraction';
import { colors, focusRing, maxWidth, neutral, shadow } from '@/theme/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export type TabKey = 'cameras' | 'recordings' | 'settings';

export const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'cameras', label: 'Câmeras', icon: Video },
  { key: 'recordings', label: 'Gravações', icon: CloudUpload },
  { key: 'settings', label: 'Ajustes', icon: SlidersHorizontal },
];

export type TabBarProps = {
  active: TabKey;
  onChange: (key: TabKey) => void;
  /** false: barra no fluxo do layout (catálogo). true (padrão): flutuante sobre a tela. */
  floating?: boolean;
};

/** Barra de abas flutuante: `min(100% − 32px, 480px)`, 66px, pílula escura. */
export function TabBar({ active, onChange, floating = true }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={floating ? [styles.layer, { bottom: insets.bottom + 16 }] : styles.inline}>
      <View accessibilityRole="tablist" style={styles.bar}>
        {TABS.map((t) => (
          <TabItem key={t.key} label={t.label} icon={t.icon} selected={t.key === active} onPress={() => onChange(t.key)} />
        ))}
      </View>
    </View>
  );
}

function TabItem({ label, icon, selected, onPress }: { label: string; icon: LucideIcon; selected: boolean; onPress: () => void }) {
  const { focused, handlers } = useInteraction();
  const fg = selected ? colors.bg : neutral[300];
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      {...handlers}
      style={[
        styles.item,
        { backgroundColor: selected ? colors.accent : 'transparent' },
        focused && focusRing,
      ]}
    >
      <Icon icon={icon} size={19} color={fg} />
      <Text size={13} weight="semibold" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 10 },
  inline: { alignItems: 'center', alignSelf: 'stretch' },
  bar: {
    width: '100%',
    maxWidth: maxWidth.tabBar,
    height: 66,
    padding: 6,
    borderRadius: 999,
    backgroundColor: neutral[900],
    flexDirection: 'row',
    boxShadow: shadow.lg,
  },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 999 },
});
