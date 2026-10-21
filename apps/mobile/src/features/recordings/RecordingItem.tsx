import { Play } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, ProgressBar, Tag, Text } from '@/components/ui';
import { useInteraction } from '@/hooks/useInteraction';
import { colors, focusRing, neutral, radius } from '@/theme/theme';

export type RecordingItemProps = {
  title: string;
  subtitle: string;
  status: 'uploading' | 'done' | 'failed' | 'recording';
  progress: number;
  /** "Drive" ou "OneDrive". */
  providerShort: string | null;
  width: number;
  onPress: () => void;
  onRetry: () => void;
  testID?: string;
};

export function RecordingItem({ title, subtitle, status, progress, providerShort, width, onPress, onRetry, testID }: RecordingItemProps) {
  const { hovered, focused, handlers } = useInteraction();
  const uploading = status === 'uploading';
  const failed = status === 'failed';
  const tag = uploading
    ? { label: `Enviando ${Math.round(progress)}%`, variant: 'accent' as const }
    : failed
      ? { label: 'Falha no envio', variant: 'accent' as const }
      : status === 'recording'
        ? { label: 'Gravando', variant: 'accent' as const }
        : { label: providerShort ? `No ${providerShort}` : 'No cartão', variant: 'accent2' as const };

  return (
    <View style={{ width }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}, ${tag.label}`}
        accessibilityHint="Abre o vídeo"
        onPress={onPress}
        {...handlers}
        style={({ pressed }) => [styles.item, { opacity: pressed ? 0.85 : hovered ? 0.92 : 1 }, focused && focusRing]}
      >
        <View style={styles.thumb}>
          <Icon icon={Play} size={18} color={neutral[200]} />
        </View>
        <View style={styles.texts}>
          <Text size={14} weight="semibold" numberOfLines={1}>
            {title}
          </Text>
          <Text size={12} color={neutral[700]} numberOfLines={2}>
            {subtitle}
          </Text>
          {uploading ? (
            <View style={styles.bar}>
              <ProgressBar value={progress} height={6} track={neutral[300]} fill={colors.accent} />
            </View>
          ) : null}
          {failed ? <Button label="Tentar de novo" variant="ghost" onPress={onRetry} style={styles.retry} /> : null}
        </View>
        <Tag label={tag.label} variant={tag.variant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, backgroundColor: colors.surface },
  thumb: { width: 78, height: 58, borderRadius: radius.md, backgroundColor: neutral[800], alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  bar: { marginTop: 3 },
  retry: { marginLeft: -8, minHeight: 32 },
});
