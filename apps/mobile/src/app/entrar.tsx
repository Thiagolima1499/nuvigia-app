import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button, Heading, Input, Screen, Text, useToast } from '@/components/ui';
import { getSupabase } from '@/lib/supabase';
import { sendEmailCode, signInWithGoogle, verifyEmailCode } from '@/services/auth';
import { accent, maxWidth, neutral, space } from '@/theme/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Entrar: código por e-mail (6 dígitos) ou Google. Tela não desenhada no hand-off; segue o Organic. */
export default function SignInScreen() {
  const toast = useToast();
  const supabase = getSupabase();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!supabase) return;
    if (!EMAIL_RE.test(email.trim())) return setError('Digite um e-mail válido.');
    setBusy(true);
    setError(null);
    try {
      await sendEmailCode(supabase, email);
      setSent(true);
      toast.show('Código enviado para o seu e-mail');
    } catch {
      setError('Não foi possível enviar o código. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!supabase) return;
    if (!/^[0-9]{6}$/.test(code.trim())) return setError('O código tem 6 dígitos.');
    setBusy(true);
    setError(null);
    try {
      await verifyEmailCode(supabase, email, code);
    } catch {
      setError('Código inválido ou vencido.');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(supabase);
    } catch {
      setError('Não foi possível entrar com Google.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen maxWidth={maxWidth.addCamera} contentStyle={styles.content} testID="screen-sign-in">
        <View style={styles.brand}>
          <Heading size={17} color={accent[700]} accessibilityRole="text">
            Nuvigia
          </Heading>
          <Text size={12} color={neutral[700]}>
            Câmeras Wi-Fi
          </Text>
        </View>
        <Heading size={30} lineHeight={33}>
          {sent ? 'Digite o código' : 'Entrar'}
        </Heading>
        <Text size={14} color={neutral[800]} style={styles.lead}>
          {sent ? `Enviamos um código de 6 dígitos para ${email.trim()}.` : 'Use seu e-mail para entrar ou criar a conta. Enviamos um código, sem senha.'}
        </Text>
        {sent ? (
          <Input
            label="Código"
            value={code}
            onChangeText={(t) => {
              setCode(t.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            placeholder="000000"
            error={error ?? undefined}
            onSubmitEditing={verify}
          />
        ) : (
          <Input
            label="E-mail"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="voce@exemplo.com"
            error={error ?? undefined}
            onSubmitEditing={send}
          />
        )}
        <Button label={sent ? 'Entrar' : 'Receber código'} size="lg" block disabled={busy} onPress={sent ? verify : send} />
        {sent ? (
          <Button
            label="Usar outro e-mail"
            variant="ghost"
            onPress={() => {
              setSent(false);
              setCode('');
            }}
          />
        ) : (
          <>
            <Text size={12} color={neutral[700]} style={styles.or}>
              ou
            </Text>
            <Button label="Entrar com Google" variant="secondary" size="lg" block disabled={busy} onPress={google} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: space[4] },
  brand: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  lead: { lineHeight: 21 },
  or: { textAlign: 'center' },
});
