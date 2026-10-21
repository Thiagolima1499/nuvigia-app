import { useRouter } from 'expo-router';
import { Check, ChevronRight, Video, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Heading, Icon, IconButton, Input, Spinner, SwitchRow, Text } from '@/components/ui';
import { MOCK_DEVICES, MOCK_SSID, type DiscoveredDevice } from '@/data/mock';
import { PROVIDERS } from '@/data/providers';
import { useInteraction } from '@/hooks/useInteraction';
import { hubClientRef } from '@/services/sync';
import { useAppStore } from '@/state/store';
import { accent, colors, focusRing, maxWidth, neutral, radius, sage, space } from '@/theme/theme';

type Step = 'scan' | 'form' | 'conn';
const STEP_LABEL: Record<Step, string> = { scan: 'Passo 1 de 3', form: 'Passo 2 de 3', conn: 'Passo 3 de 3' };
const MIN_PASS = 8;
/** Dispositivo usado quando a pessoa escolhe "Adicionar por IP ou QR code". */
const MANUAL: DiscoveredDevice = { model: 'câmera por IP', ip: '' };

/** Fluxo Adicionar câmera em 3 passos (descoberta e conexão simuladas). */
export default function AddCameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cloud = useAppStore((s) => s.cloud);
  const addCamera = useAppStore((s) => s.addCamera);
  const live = useAppStore((s) => s.mode === 'live');
  const [devices, setDevices] = useState<DiscoveredDevice[]>(live ? [] : MOCK_DEVICES);
  const [addError, setAddError] = useState<string | null>(null);
  const [newCamId, setNewCamId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('scan');
  const [found, setFound] = useState(0);
  const [picked, setPicked] = useState<DiscoveredDevice | null>(null);
  const [name, setName] = useState('Cozinha');
  const [room, setRoom] = useState('Térreo');
  const [pass, setPass] = useState('');
  const [passErr, setPassErr] = useState(false);
  const [address, setAddress] = useState('');
  const [addressErr, setAddressErr] = useState(false);
  const [camUser, setCamUser] = useState('');
  const [camPass, setCamPass] = useState('');
  const [toCloud, setToCloud] = useState(true);
  const [conn, setConn] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => {
    const list = timers.current;
    const hub = hubClientRef.current;
    if (live && hub) {
      // descoberta real: o hub procura por ONVIF/WS-Discovery e manda cada câmera encontrada
      const off = hub.onEvent((e) => {
        if (e.type === 'cameraDiscovered') {
          setDevices((d) => (d.some((x) => x.ip === e.ip) ? d : [...d, { model: e.model, ip: e.ip }]));
        } else if (e.type === 'addCameraProgress') {
          setConn(e.step);
        }
      });
      hub.send({ type: 'discoverCameras' }, 30_000).catch(() => undefined);
      return () => {
        off();
        list.forEach(clearTimeout);
      };
    }
    later(() => setFound(1), 1200);
    later(() => setFound(3), 2200);
    return () => list.forEach(clearTimeout);
  }, [live]);

  const manual = picked === MANUAL;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const side = Math.max(space[4], (width - maxWidth.addCamera) / 2);
  const provName = cloud ? PROVIDERS[cloud].name : 'nuvem';

  const connect = () => {
    // No modo real a câmera já está no Wi‑Fi (foi encontrada na rede): pedimos só o login dela.
    const badPass = !live && pass.length < MIN_PASS;
    const badAddr = manual && address.trim().length === 0;
    setPassErr(badPass);
    setAddressErr(badAddr);
    if (badPass || badAddr) return;
    setStep('conn');
    setConn(0);
    setAddError(null);
    const hub = hubClientRef.current;
    if (live && hub) {
      setConn(1);
      const ip = manual ? address.trim() : (picked?.ip ?? '');
      hub
        .send<{ cameraId: string }>(
          {
            type: 'addCamera',
            name: name.trim() || 'Nova câmera',
            room: room.trim(),
            ip: ip.startsWith('rtsp://') ? '' : ip,
            rtspUrl: ip.startsWith('rtsp://') ? ip : undefined,
            username: camUser || undefined,
            password: camPass || undefined,
            uploadToCloud: toCloud,
          },
          60_000,
        )
        .then((r) => {
          setNewCamId(r.cameraId);
          setConn(3);
        })
        .catch((e: Error) => setAddError(e.message === 'auth_failed' ? 'Usuário ou senha da câmera incorretos.' : 'Não foi possível conectar a câmera.'));
      return;
    }
    [900, 1900, 2900].forEach((ms, i) => later(() => setConn(i + 1), ms));
  };

  const finish = () => {
    if (live && newCamId) return router.replace(`/camera/${newCamId}`);
    const id = addCamera({ name, room, model: manual ? 'Câmera ONVIF' : (picked?.model ?? 'Câmera'), ip: manual ? address.trim() : (picked?.ip ?? ''), uploadToCloud: toCloud });
    router.replace(`/camera/${id}`);
  };

  const visibleDevices = live ? devices : devices.slice(0, found);
  const shown = visibleDevices.length;
  const steps = ['Câmera encontrada', live ? 'Conectando à câmera' : `Conectando ao Wi‑Fi ${MOCK_SSID}`, toCloud ? `Vinculando ao ${provName}` : 'Preparando transmissão'];
  const done = conn >= 3;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        testID="screen-add"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + 32, paddingHorizontal: side }]}
      >
        <View style={styles.top}>
          <Text size={13} color={neutral[700]}>
            {STEP_LABEL[step]}
          </Text>
          <IconButton icon={X} accessibilityLabel="Fechar" onPress={close} testID="close-add" />
        </View>

        {step === 'scan' ? (
          <>
            <Heading size={30} lineHeight={33}>
              Procurando câmeras na sua rede
            </Heading>
            <Text size={14} color={neutral[800]} style={styles.lead}>
              {live ? (
                'Ligue a câmera e espere ela entrar no Wi‑Fi da casa. O hub procura câmeras ONVIF na rede.'
              ) : (
                <>
                  Ligue a câmera e deixe o celular conectado ao Wi‑Fi <Text size={14} weight="bold" color={neutral[800]}>{MOCK_SSID}</Text>.
                </>
              )}
            </Text>
            <View style={styles.scanPill} accessibilityLiveRegion="polite">
              <Spinner />
              <Text size={14} color={accent[800]}>
                {shown ? `${shown} ${shown > 1 ? 'câmeras encontradas' : 'câmera encontrada'}, buscando mais…` : 'Buscando no Wi‑Fi…'}
              </Text>
            </View>
            {visibleDevices.map((d) => (
              <DeviceRow
                key={d.ip}
                device={d}
                onPress={() => {
                  setPicked(d);
                  setStep('form');
                }}
              />
            ))}
            <Button
              label="Adicionar por IP ou QR code"
              variant="ghost"
              onPress={() => {
                setPicked(MANUAL);
                setStep('form');
              }}
            />
          </>
        ) : null}

        {step === 'form' ? (
          <>
            <Heading size={30} lineHeight={33}>
              Configurar {picked?.model ?? 'câmera'}
            </Heading>
            {manual || live ? (
              <>
                {manual ? (
                <Input
                  label="Endereço IP ou URL RTSP"
                  value={address}
                  onChangeText={(t) => {
                    setAddress(t);
                    setAddressErr(false);
                  }}
                  placeholder="192.168.0.50 ou rtsp://…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  error={addressErr ? 'Informe o IP ou a URL RTSP da câmera.' : undefined}
                />
                ) : null}
                <Input label="Usuário da câmera" value={camUser} onChangeText={setCamUser} placeholder="admin" autoCapitalize="none" autoCorrect={false} />
                <Input label="Senha da câmera" value={camPass} onChangeText={setCamPass} placeholder="Senha RTSP/ONVIF" secureTextEntry />
              </>
            ) : null}
            <Input label="Nome da câmera" value={name} onChangeText={setName} testID="input-name" />
            <Input label="Cômodo" value={room} onChangeText={setRoom} />
            {live ? null : (
            <Input
              testID="input-wifi-pass"
              label={`Senha do Wi‑Fi ${MOCK_SSID}`}
              value={pass}
              onChangeText={(t) => {
                setPass(t);
                setPassErr(false);
              }}
              placeholder="Senha da rede"
              secureTextEntry
              error={passErr ? 'A senha precisa ter ao menos 8 caracteres.' : undefined}
              returnKeyType="done"
              onSubmitEditing={connect}
            />
            )}
            <Card padding={0} style={styles.switchCard}>
              <SwitchRow label="Gravar na nuvem" hint="Clipes de movimento enviados automaticamente" value={toCloud} onValueChange={setToCloud} />
            </Card>
            <View style={styles.spacer} />
            <Button testID="connect-camera" label="Conectar câmera" size="lg" block onPress={connect} />
          </>
        ) : null}

        {step === 'conn' ? (
          <>
            <Heading size={30} lineHeight={33} accessibilityLiveRegion="polite">
              {done ? `${name.trim() || 'Câmera'} pronta` : 'Conectando…'}
            </Heading>
            <View style={styles.connList}>
              {steps.map((label, i) => {
                const ok = conn > i;
                return (
                  <View key={label} style={[styles.connRow, { backgroundColor: ok ? sage[200] : colors.surface }]} accessibilityLabel={`${label}${ok ? ', concluído' : ', pendente'}`}>
                    <View style={[styles.connDot, { backgroundColor: ok ? sage[600] : neutral[400] }]}>
                      <Icon icon={Check} size={15} color={colors.bg} />
                    </View>
                    <Text size={14} color={ok ? sage[900] : neutral[700]}>
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>
            {addError ? (
              <Text size={13} color={accent[700]} accessibilityRole="alert">
                {addError}
              </Text>
            ) : null}
            {addError ? <Button label="Tentar de novo" variant="secondary" onPress={connect} /> : null}
            <View style={styles.spacer} />
            {done ? <Button testID="see-live" label="Ver ao vivo" size="lg" block onPress={finish} /> : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function DeviceRow({ device, onPress }: { device: DiscoveredDevice; onPress: () => void }) {
  const { hovered, focused, handlers } = useInteraction();
  return (
    <Pressable
      testID={`device-${device.ip}`}
      accessibilityRole="button"
      accessibilityLabel={`${device.model}, ${device.ip}`}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => [styles.device, { backgroundColor: hovered || pressed ? neutral[300] : colors.surface }, focused && focusRing]}
    >
      <View style={styles.deviceIcon}>
        <Icon icon={Video} size={20} color={sage[800]} />
      </View>
      <View style={styles.deviceTexts}>
        <Text size={14} weight="semibold">
          {device.model}
        </Text>
        <Text size={12} color={neutral[700]}>
          {device.ip}
        </Text>
      </View>
      <Icon icon={ChevronRight} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, gap: space[4] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lead: { lineHeight: 21 },
  scanPill: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 999, backgroundColor: accent[100] },
  device: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.lg },
  deviceIcon: { width: 42, height: 42, borderRadius: 999, backgroundColor: sage[200], alignItems: 'center', justifyContent: 'center' },
  deviceTexts: { flex: 1, gap: 2 },
  switchCard: { overflow: 'hidden' },
  spacer: { flex: 1 },
  connList: { gap: 10 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999 },
  connDot: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
