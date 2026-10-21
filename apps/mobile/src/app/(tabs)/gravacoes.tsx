import { useRouter } from 'expo-router';
import { CloudUpload, Film } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Heading, ProgressBar, Screen, Segmented, Text } from '@/components/ui';
import { formatBytes, formatDuration, formatWhen } from '@/data/format';
import { PROVIDERS } from '@/data/providers';
import { NoCloudCard } from '@/features/cloud/CloudStrip';
import { StateCard } from '@/features/common/StateCard';
import { RecordingItem } from '@/features/recordings/RecordingItem';
import { useAutoFillGrid } from '@/hooks/useGrid';
import { useAppStore } from '@/state/store';
import { maxWidth, radius, sage, space } from '@/theme/theme';

const ALL = 'Todas';
const GAP = space[3];

export default function RecordingsScreen() {
  const router = useRouter();
  const cameras = useAppStore((s) => s.cameras);
  const recordings = useAppStore((s) => s.recordings);
  const cloud = useAppStore((s) => s.cloud);
  const openCloudDialog = useAppStore((s) => s.openCloudDialog);
  const retryUpload = useAppStore((s) => s.retryUpload);
  const [filter, setFilter] = useState<string>(ALL);
  const { itemWidth } = useAutoFillGrid(maxWidth.cameras, 320, GAP);
  const prov = cloud ? PROVIDERS[cloud] : null;

  const camName = useMemo(() => new Map(cameras.map((c) => [c.id, c.name])), [cameras]);
  // Filtro: Todas + câmeras que têm gravações, na ordem da lista de câmeras.
  const options = useMemo(() => {
    const withRecs = new Set(recordings.map((r) => r.cameraId));
    return [ALL, ...cameras.filter((c) => withRecs.has(c.id)).map((c) => c.name)];
  }, [cameras, recordings]);
  const activeFilter = options.includes(filter) ? filter : ALL;
  const visible = recordings.filter((r) => activeFilter === ALL || camName.get(r.cameraId) === activeFilter);
  const pct = prov ? (prov.usedBytes / prov.totalBytes) * 100 : 0;

  return (
    <Screen maxWidth={maxWidth.cameras} bottomInset={110} testID="screen-recordings" contentStyle={styles.content}>
      <Heading size={32} lineHeight={36}>
        Gravações
      </Heading>

      {prov ? (
        <View style={styles.storage} testID="storage-card">
          <View style={styles.storageRow}>
            <Text size={15} weight="semibold" color={sage[900]}>
              {prov.name}
            </Text>
            <Text size={13} color={sage[800]}>
              {formatBytes(prov.usedBytes)} de {formatBytes(prov.totalBytes)}
            </Text>
          </View>
          <ProgressBar value={pct} track={sage[100]} fill={sage[600]} />
          <Text size={12} color={sage[800]}>
            Pasta: {prov.folder}
          </Text>
        </View>
      ) : (
        <NoCloudCard onConnect={() => openCloudDialog()} />
      )}

      {recordings.length === 0 ? (
        <StateCard
          testID="recordings-empty"
          icon={prov ? CloudUpload : Film}
          title="Nenhuma gravação ainda"
          body="Quando uma câmera detectar movimento, ou quando você tocar em Gravar, os vídeos aparecem aqui."
        />
      ) : (
        <>
          <Segmented scrollable accessibilityLabel="Filtrar por câmera" options={options} value={activeFilter} onChange={setFilter} />
          <View style={styles.grid}>
            {visible.map((r) => (
              <RecordingItem
                key={r.id}
                testID={`recording-${r.id}`}
                title={camName.get(r.cameraId) ?? 'Câmera removida'}
                subtitle={`${formatWhen(r.startedAt)} · ${formatDuration(r.durationSec)}`}
                status={r.status}
                progress={r.uploadProgress}
                providerShort={r.provider ? PROVIDERS[r.provider].short : prov?.short ?? null}
                width={itemWidth}
                onPress={() => router.push(`/gravacao/${r.id}`)}
                onRetry={() => retryUpload(r.id)}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  storage: { padding: space[4], borderRadius: radius.lg, backgroundColor: sage[200], gap: 10 },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
