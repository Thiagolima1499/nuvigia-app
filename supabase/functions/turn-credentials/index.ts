// Devolve os servidores ICE (STUN + TURN com senha temporária) para o ao vivo remoto.
// Só para quem está logado: pessoa com hub pareado ou o próprio hub.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { corsHeaders, json } from '../_shared/cors.ts';
import { iceServers } from './turn.ts';

const TTL_SEC = 60 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);

  // pela RLS, a pessoa só enxerga os próprios hubs (e o hub, a si mesmo)
  const { count } = await supabase.from('hubs').select('id', { count: 'exact', head: true });
  if (!count) return json({ error: 'no_hub' }, 403);

  const servers = await iceServers(
    { TURN_SECRET: Deno.env.get('TURN_SECRET'), TURN_URLS: Deno.env.get('TURN_URLS'), STUN_URLS: Deno.env.get('STUN_URLS') },
    data.user.id,
    TTL_SEC,
  );
  return json({ iceServers: servers, ttl: TTL_SEC });
});
