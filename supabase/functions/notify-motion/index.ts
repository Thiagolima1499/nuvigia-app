// Envia a notificação "Movimento" com a foto do evento para os celulares do dono do hub.
// Chamado pelo hub logo depois de registrar o evento (com o JWT do próprio hub).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { corsHeaders, json } from '../_shared/cors.ts';
import { buildMessages, COOLDOWN_SECONDS, deadTokens, isExpoToken, type PushTicket } from './push.ts';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
const IMAGE_TTL_SEC = 60 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: who } = await caller.auth.getUser();
  if (!who.user || who.user.app_metadata?.role !== 'hub') return json({ error: 'forbidden' }, 403);

  let eventId = '';
  try {
    eventId = String(((await req.json()) as { eventId?: unknown }).eventId ?? '');
  } catch {
    // corpo inválido
  }
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return json({ error: 'invalid_event' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // o evento precisa ser do hub que chamou
  const { data: ev } = await admin
    .from('events')
    .select('id, at, type, camera_id, hub_id, owner_id, thumbnail_path, notified, hubs!inner(hub_user_id), cameras!inner(name, room)')
    .eq('id', eventId)
    .maybeSingle();
  const hub = ev?.hubs as unknown as { hub_user_id: string } | undefined;
  if (!ev || hub?.hub_user_id !== who.user.id) return json({ error: 'not_found' }, 404);
  if (ev.type !== 'motion' && ev.type !== 'person') return json({ sent: 0, reason: 'not_motion' });
  if (ev.notified || !ev.owner_id) return json({ sent: 0, reason: ev.notified ? 'already_sent' : 'no_owner' });

  const { data: settings } = await admin.from('settings').select('notify_motion').eq('hub_id', ev.hub_id).maybeSingle();
  if (settings && !settings.notify_motion) return json({ sent: 0, reason: 'disabled' });

  // uma notificação por câmera a cada minuto, no máximo
  const since = new Date(Date.parse(ev.at) - COOLDOWN_SECONDS * 1000).toISOString();
  const { count } = await admin.from('events').select('id', { count: 'exact', head: true }).eq('camera_id', ev.camera_id).eq('notified', true).gte('at', since);
  if (count) return json({ sent: 0, reason: 'cooldown' });

  const { data: rows } = await admin.from('push_tokens').select('token').eq('user_id', ev.owner_id);
  const tokens = (rows ?? []).map((r) => r.token as string).filter(isExpoToken);
  await admin.from('events').update({ notified: true }).eq('id', ev.id);
  if (tokens.length === 0) return json({ sent: 0, reason: 'no_devices' });

  let imageUrl: string | null = null;
  if (ev.thumbnail_path) {
    const { data: signed } = await admin.storage.from('thumbnails').createSignedUrl(ev.thumbnail_path, IMAGE_TTL_SEC);
    imageUrl = signed?.signedUrl ?? null;
  }

  const cam = ev.cameras as unknown as { name: string; room: string };
  const messages = buildMessages({ tokens, cameraId: ev.camera_id, cameraName: cam.name, room: cam.room, eventId: ev.id, imageUrl });
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const res = await fetch(EXPO_PUSH, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) return json({ error: 'push_failed', status: res.status }, 502);
  const { data: tickets } = (await res.json()) as { data: PushTicket[] };
  const dead = deadTokens(messages, tickets ?? []);
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  return json({ sent: messages.length - dead.length });
});
