import type { Camera } from '@nuvigia/shared';
import { WifiOff } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, LiveBadge, RecBadge, Text } from '@/components/ui';
import { useInteraction } from '@/hooks/useInteraction';
import { focusRing, neutral, radius } from '@/theme/theme';

import { FeedPlaceholder } from './Feed';

export type CameraCardProps = {
  camera: Camera;
  /** "HH:MM:SS" compartilhado por todos os cartões. */
  clock: string;
  modeLabel: string;
  /** 16/10 na lista, 1/1 na grade. */
  aspectRatio: number;
  width: number;
  onPress: () => void;
};

export function CameraCard({ camera, clock, modeLabel, aspectRatio, width, onPress }: CameraCardProps) {
  const { hovered, focused, handlers } = useInteraction();
  const offline = !camera.online;
  return (
    <Pressable
      testID={`camera-${camera.id}`}
      accessibilityRole="button"
      accessibilityLabel={offline ? `${camera.name}, sem conexão` : `${camera.name}, ao vivo${camera.recording ? ', gravando' : ''}`}
      accessibilityHint={offline ? undefined : 'Abre a câmera ao vivo'}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [styles.card, { width, opacity: pressed ? 0.85 : hovered ? 0.92 : 1 }, focused && focusRing]}
    >
      <View style={[styles.preview, { aspectRatio, backgroundColor: offline ? neutral[300] : neutral[800] }]}>
        {offline ? (
          <View style={styles.offline}>
            <Icon icon={WifiOff} size={24} color={neutral[700]} />
            <Text size={13} color={neutral[700]}>
              Sem conexão
            </Text>
          </View>
        ) : (
          <>
            <FeedPlaceholder />
            <View style={styles.badges}>
              <LiveBadge />
              {camera.recording ? <RecBadge /> : null}
            </View>
            <Text size={11} color={neutral[200]} tabular style={styles.clock}>
              {clock}
            </Text>
          </>
        )}
      </View>
      <View style={styles.meta}>
        <Text size={15} weight="semibold" numberOfLines={2} style={styles.name}>
          {camera.name}
        </Text>
        <Text size={12} color={neutral[700]} style={styles.mode}>
          {offline ? 'Offline' : modeLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  preview: { width: '100%', borderRadius: radius.lg, overflow: 'hidden' },
  offline: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  badges: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6 },
  clock: { position: 'absolute', left: 12, bottom: 10 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingHorizontal: 6 },
  name: { flexShrink: 1 },
  mode: { flexShrink: 0, textAlign: 'right' },
});
