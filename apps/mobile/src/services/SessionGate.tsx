import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { isDemo } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/state/session';

import { startSync } from './sync';

const PUBLIC_ROUTES = new Set(['entrar']);

/**
 * No modo real: lê a sessão, descobre o hub da conta, liga a sincronização e
 * manda para Entrar ou Vincular hub quando falta algo. No modo demonstração não faz nada.
 */
export function SessionGate() {
  const router = useRouter();
  const segments = useSegments();
  const { status, hubId, hubsLoaded, session } = useSession();
  const setSession = useSession((s) => s.set);

  // sessão
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession({ session: data.session, status: data.session ? 'signedIn' : 'signedOut' }));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession({ session: s, status: s ? 'signedIn' : 'signedOut', ...(s ? {} : { hubId: null, hubsLoaded: false }) });
    });
    return () => data.subscription.unsubscribe();
  }, [setSession]);

  // hub da conta
  const userId = session?.user.id;
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;
    let cancelled = false;
    supabase
      .from('hubs')
      .select('id')
      .eq('owner_id', userId)
      .order('created_at')
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setSession({ hubId: data?.[0]?.id ?? null, hubsLoaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, setSession]);

  // sincronização com o hub
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !hubId) return;
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    startSync(supabase, hubId).then((s) => {
      if (cancelled) s();
      else stop = s;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [hubId]);

  // rotas
  const first = segments[0] as string | undefined;
  useEffect(() => {
    if (isDemo || status === 'checking') return;
    if (status === 'signedOut' && !PUBLIC_ROUTES.has(first ?? '')) router.replace('/entrar');
    else if (status === 'signedIn' && first === 'entrar') router.replace(hubId ? '/' : '/parear');
    else if (status === 'signedIn' && hubsLoaded && !hubId && first !== 'parear') router.replace('/parear');
  }, [status, hubId, hubsLoaded, first, router]);

  return null;
}
