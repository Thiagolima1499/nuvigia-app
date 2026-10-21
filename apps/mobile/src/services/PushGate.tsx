import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/state/session';
import { useAppStore } from '@/state/store';

import { cameraFromNotification, registerForPush } from './push';

/**
 * Notificações de movimento: cadastra o aparelho quando há hub e o aviso está ligado,
 * e abre a câmera certa ao tocar na notificação (inclusive com o app fechado).
 */
export function PushGate() {
  const router = useRouter();
  const hubId = useSession((s) => s.hubId);
  const notify = useAppStore((s) => s.switches.notifyMotion);
  const live = useAppStore((s) => s.mode === 'live');
  const last = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const supabase = getSupabase();
    if (!live || !supabase || !hubId || !notify) return;
    registerForPush(supabase).catch(() => undefined);
  }, [live, hubId, notify]);

  useEffect(() => {
    const id = cameraFromNotification(last);
    if (id) router.push(`/camera/${id}`);
  }, [last, router]);

  return null;
}
