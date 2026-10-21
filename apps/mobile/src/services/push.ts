import type { SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

/** Mesmo canal usado pela função notify-motion. */
export const MOTION_CHANNEL = 'movimento';

let currentToken: string | null = null;

// com o app aberto, a notificação também aparece
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export type PushResult = 'ok' | 'denied' | 'unavailable';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Pede permissão, pega o token de push da Expo e cadastra no Supabase para a conta logada.
 * Só funciona no app instalado em aparelho de verdade (não no simulador nem no navegador).
 */
export async function registerForPush(supabase: SupabaseClient): Promise<PushResult> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MOTION_CHANNEL, {
      name: 'Movimento',
      description: 'Avisos de movimento nas câmeras',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const id = projectId();
  if (!id) return 'unavailable';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) return 'unavailable';
  currentToken = token;
  return 'ok';
}

/** Ao sair da conta, o aparelho deixa de receber avisos dela. */
export async function unregisterPush(supabase: SupabaseClient) {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

/** Câmera a abrir quando a pessoa toca na notificação. */
export function cameraFromNotification(response: Notifications.NotificationResponse | null | undefined): string | null {
  const data = response?.notification.request.content.data as { cameraId?: unknown } | undefined;
  return typeof data?.cameraId === 'string' ? data.cameraId : null;
}
