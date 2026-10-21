import type { SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

/** Endereço para onde o Supabase devolve o login (nuvigia://auth, ou exp:// no Expo Go). */
export const authRedirectUrl = () => Linking.createURL('auth');

/** Envia o código de 6 dígitos para o e-mail (cria a conta se não existir). */
export async function sendEmailCode(supabase: SupabaseClient, email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(supabase: SupabaseClient, email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw error;
}

/** Login com Google pelo navegador do sistema (OAuth PKCE do Supabase). */
export async function signInWithGoogle(supabase: SupabaseClient): Promise<boolean> {
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) throw error ?? new Error('oauth_url');
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return false;
  const code = new URL(res.url).searchParams.get('code');
  if (!code) throw new Error('oauth_no_code');
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;
  return true;
}

export type ClaimResult = 'ok' | 'invalid' | 'rate_limited';

/** Vincula o hub à conta com o código exibido por ele. */
export async function claimHub(supabase: SupabaseClient, code: string): Promise<{ result: ClaimResult; hubId?: string }> {
  const { data, error } = await supabase.rpc('claim_pairing_code', { p_code: code });
  if (error) {
    if (error.message.includes('too many attempts')) return { result: 'rate_limited' };
    throw error;
  }
  if (!data) return { result: 'invalid' };
  return { result: 'ok', hubId: data as string };
}
