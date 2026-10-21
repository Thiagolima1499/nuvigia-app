import { useRouter } from 'expo-router';
import { Plus, ServerOff, Video } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Heading, IconButton, Screen, Text, useToast } from '@/components/ui';
import { formatClock, greeting, quotaLabel } from '@/data/format';
import { CameraCard } from '@/features/cameras/CameraCard';
import { CloudStrip, NoCloudCard } from '@/features/cloud/CloudStrip';
import { StateCard } from '@/features/common/StateCard';
import { useAutoFillGrid } from '@/hooks/useGrid';
import { useNow } from '@/hooks/useNow';
import { selectRecordingCount, useAppStore, useCloudInfo } from '@/state/store';
import { accent, maxWidth, neutral, radius, space } from '@/theme/theme';

const GAP = space[3];

export default function CamerasScreen() {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const cameras = useAppStore((s) => s.cameras);
  const hubStatus = useAppStore((s) => s.hubStatus);
  const retryHub = useAppStore((s) => s.retryHub);
  const layout = useAppStore((s) => s.homeLayout);
  const recordMode = useAppStore((s) => s.recordMode);
  const recCount = useAppStore(selectRecordingCount);
  const openCloudDialog = useAppStore((s) => s.openCloudDialog);
  const grid = layout === 'grid';
  const { itemWidth } = useAutoFillGrid(maxWidth.cameras, grid ? 170 : 320, GAP);
  const clock = formatClock(now);
  const modeLabel = recordMode === 'motion' ? 'Por movimento' : 'Contínua';
  const prov = useCloudInfo();

  return (
    <Screen maxWidth={maxWidth.cameras} bottomInset={110} testID="screen-cameras">
      <View style={styles.header}>
        <View style={styles.titles}>
          <View style={styles.brand}>
            <Heading
              size={17}
              color={accent[700]}
              accessibilityRole="text"
              onLongPress={__DEV__ ? () => router.push('/catalogo') : undefined}
            >
              Nuvigia
            </Heading>
            <Text size={12} color={neutral[700]}>
              Câmeras Wi-Fi
            </Text>
          </View>
          <Text size={13} color={neutral[700]} style={styles.greeting}>
            {greeting(now)}
          </Text>
          <Heading size={32} lineHeight={34}>
            Minhas câmeras
          </Heading>
        </View>
        <IconButton testID="add-camera" icon={Plus} variant="primary" accessibilityLabel="Adicionar câmera" onPress={() => router.push('/adicionar')} />
      </View>

      <View style={styles.cloud}>
        {prov ? (
          <CloudStrip
            title={`Salvando no ${prov.name}`}
            subtitle={`${recCount} gravando agora · ${quotaLabel(prov.usedBytes, prov.totalBytes)}`}
            onPress={() => router.navigate('/gravacoes')}
          />
        ) : (
          <NoCloudCard onConnect={() => openCloudDialog()} />
        )}
      </View>

      <View style={styles.list}>
        {hubStatus === 'unreachable' ? (
          <StateCard
            testID="hub-unreachable"
            tone="warning"
            icon={ServerOff}
            title="Hub inacessível"
            body="Não conseguimos falar com o hub Nuvigia da sua casa. Confira se ele está ligado e conectado à internet."
            actionLabel="Tentar de novo"
            onAction={retryHub}
          />
        ) : hubStatus === 'loading' ? (
          <View style={styles.grid} accessibilityLabel="Carregando câmeras">
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: itemWidth, gap: 8 }}>
                <View style={[styles.skeleton, { aspectRatio: grid ? 1 : 16 / 10 }]} />
                <View style={styles.skeletonLine} />
              </View>
            ))}
          </View>
        ) : cameras.length === 0 ? (
          <StateCard
            testID="cameras-empty"
            icon={Video}
            title="Nenhuma câmera ainda"
            body="Ligue a câmera na tomada e toque em Adicionar câmera. O Nuvigia procura as câmeras no seu Wi‑Fi."
            actionLabel="Adicionar câmera"
            onAction={() => router.push('/adicionar')}
          />
        ) : (
          <View style={styles.grid}>
            {cameras.map((c) => (
              <CameraCard
                key={c.id}
                camera={c}
                clock={clock}
                modeLabel={modeLabel}
                aspectRatio={grid ? 1 : 16 / 10}
                width={itemWidth}
                onPress={() => (c.online ? router.push(`/camera/${c.id}`) : toast.show(`${c.name} está sem conexão`))}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titles: { flex: 1, gap: 4 },
  brand: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  greeting: { marginTop: 6 },
  cloud: { marginTop: space[4] },
  list: { marginTop: space[6] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  skeleton: { width: '100%', borderRadius: radius.lg, backgroundColor: neutral[300] },
  skeletonLine: { width: '40%', height: 14, borderRadius: 999, backgroundColor: neutral[300], marginLeft: 6 },
});
