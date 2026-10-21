import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Pause, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Heading, Icon, IconButton, ProgressBar, Screen, Tag, Text } from '@/components/ui';
import { formatDuration, formatElapsed, formatWhen } from '@/data/format';
import { PROVIDERS } from '@/data/providers';
import { FeedPlaceholder } from '@/features/cameras/Feed';
import { LivePlayback } from '@/features/live/LivePlayback';
import { StateCard } from '@/features/common/StateCard';
import { useAppStore } from '@/state/store';
import { colors, maxWidth, neutral, radius, space } from '@/theme/theme';

/**
 * Player de gravação (não desenhado no hand-off; segue o padrão da tela Ao vivo).
 * No modo real toca pelo hub ou abre no provedor; no modo demonstração, simula.
 */
export default function RecordingPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const rec = useAppStore((s) => s.recordings.find((r) => r.id === id));
  const cam = useAppStore((s) => s.cameras.find((c) => c.id === rec?.cameraId));
  const live = useAppStore((s) => s.mode === 'live');
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/gravacoes'));
  const duration = rec?.durationSec ?? 0;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setPos((p) => (p + 1 >= duration ? (setPlaying(false), duration) : p + 1)), 1000);
    return () => clearInterval(t);
  }, [playing, duration]);

  const videoHeight = Math.max(220, Math.min(height * 0.62, width * 1.25));

  return (
    <Screen maxWidth={maxWidth.live} bottomInset={40} contentStyle={styles.content} testID="screen-player">
      <View style={styles.header}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Voltar" onPress={back} />
        <View style={styles.headerTexts}>
          <Heading size={22} lineHeight={24} numberOfLines={1}>
            {cam?.name ?? 'Gravação'}
          </Heading>
          {rec ? (
            <Text size={12} color={neutral[700]}>
              {formatWhen(rec.startedAt)} · {formatDuration(rec.durationSec)}
            </Text>
          ) : null}
        </View>
      </View>

      {!rec ? (
        <StateCard title="Gravação não encontrada" body="Ela pode ter sido apagada da nuvem." actionLabel="Voltar" onAction={back} />
      ) : (
        <>
          {live ? (
            <LivePlayback rec={rec} height={videoHeight} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pausar' : 'Reproduzir'}
              onPress={() => {
                if (pos >= duration) setPos(0);
                setPlaying((p) => !p);
              }}
              style={[styles.video, { height: videoHeight }]}
            >
              <FeedPlaceholder cx="65%" cy="35%" glow={neutral[600]} radius="60%" />
              <View style={styles.playCircle}>
                <Icon icon={playing ? Pause : Play} size={26} color={neutral[100]} />
              </View>
            </Pressable>
          )}
          {live ? null : (
            <View style={styles.timeline}>
              <ProgressBar value={duration ? (pos / duration) * 100 : 0} height={6} track={neutral[300]} fill={colors.accent} />
              <View style={styles.times}>
                <Text size={12} color={neutral[700]} tabular>
                  {formatElapsed(pos)}
                </Text>
                <Text size={12} color={neutral[700]} tabular>
                  {formatElapsed(duration)}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.info}>
            {rec.status === 'done' ? (
              <Tag label={`No ${PROVIDERS[rec.provider ?? 'google'].short}`} variant="accent2" />
            ) : rec.status === 'uploading' ? (
              <Tag label={`Enviando ${Math.round(rec.uploadProgress)}%`} variant="accent" />
            ) : (
              <Tag label="Falha no envio" variant="accent" />
            )}
            {rec.provider ? (
              <Text size={12} color={neutral[700]}>
                Pasta: {PROVIDERS[rec.provider].folder} › {cam?.name ?? 'Câmera'}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTexts: { flex: 1, minWidth: 0 },
  video: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playCircle: { width: 64, height: 64, borderRadius: 999, backgroundColor: colors.liveBadge, alignItems: 'center', justifyContent: 'center' },
  timeline: { gap: 6 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  info: { gap: 8 },
});
