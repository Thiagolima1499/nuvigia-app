// Registra um hub novo: cria um usuário do Auth só para ele (role "hub"), a linha em
// public.hubs e devolve as credenciais que o hub guarda criptografadas no disco.
// O hub depois entra com e-mail/senha normais e gera o código de pareamento pela RPC
// create_pairing_code(). A service role key só existe aqui, nunca no hub nem no app.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { corsHeaders, json } from '../_shared/cors.ts';

const MAX_NAME = 60;

function randomSecret(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Proteção simples contra abuso: o hub precisa conhecer o segredo de registro do projeto,
  // definido com `supabase secrets set HUB_REGISTRATION_SECRET=...` e no .env do hub.
  const expected = Deno.env.get('HUB_REGISTRATION_SECRET');
  if (expected && req.headers.get('x-hub-registration-secret') !== expected) {
    return json({ error: 'forbidden' }, 403);
  }

  let body: { name?: unknown; version?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vazio é aceito
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, MAX_NAME) : 'Hub Nuvigia';
  const version = typeof body.version === 'string' ? body.version.slice(0, 32) : null;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const hubId = crypto.randomUUID();
  const email = `hub-${hubId}@hubs.nuvigia.invalid`;
  const password = randomSecret();

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'hub', hub_id: hubId },
  });
  if (userErr || !created.user) return json({ error: 'create_user_failed', detail: userErr?.message }, 500);

  const { error: hubErr } = await admin.from('hubs').insert({ id: hubId, hub_user_id: created.user.id, name, version });
  if (hubErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: 'create_hub_failed', detail: hubErr.message }, 500);
  }

  return json({ hubId, email, password });
});
