import { parsePairingPayload } from '@nuvigia/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { QrCode } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Heading, Input, Screen, Text, useToast } from '@/components/ui';
import { getSupabase } from '@/lib/supabase';
import { claimHub } from '@/services/auth';
import { useSession } from '@/state/session';
import { maxWidth, neutral, radius, space } from '@/theme/theme';

/** Vincular o hub à conta pelo código de 6 dígitos ou QR code mostrado pelo hub. */
export default function PairHubScreen() {
  const router = useRouter();
  const toast = useToast();
  const setSession = useSession((s) => s.set);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const submit = async (value: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!/^[0-9]{6}$/.test(value)) return setError('O código tem 6 dígitos.');
    setBusy(true);
    setError(null);
    try {
      const { result, hubId } = await claimHub(supabase, value);
      if (result === 'ok' && hubId) {
        setSession({ hubId, hubsLoaded: true });
        toast.show('Hub vinculado');
        router.replace('/');
      } else if (result === 'rate_limited') setError('Muitas tentativas. Espere alguns minutos.');
      else setError('Código inválido ou vencido. Gere um novo no hub.');
    } catch {
      setError('Não foi possível falar com o servidor. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const startScan = async () => {
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) return setError('Permita o uso da câmera para ler o QR code.');
    }
    handled.current = false;
    setScanning(true);
  };

  return (
    <Screen maxWidth={maxWidth.addCamera} contentStyle={styles.content} testID="screen-pair">
      <Heading size={30} lineHeight={33}>
        Vincular o hub
      </Heading>
      <Text size={14} color={neutral[800]} style={styles.lead}>
        O hub Nuvigia fica ligado na sua casa e grava as câmeras. Abra a página do hub no navegador (http://nuvigia.local:8080) e use o código que
        aparece lá. Ele vale por 10 minutos.
      </Text>
      {scanning ? (
        <View style={styles.scanner}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return;
              const parsed = parsePairingPayload(data);
              if (!parsed) return;
              handled.current = true;
              setScanning(false);
              setCode(parsed);
              submit(parsed);
            }}
          />
        </View>
      ) : null}
      <Input
        label="Código do hub"
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/\D/g, '').slice(0, 6));
          setError(null);
        }}
        keyboardType="number-pad"
        placeholder="000000"
        error={error ?? undefined}
        onSubmitEditing={() => submit(code)}
      />
      <Button label="Vincular hub" size="lg" block disabled={busy} onPress={() => submit(code)} />
      <Button
        label={scanning ? 'Cancelar leitura' : 'Ler QR code'}
        variant="secondary"
        icon={QrCode}
        onPress={scanning ? () => setScanning(false) : startScan}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[4] },
  lead: { lineHeight: 21 },
  scanner: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: neutral[800] },
});
