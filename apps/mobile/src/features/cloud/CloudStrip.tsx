import { ChevronRight, CloudUpload } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Heading, Icon, Text } from '@/components/ui';
import { useInteraction } from '@/hooks/useInteraction';
import { accent, colors, focusRing, radius, sage, space } from '@/theme/theme';

/** Faixa "Salvando no {Provedor}" da tela Câmeras. */
export function CloudStrip({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  const { hovered, focused, handlers } = useInteraction();
  return (
    <Pressable
      testID="cloud-strip"
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityHint="Abre Gravações"
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [styles.strip, { backgroundColor: hovered || pressed ? sage[300] : sage[200] }, focused && focusRing]}
    >
      <View style={styles.circle}>
        <Icon icon={CloudUpload} size={18} color={colors.bg} />
      </View>
      <View style={styles.texts}>
        <Text size={14} weight="semibold" color={sage[900]} numberOfLines={1}>
          {title}
        </Text>
        <Text size={12} color={sage[800]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Icon icon={ChevronRight} size={18} color={sage[800]} />
    </Pressable>
  );
}

/** Cartão "Escolha onde salvar" quando não há nuvem conectada. */
export function NoCloudCard({ onConnect }: { onConnect: () => void }) {
  return (
    <View testID="no-cloud-card" style={styles.card}>
      <Heading size={19} color={accent[900]}>
        Escolha onde salvar
      </Heading>
      <Text size={13} color={accent[900]} style={styles.body}>
        Conecte Google Drive, OneDrive ou iCloud. Sem a nuvem, as gravações ficam só no cartão de memória das câmeras.
      </Text>
      <Button label="Conectar nuvem" onPress={onConnect} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    minHeight: 44,
  },
  circle: { width: 34, height: 34, borderRadius: 999, backgroundColor: sage[600], alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  card: { padding: space[4], borderRadius: radius.lg, backgroundColor: accent[200], gap: 10 },
  body: { lineHeight: 19 },
});
