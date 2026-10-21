import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Heading, Icon, Text } from '@/components/ui';
import { accent, colors, neutral } from '@/theme/theme';

export type StateCardProps = {
  icon?: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  /** "warning": fundo accent-200 (erros); "neutral": superfície (vazio). */
  tone?: 'neutral' | 'warning';
  testID?: string;
};

/** Cartão para estados de vazio e erro (câmera offline, hub inacessível, sem gravações…). */
export function StateCard({ icon, title, body, actionLabel, onAction, tone = 'neutral', testID }: StateCardProps) {
  const warn = tone === 'warning';
  const fg = warn ? accent[900] : colors.text;
  return (
    <Card background={warn ? accent[200] : colors.surface} style={styles.card}>
      <View testID={testID} style={styles.inner}>
        {icon ? <Icon icon={icon} size={24} color={warn ? accent[700] : neutral[700]} /> : null}
        <Heading size={19} color={fg}>
          {title}
        </Heading>
        <Text size={13} color={fg} style={styles.body}>
          {body}
        </Text>
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  inner: { gap: 10 },
  body: { lineHeight: 19 },
});
