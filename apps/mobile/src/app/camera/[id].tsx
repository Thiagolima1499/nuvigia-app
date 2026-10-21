import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera as CameraIcon, ChevronLeft, Mic, Volume2, WifiOff, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button, Heading, Icon, IconButton, LiveBadge, PulseDot, Screen, Tag, Text, useToast } from '@/components/ui';
import { formatClock, formatDayMonth, formatElapsed, formatTime } from '@/data/format';
import { FeedPlaceholder } from '@/features/cameras/Feed';
import { StateCard } from '@/features/common/StateCard';
import { useInteraction } from '@/hooks/useInteraction';
import { useNow } from '@/hooks/useNow';
import { useAppStore, useCloudInfo, type UiEvent } from '@/state/store';
import { accent, colors, focusRing, maxWidth, neutral, radius, sage, space } from '@/theme/theme';

/** Tela Ao vivo (stream simulado nesta etapa; WebRTC/HLS na etapa 6). */
export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const { height, width } = useWindowDimensions();
  const cam = useAppStore((s) => s.cameras.find((c) => c.id === id));
  const quality = useAppStore((s) => s.quality);
  const start = useAppStore((s) => s.startRecording);
  const stop = useAppStore((s) => s.stopRecording);
  const openCloudDialog = useAppStore((s) => s.openCloudDialog);
  const [muted, setMuted] = useState(false);
  const [talking, setTalking] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const prov = useCloudInfo();
  const allEvents = useAppStore((s) => s.events);
  const snapshot = useAppStore((s) => s.snapshot);
  // altura do vídeo: min(62vh, 125vw), mínimo 220px
  const videoHeight = Math.max(220, Math.min(height * 0.62, width * 1.25));

  if (!cam) {
    return (
      <Screen maxWidth={maxWidth.live} testID="screen-live">
        <Header title="Câmera" subtitle="" onBack={back} />
        <View style={styles.gap}>
          <StateCard title="Câmera não encontrada" body="Ela pode ter sido removida do hub." actionLabel="Voltar" onAction={back} />
        </View>
      </Screen>
    );
  }

  const elapsed = cam.recStartedAt ? (now.getTime() - new Date(cam.recStartedAt).getTime()) / 1000 : 0;

  const toggleRec = () => {
    if (!prov) return openCloudDialog();
    if (cam.recording) {
      stop(cam.id);
      toast.show(`Gravação enviada ao ${prov.name}`);
    } else start(cam.id);
  };

  return (
    <Screen maxWidth={maxWidth.live} bottomInset={40} testID="screen-live" contentStyle={styles.content}>
      <Header title={cam.name} subtitle={`${cam.room} · ${cam.online ? 'Wi‑Fi forte' : 'Sem conexão'}`} onBack={back} />

      <View
        accessibilityLabel={`Vídeo ao vivo de ${cam.name}`}
        style={[styles.video, { height: videoHeight, backgroundColor: cam.online ? neutral[800] : neutral[300] }]}
      >
        {cam.online ? (
          <>
            <FeedPlaceholder cx="65%" cy="35%" glow={neutral[600]} radius="60%" />
            <View style={styles.badges}>
              <LiveBadge label={`AO VIVO · ${quality}`} style={styles.bigBadge} />
              {cam.recording ? (
                <View style={[styles.bigBadge, styles.recBadge]}>
                  <PulseDot size={8} />
                  <Text size={12} weight="semibold" color={colors.bg} tabular>
                    {formatElapsed(elapsed)}
                  </Text>
                </View>
              ) : null}
            </View>
            {muted ? (
              <View style={[styles.bigBadge, styles.muteBadge]}>
                <Text size={12} color={neutral[100]}>
                  Áudio mudo
                </Text>
              </View>
            ) : null}
            <Text size={12} color={neutral[200]} tabular style={styles.stamp}>
              {formatDayMonth(now)} {formatClock(now)}
            </Text>
          </>
        ) : (
          <View style={styles.offline}>
            <Icon icon={WifiOff} size={24} color={neutral[700]} />
            <Text size={13} color={neutral[700]}>
              Sem conexão
            </Text>
          </View>
        )}
      </View>

      <Button
        testID="record-button"
        size="xl"
        block
        disabled={!cam.online}
        label={cam.recording ? 'Parar e salvar na nuvem' : prov ? `Gravar no ${prov.name}` : 'Gravar na nuvem'}
        leading={<View style={[styles.recShape, { borderRadius: cam.recording ? 4 : 999, backgroundColor: cam.recording ? neutral[100] : colors.bg }]} />}
        colorsOverride={cam.recording ? { bg: neutral[900], fg: neutral[100], bgHover: neutral[800], bgPressed: neutral[800] } : undefined}
        onPress={toggleRec}
      />

      <View style={styles.actions}>
        <ActionTile
          icon={CameraIcon}
          label="Foto"
          onPress={() => {
            if (!prov) return openCloudDialog();
            snapshot(cam.id)
              .then(() => toast.show(`Foto salva no ${prov.name}`))
              .catch(() => undefined);
          }}
          disabled={!cam.online}
        />
        <ActionTile
          icon={Mic}
          label={muted ? 'Mudo' : 'Áudio'}
          active={muted}
          activeBg={accent[200]}
          onPress={() => setMuted((m) => !m)}
          disabled={!cam.online}
          a11yState={{ checked: muted }}
          a11yLabel="Áudio mudo"
        />
        <ActionTile
          icon={Volume2}
          label={talking ? 'Falando…' : 'Falar'}
          active={talking}
          activeBg={sage[300]}
          onPress={() => setTalking((t) => !t)}
          disabled={!cam.online}
          a11yState={{ checked: talking }}
          a11yLabel="Falar pela câmera"
        />
      </View>

      <View style={styles.events}>
        <Heading size={19}>Hoje</Heading>
        {todayEvents(allEvents, cam.id, now).length === 0 ? (
          <Text size={13} color={neutral[700]}>
            Nenhum evento hoje.
          </Text>
        ) : null}
        {todayEvents(allEvents, cam.id, now).map((e) => (
          <View key={e.id} style={styles.eventRow}>
            <Text size={13} weight="semibold" tabular style={styles.eventTime}>
              {formatTime(e.at)}
            </Text>
            <Text size={14} style={styles.eventLabel}>
              {e.label}
            </Text>
            <Tag label={e.tag} variant="accent2" />
          </View>
        ))}
      </View>
    </Screen>
  );
}

function todayEvents(events: UiEvent[], cameraId: string, now: Date) {
  return events
    .filter((e) => e.cameraId === cameraId && new Date(e.at).toDateString() === now.toDateString())
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);
}

function Header({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <IconButton icon={ChevronLeft} accessibilityLabel="Voltar" onPress={onBack} testID="back" />
      <View style={styles.headerTexts}>
        <Heading size={22} lineHeight={24} numberOfLines={1}>
          {title}
        </Heading>
        {subtitle ? (
          <Text size={12} color={neutral[700]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

type ActionTileProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  activeBg?: string;
  disabled?: boolean;
  /** Para alternâncias (Áudio/Falar): anunciado como interruptor. */
  a11yState?: { checked: boolean };
  a11yLabel?: string;
};

function ActionTile({ icon, label, onPress, active, activeBg, disabled, a11yState, a11yLabel }: ActionTileProps) {
  const { hovered, focused, handlers } = useInteraction();
  const bg = active ? (activeBg ?? colors.surface) : hovered ? neutral[300] : colors.surface;
  return (
    <Pressable
      accessibilityRole={a11yState ? 'switch' : 'button'}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ ...a11yState, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed || (active && hovered) ? 0.85 : 1 },
        focused && focusRing,
      ]}
    >
      <Icon icon={icon} size={22} />
      <Text size={12}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  gap: { marginTop: space[4] },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTexts: { flex: 1, minWidth: 0 },
  video: { width: '100%', borderRadius: radius.lg, overflow: 'hidden' },
  badges: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', gap: 6 },
  bigBadge: { paddingVertical: 4, paddingHorizontal: 10 },
  recBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.accent },
  muteBadge: { position: 'absolute', top: 14, right: 14, borderRadius: 999, backgroundColor: colors.liveBadge },
  stamp: { position: 'absolute', left: 16, bottom: 14 },
  offline: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  recShape: { width: 18, height: 18 },
  actions: { flexDirection: 'row', gap: space[3] },
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.lg, minHeight: 44 },
  events: { gap: space[2] },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  eventTime: { width: 42 },
  eventLabel: { flex: 1 },
});
