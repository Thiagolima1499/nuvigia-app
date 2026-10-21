import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Heading, ListCard, Radio, RadioGroup, Screen, Segmented, SwitchRow, Tag, Text } from '@/components/ui';
import { PROVIDER_ORDER, PROVIDERS } from '@/data/providers';
import { SectionLabel } from '@/features/common/SectionLabel';
import { useInteraction } from '@/hooks/useInteraction';
import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/state/session';
import { useAppStore, useCloudInfo, type Switches } from '@/state/store';
import { fonts, focusRing, maxWidth, neutral, sage, space } from '@/theme/theme';

const QUALITIES = ['720p', '1080p', '2K'] as const;
const QUALITY_HINT: Record<(typeof QUALITIES)[number], string> = {
  '720p': 'Cerca de 0,4 GB por hora de vídeo',
  '1080p': 'Cerca de 0,9 GB por hora de vídeo',
  '2K': 'Cerca de 1,8 GB por hora de vídeo',
};
const SWITCHES: { key: keyof Switches; label: string; hint: string }[] = [
  { key: 'wifiOnly', label: 'Enviar só no Wi‑Fi', hint: 'Não usa seus dados móveis' },
  { key: 'notifyMotion', label: 'Avisar quando houver movimento', hint: 'Notificação com foto da câmera' },
  { key: 'deleteAfter30', label: 'Apagar da nuvem após 30 dias', hint: 'Libera espaço automaticamente' },
];

export default function SettingsScreen() {
  const cloud = useAppStore((s) => s.cloud);
  const quality = useAppStore((s) => s.quality);
  const recordMode = useAppStore((s) => s.recordMode);
  const switches = useAppStore((s) => s.switches);
  const setQuality = useAppStore((s) => s.setQuality);
  const setRecordMode = useAppStore((s) => s.setRecordMode);
  const toggleSwitch = useAppStore((s) => s.toggleSwitch);
  const openCloudDialog = useAppStore((s) => s.openCloudDialog);
  const disconnect = useAppStore((s) => s.disconnectCloud);
  const info = useCloudInfo();
  const live = useAppStore((s) => s.mode === 'live');
  const email = useSession((s) => s.session?.user.email);

  return (
    <Screen maxWidth={maxWidth.settings} bottomInset={110} testID="screen-settings" contentStyle={styles.content}>
      <Heading size={32} lineHeight={36}>
        Ajustes
      </Heading>

      <View style={styles.group}>
        <SectionLabel>Onde salvar as gravações</SectionLabel>
        <ListCard>
          {PROVIDER_ORDER.map((id) => {
            const p = PROVIDERS[id];
            const active = cloud === id;
            return (
              <ProviderRow
                key={id}
                testID={`provider-${id}`}
                initial={p.initial}
                badgeBg={p.badgeBg}
                badgeFg={p.badgeFg}
                name={p.name}
                sub={active ? (info?.account ?? p.account) : 'Não conectado'}
                active={active}
                onPress={active ? undefined : () => openCloudDialog(id)}
              />
            );
          })}
        </ListCard>
        {cloud ? <Button label={`Desconectar ${PROVIDERS[cloud].name}`} variant="secondary" onPress={disconnect} /> : null}
      </View>

      <View style={styles.group}>
        <SectionLabel>Qualidade da gravação</SectionLabel>
        <Segmented accessibilityLabel="Qualidade da gravação" options={QUALITIES} value={quality} onChange={setQuality} />
        <Text size={12} color={neutral[700]}>
          {QUALITY_HINT[quality]}
        </Text>
      </View>

      <View style={[styles.group, { gap: 10 }]}>
        <SectionLabel>Quando gravar</SectionLabel>
        <RadioGroup accessibilityLabel="Quando gravar" style={{ gap: 0 }}>
          <Radio label="Só quando houver movimento" selected={recordMode === 'motion'} onPress={() => setRecordMode('motion')} />
          <Radio label="O tempo todo" selected={recordMode === 'continuous'} onPress={() => setRecordMode('continuous')} />
        </RadioGroup>
      </View>

      <ListCard>
        {SWITCHES.map((s) => (
          <SwitchRow key={s.key} label={s.label} hint={s.hint} value={switches[s.key]} onValueChange={() => toggleSwitch(s.key)} />
        ))}
      </ListCard>

      {live ? (
        <View style={styles.group}>
          <SectionLabel>Conta</SectionLabel>
          <Text size={14}>{email ?? ''}</Text>
          <Button label="Sair" variant="secondary" onPress={() => getSupabase()?.auth.signOut()} />
        </View>
      ) : null}
    </Screen>
  );
}

type ProviderRowProps = {
  initial: string;
  badgeBg: string;
  badgeFg: string;
  name: string;
  sub: string;
  active: boolean;
  onPress?: () => void;
  testID?: string;
};

function ProviderRow({ initial, badgeBg, badgeFg, name, sub, active, onPress, testID }: ProviderRowProps) {
  const { hovered, focused, handlers } = useInteraction();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${active ? `conectado, ${sub}` : 'não conectado'}`}
      accessibilityHint={active ? undefined : `Conectar ${name}`}
      accessibilityState={{ selected: active }}
      disabled={!onPress}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: active ? sage[200] : 'transparent', opacity: !active && (hovered || pressed) ? 0.85 : 1 },
        focused && { ...focusRing, outlineOffset: -2 },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text size={16} color={badgeFg} style={styles.initial}>
          {initial}
        </Text>
      </View>
      <View style={styles.rowTexts}>
        <Text size={14} weight="semibold">
          {name}
        </Text>
        <Text size={12} color={neutral[700]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {active ? <Tag label="Conectado" variant="accent2" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  group: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  badge: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 20 },
  rowTexts: { flex: 1, minWidth: 0, gap: 2 },
});
