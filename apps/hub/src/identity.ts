import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from 'pino';

import type { Config } from './config';
import type { HubIdentity, LocalStore } from './store';

type FetchLike = typeof fetch;

/** Pede ao Supabase um usuário novo para este hub (função hub-register). */
export async function registerHub(cfg: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'HUB_REGISTRATION_SECRET' | 'HUB_NAME' | 'version'>, fetchImpl: FetchLike = fetch): Promise<HubIdentity> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    apikey: cfg.SUPABASE_ANON_KEY,
    authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
  };
  if (cfg.HUB_REGISTRATION_SECRET) headers['x-hub-registration-secret'] = cfg.HUB_REGISTRATION_SECRET;
  const url = `${cfg.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/hub-register`;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ name: cfg.HUB_NAME, version: cfg.version }) });
  } catch (e) {
    throw new Error(`não foi possível falar com o Supabase em ${cfg.SUPABASE_URL} (${(e as Error).message}). Confira a internet e o SUPABASE_URL.`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`hub-register falhou (${res.status}): ${detail.slice(0, 200)}`);
  }
  const body = (await res.json()) as Partial<HubIdentity>;
  if (!body.hubId || !body.email || !body.password) throw new Error('hub-register devolveu uma resposta incompleta');
  return { hubId: body.hubId, email: body.email, password: body.password };
}

/**
 * Garante que o hub tem identidade e sessão no Supabase.
 * Na primeira vez registra; depois só entra com e-mail e senha guardados (cifrados).
 */
export async function connectSupabase(cfg: Config, store: LocalStore, log: Logger): Promise<{ supabase: SupabaseClient; identity: HubIdentity }> {
  let identity = store.getIdentity();
  if (!identity) {
    log.info('primeira execução: registrando o hub no Supabase');
    identity = await registerHub(cfg);
    store.setIdentity(identity);
  }

  const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: identity.email, password: identity.password });
  if (error) {
    throw new Error(
      `não foi possível entrar no Supabase com a identidade do hub (${error.message}). ` +
        'Se o hub foi removido do projeto, apague data/hub.db para registrar de novo.',
    );
  }
  log.info({ hubId: identity.hubId }, 'hub conectado ao Supabase');
  return { supabase, identity };
}
