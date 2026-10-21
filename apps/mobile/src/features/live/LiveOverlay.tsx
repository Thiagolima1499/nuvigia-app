import { StyleSheet, View } from 'react-native';

import { Button, Spinner, Text } from '@/components/ui';
import { neutral, space } from '@/theme/theme';

import type { LiveStatus } from './useLive';

/** Estados do vídeo por cima da imagem: conectando e erro (com "Tentar de novo"). */
export function LiveOverlay({ status, error, onRetry }: { status: LiveStatus; error: string | null; onRetry: () => void }) {
  if (status === 'connecting') {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <Spinner size={24} />
        <Text size={13} color={neutral[200]}>
          Conectando ao vídeo…
        </Text>
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <Text size={14} weight="semibold" color={neutral[100]}>
          {error ?? 'Não foi possível abrir o vídeo.'}
        </Text>
        <Button label="Tentar de novo" variant="secondary" onPress={onRetry} testID="live-retry" />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[4] },
});
