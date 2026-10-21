import { Camera, ChevronLeft, ChevronRight, CloudUpload, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BottomSheet,
  Button,
  Card,
  DialogBody,
  Heading,
  Icon,
  IconButton,
  Input,
  ListCard,
  LiveBadge,
  ProgressBar,
  Radio,
  RadioGroup,
  RecBadge,
  Screen,
  Segmented,
  Spinner,
  Switch,
  SwitchRow,
  TabBar,
  Tag,
  Text,
  useToast,
  type TabKey,
} from '@/components/ui';
import { accent, colors, maxWidth, neutral, radius, sage, shadow, space } from '@/theme/theme';

const QUALITIES = ['720p', '1080p', '2K'] as const;
const PROVIDERS = [
  { key: 'google', name: 'Google Drive', note: '15 GB grátis', cta: 'Entrar com Google' },
  { key: 'onedrive', name: 'OneDrive', note: '5 GB grátis', cta: 'Entrar com Microsoft' },
  { key: 'icloud', name: 'iCloud Drive', note: '5 GB grátis', cta: 'Entrar com Apple' },
] as const;
type ProviderKey = (typeof PROVIDERS)[number]['key'];

/** Catálogo de componentes base (etapa 1), para revisão visual. */
export default function Catalogo() {
  const toast = useToast();
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]>('1080p');
  const [mode, setMode] = useState<'motion' | 'continuous'>('motion');
  const [wifiOnly, setWifiOnly] = useState(true);
  const [notify, setNotify] = useState(true);
  const [plain, setPlain] = useState(false);
  const [name, setName] = useState('Cozinha');
  const [pass, setPass] = useState('');
  const [passErr, setPassErr] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [pick, setPick] = useState<ProviderKey>('google');
  const [tab, setTab] = useState<TabKey>('cameras');
  const picked = PROVIDERS.find((p) => p.key === pick) ?? PROVIDERS[0];

  return (
    <Screen maxWidth={maxWidth.settings} bottomInset={space[8]} testID="catalogo">
      <View style={styles.header}>
        <View style={styles.brand}>
          <Heading size={17} color={accent[700]} accessibilityRole="text">
            Nuvigia
          </Heading>
          <Text size={12} color={neutral[700]}>
            Câmeras Wi-Fi
          </Text>
        </View>
        <Heading size={32} lineHeight={34}>
          Catálogo
        </Heading>
        <Text size={13} color={neutral[700]}>
          Componentes base do design system Organic. Toque em tudo para ver os estados.
        </Text>
      </View>

      <Section title="Cores">
        <Swatches label="Neutro" ramp={neutral} />
        <Swatches label="Destaque" ramp={accent} />
        <Swatches label="Sálvia" ramp={sage} />
        <View style={styles.swatchRow}>
          {[
            ['Fundo', colors.bg],
            ['Superfície', colors.surface],
            ['Texto', colors.text],
            ['Destaque', colors.accent],
            ['Destaque 2', colors.accent2],
          ].map(([l, c]) => (
            <View key={l} style={styles.swatchBig}>
              <View style={[styles.swatchChip, { backgroundColor: c, borderColor: colors.divider }]} />
              <Text size={11} color={neutral[700]}>
                {l}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Tipografia">
        {([32, 30, 22, 19, 17] as const).map((s) => (
          <Heading key={s} size={s} accessibilityRole="text">
            Caprasimo {s}
          </Heading>
        ))}
        {([16, 15, 14, 13, 12, 11] as const).map((s) => (
          <Text key={s} size={s}>
            Figtree {s} · <Text size={s} weight="semibold">600</Text> · <Text size={s} weight="bold">700</Text>
          </Text>
        ))}
        <Text size={14} color={colors.accentText}>
          Texto laranja em parágrafo usa accent-700.
        </Text>
      </Section>

      <Section title="Botões">
        <View style={styles.wrap}>
          <Button label="Conectar nuvem" onPress={() => toast.show('Botão primário')} />
          <Button label="Agora não" variant="secondary" />
          <Button label="Adicionar por IP ou QR code" variant="ghost" />
          <Button label="Desativado" disabled />
        </View>
        <Button label="Conectar câmera" size="lg" block />
        <Button label="Gravar no Google Drive" size="xl" block leading={<View style={[styles.recShape, { borderRadius: 999 }]} />} />
        <Button
          label="Parar e salvar na nuvem"
          size="xl"
          block
          leading={<View style={[styles.recShape, { borderRadius: 4, backgroundColor: neutral[100] }]} />}
          colorsOverride={{ bg: neutral[900], fg: neutral[100], bgHover: neutral[800], bgPressed: neutral[800] }}
        />
      </Section>

      <Section title="Botões de ícone">
        <View style={styles.wrap}>
          <IconButton icon={Plus} variant="primary" accessibilityLabel="Adicionar câmera" />
          <IconButton icon={ChevronLeft} accessibilityLabel="Voltar" />
          <IconButton icon={X} accessibilityLabel="Fechar" />
        </View>
      </Section>

      <Section title="Tags e selos">
        <View style={styles.wrap}>
          <Tag label="Enviando 64%" variant="accent" />
          <Tag label="No Drive" variant="accent2" />
          <Tag label="Desligado" variant="neutral" />
          <Tag label="Novo" variant="outline" />
        </View>
        <View style={[styles.preview]}>
          <View style={styles.wrap}>
            <LiveBadge />
            <RecBadge />
            <LiveBadge label="AO VIVO · 1080p" />
            <RecBadge label="12:34" />
          </View>
          <Text size={11} color={neutral[200]} tabular>
            14:32:07
          </Text>
        </View>
        <View style={styles.rowCenter}>
          <Spinner />
          <Text size={13} color={accent[800]}>
            Buscando no Wi‑Fi…
          </Text>
        </View>
        <ProgressBar value={38} track={sage[100]} fill={sage[600]} />
        <ProgressBar value={64} height={6} track={neutral[300]} fill={colors.accent} />
      </Section>

      <Section title="Segmentado">
        <Segmented accessibilityLabel="Qualidade da gravação" options={QUALITIES} value={quality} onChange={setQuality} />
        <Text size={12} color={neutral[700]}>
          Selecionado: {quality}
        </Text>
      </Section>

      <Section title="Rádio">
        <RadioGroup accessibilityLabel="Quando gravar">
          <Radio label="Só quando houver movimento" selected={mode === 'motion'} onPress={() => setMode('motion')} />
          <Radio label="O tempo todo" selected={mode === 'continuous'} onPress={() => setMode('continuous')} />
        </RadioGroup>
      </Section>

      <Section title="Interruptor">
        <View style={styles.rowCenter}>
          <Switch value={plain} onValueChange={setPlain} accessibilityLabel="Interruptor de exemplo" />
          <Text size={14}>{plain ? 'Ligado' : 'Desligado'}</Text>
        </View>
        <ListCard>
          <SwitchRow label="Enviar só no Wi‑Fi" hint="Não usa seus dados móveis" value={wifiOnly} onValueChange={setWifiOnly} />
          <SwitchRow label="Avisar quando houver movimento" hint="Notificação com foto da câmera" value={notify} onValueChange={setNotify} />
        </ListCard>
      </Section>

      <Section title="Campos">
        <Input label="Nome da câmera" value={name} onChangeText={setName} />
        <Input
          label="Senha do Wi‑Fi Casa_5G"
          value={pass}
          onChangeText={(t) => {
            setPass(t);
            setPassErr(false);
          }}
          secureTextEntry
          error={passErr ? 'A senha precisa ter ao menos 8 caracteres.' : undefined}
        />
        <Button label="Validar senha" variant="secondary" onPress={() => setPassErr(pass.length < 8)} />
      </Section>

      <Section title="Cartões">
        <Card>
          <Heading size={17}>Cartão padrão</Heading>
          <Text size={13}>Raio 28px, fundo superfície, padding 17,6px.</Text>
        </Card>
        <Card background={accent[200]}>
          <Heading size={19} color={accent[900]}>
            Escolha onde salvar
          </Heading>
          <Text size={13} color={accent[900]} style={{ lineHeight: 19 }}>
            Conecte Google Drive, OneDrive ou iCloud. Sem a nuvem, as gravações ficam só no cartão de memória das câmeras.
          </Text>
          <Button label="Conectar nuvem" onPress={() => setDialog(true)} />
        </Card>
        <Card background={sage[200]} padding={0} onPress={() => toast.show('Abrir Gravações')} accessibilityLabel="Salvando no Google Drive">
          <View style={styles.cloudStrip}>
            <View style={styles.cloudCircle}>
              <Icon icon={CloudUpload} size={18} color={colors.bg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text size={14} weight="semibold" color={sage[900]}>
                Salvando no Google Drive
              </Text>
              <Text size={12} color={sage[800]}>
                1 gravando agora · 38,2 GB de 100 GB
              </Text>
            </View>
            <Icon icon={ChevronRight} size={18} color={sage[900]} />
          </View>
        </Card>
        <View style={styles.wrap}>
          {(['sm', 'md', 'lg'] as const).map((e) => (
            <Card key={e} elevation={e} background={neutral[100]} style={{ flexGrow: 1 }}>
              <Text size={13} weight="semibold">
                Sombra {e}
              </Text>
            </Card>
          ))}
        </View>
      </Section>

      <Section title="Diálogo e aviso">
        <View style={styles.wrap}>
          <Button label="Abrir diálogo" onPress={() => setDialog(true)} />
          <Button label="Mostrar aviso" variant="secondary" icon={Camera} onPress={() => toast.show('Foto salva no Google Drive')} />
        </View>
      </Section>

      <Section title="Barra de abas">
        <TabBar active={tab} onChange={setTab} floating={false} />
      </Section>

      <BottomSheet
        visible={dialog}
        onClose={() => setDialog(false)}
        title="Onde salvar as gravações?"
        actions={
          <>
            <Button label="Agora não" variant="secondary" onPress={() => setDialog(false)} />
            <Button
              label={picked.cta}
              onPress={() => {
                setDialog(false);
                toast.show(`${picked.name} conectado`);
              }}
            />
          </>
        }
      >
        <RadioGroup accessibilityLabel="Provedor de nuvem" style={{ gap: space[2] }}>
          {PROVIDERS.map((p) => (
            <Radio key={p.key} appearance="pill" label={p.name} note={p.note} selected={pick === p.key} onPress={() => setPick(p.key)} />
          ))}
        </RadioGroup>
        <DialogBody>
          {pick === 'icloud' ? 'Você vai entrar com sua Conta Apple. ' : ''}O Nuvigia vai criar a pasta “Nuvigia” no {picked.name} e salvar nela apenas
          vídeos e fotos das suas câmeras.
        </DialogBody>
      </BottomSheet>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text size={13} weight="semibold" color={neutral[700]} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Swatches({ label, ramp }: { label: string; ramp: Record<number, string> }) {
  return (
    <View style={{ gap: 4 }}>
      <Text size={12} color={neutral[700]}>
        {label}
      </Text>
      <View style={styles.ramp}>
        {Object.entries(ramp).map(([step, c]) => (
          <View key={step} accessibilityLabel={`${label} ${step}: ${c}`} style={[styles.rampChip, { backgroundColor: c }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },
  brand: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  section: { marginTop: space[6], gap: space[2] },
  sectionBody: { gap: space[3] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ramp: { flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden' },
  rampChip: { flex: 1, height: 36 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  swatchBig: { alignItems: 'center', gap: 4 },
  swatchChip: { width: 48, height: 48, borderRadius: 999, borderWidth: 1 },
  preview: {
    borderRadius: radius.lg,
    backgroundColor: neutral[800],
    padding: space[3],
    gap: space[6],
    boxShadow: shadow.sm,
  },
  recShape: { width: 18, height: 18, backgroundColor: colors.bg },
  cloudStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  cloudCircle: { width: 34, height: 34, borderRadius: 999, backgroundColor: sage[600], alignItems: 'center', justifyContent: 'center' },
});
