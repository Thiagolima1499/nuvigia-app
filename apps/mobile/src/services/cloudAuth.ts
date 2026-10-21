import type { CloudProviderId, HubCommand } from '@nuvigia/shared';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { config } from '@/lib/config';

WebBrowser.maybeCompleteAuthSession();

export type ConnectCloudCommand = Extract<HubCommand, { type: 'connectCloud' }>;

export class CloudLoginError extends Error {}

const GOOGLE = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
const MICROSOFT = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};
/** Escopos mínimos (README › Provedores de nuvem). */
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'email'];
export const MICROSOFT_SCOPES = ['Files.ReadWrite.AppFolder', 'offline_access'];

/** `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc` (esquema do app nativo). */
export const reverseClientId = (id: string) => id.split('.').reverse().join('.');

function googleClientId() {
  return Platform.OS === 'ios' ? config.googleClientIdIos : Platform.OS === 'android' ? config.googleClientIdAndroid : '';
}

/**
 * Faz o login (OAuth com PKCE) mas NÃO troca o código por tokens: o código e o
 * verificador vão para o hub, que guarda os tokens cifrados. O app nunca vê o token.
 */
async function oauthCode(provider: CloudProviderId): Promise<ConnectCloudCommand | null> {
  const isGoogle = provider === 'google';
  const clientId = isGoogle ? googleClientId() : config.microsoftClientId;
  if (!clientId) throw new CloudLoginError(Platform.OS === 'web' ? 'Conecte a nuvem pelo app no celular.' : 'Login com este provedor ainda não foi configurado.');
  const redirectUri = isGoogle ? `${reverseClientId(clientId)}:/oauthredirect` : AuthSession.makeRedirectUri({ scheme: 'nuvigia', path: 'oauth/microsoft' });
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: isGoogle ? GOOGLE_SCOPES : MICROSOFT_SCOPES,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    // pede o refresh token (acesso enquanto a pessoa não desconectar)
    extraParams: isGoogle ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'select_account' },
  });
  const result = await request.promptAsync(isGoogle ? GOOGLE : MICROSOFT);
  if (result.type === 'cancel' || result.type === 'dismiss') return null;
  if (result.type !== 'success' || !result.params.code || !request.codeVerifier) throw new CloudLoginError('Não foi possível entrar. Tente de novo.');
  return { type: 'connectCloud', provider, code: result.params.code, codeVerifier: request.codeVerifier, redirectUri, clientId };
}

/** Abre o login do provedor. `null` quando a pessoa cancela. */
export function cloudLogin(provider: CloudProviderId): Promise<ConnectCloudCommand | null> {
  return oauthCode(provider);
}
