-- Nuvigia: Row Level Security.
-- Regra geral: cada pessoa vê só os próprios hubs, câmeras, eventos e gravações;
-- cada hub vê e escreve só os dados dele.

alter table public.profiles enable row level security;
alter table public.hubs enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.pairing_attempts enable row level security;
alter table public.cameras enable row level security;
alter table public.recordings enable row level security;
alter table public.events enable row level security;
alter table public.settings enable row level security;
alter table public.push_tokens enable row level security;

-- anon não acessa nada.
revoke all on all tables in schema public from anon;

-- profiles ------------------------------------------------------------------
create policy "profiles: ler o próprio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: editar o próprio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- hubs ----------------------------------------------------------------------
create policy "hubs: dono ou o próprio hub leem" on public.hubs
  for select to authenticated
  using (owner_id = (select auth.uid()) or hub_user_id = (select auth.uid()));
create policy "hubs: dono ou o próprio hub editam" on public.hubs
  for update to authenticated
  using (owner_id = (select auth.uid()) or hub_user_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) or hub_user_id = (select auth.uid()));
-- Só nome e URL pública podem ser alterados diretamente; dono muda por claim_pairing_code.
revoke update on public.hubs from authenticated;
grant update (name, public_url) on public.hubs to authenticated;
-- Desvincular: o dono pode apagar o hub (as câmeras e gravações saem junto).
create policy "hubs: dono apaga" on public.hubs
  for delete to authenticated using (owner_id = (select auth.uid()));

-- pairing_codes: o hub acompanha os próprios códigos; pessoas usam claim_pairing_code.
create policy "pairing_codes: hub lê os seus" on public.pairing_codes
  for select to authenticated using (hub_id = (select public.current_hub_id()));
revoke insert, update, delete on public.pairing_codes from authenticated;
revoke all on public.pairing_attempts from authenticated;

-- Tabelas filhas: mesmo padrão --------------------------------------------
-- cameras
create policy "cameras: dono lê" on public.cameras
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "cameras: dono edita" on public.cameras
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "cameras: dono apaga" on public.cameras
  for delete to authenticated using (owner_id = (select auth.uid()));
create policy "cameras: hub gerencia" on public.cameras
  for all to authenticated
  using (hub_id = (select public.current_hub_id()))
  with check (hub_id = (select public.current_hub_id()));

-- recordings
create policy "recordings: dono lê" on public.recordings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "recordings: dono apaga" on public.recordings
  for delete to authenticated using (owner_id = (select auth.uid()));
create policy "recordings: hub gerencia" on public.recordings
  for all to authenticated
  using (hub_id = (select public.current_hub_id()))
  with check (hub_id = (select public.current_hub_id()));

-- events
create policy "events: dono lê" on public.events
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "events: hub gerencia" on public.events
  for all to authenticated
  using (hub_id = (select public.current_hub_id()))
  with check (hub_id = (select public.current_hub_id()));

-- settings
create policy "settings: dono lê" on public.settings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "settings: dono edita" on public.settings
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "settings: hub gerencia" on public.settings
  for all to authenticated
  using (hub_id = (select public.current_hub_id()))
  with check (hub_id = (select public.current_hub_id()));

-- push_tokens: cada pessoa cuida dos seus.
create policy "push_tokens: dono gerencia" on public.push_tokens
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Colunas que só o hub pode mudar (a pessoa edita nome, cômodo e preferências).
-- ---------------------------------------------------------------------------
create or replace function public.guard_hub_managed_columns()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- quem chama é um hub ou o próprio banco (gatilhos/service role): libera tudo
  if public.current_hub_id() is not null or auth.uid() is null then
    return new;
  end if;
  if tg_table_name = 'cameras' then
    new.hub_id := old.hub_id;
    new.online := old.online;
    new.recording := old.recording;
    new.rec_started_at := old.rec_started_at;
    new.model := old.model;
    new.ip := old.ip;
    new.supports_talk := old.supports_talk;
  elsif tg_table_name = 'settings' then
    new.hub_id := old.hub_id;
    new.cloud_provider := old.cloud_provider;
    new.cloud_connected := old.cloud_connected;
    new.cloud_account := old.cloud_account;
    new.cloud_used_bytes := old.cloud_used_bytes;
    new.cloud_total_bytes := old.cloud_total_bytes;
    new.cloud_folder_ref := old.cloud_folder_ref;
  end if;
  return new;
end;
$$;
create trigger cameras_guard before update on public.cameras
  for each row execute function public.guard_hub_managed_columns();
create trigger settings_guard before update on public.settings
  for each row execute function public.guard_hub_managed_columns();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Mudanças de tabela (o app recebe status, gravações e progresso de envio).
alter publication supabase_realtime add table public.hubs, public.cameras, public.recordings, public.events, public.settings;

-- Canais privados de broadcast "hub:<id>" (comandos app → hub, eventos hub → app,
-- sinalização WebRTC). Só o dono e o próprio hub entram.
create or replace function public.can_access_hub_topic(p_topic text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_topic !~ '^hub:[0-9a-f-]{36}$' then
    return false;
  end if;
  v_id := substr(p_topic, 5)::uuid;
  return public.owns_hub(v_id) or public.current_hub_id() = v_id;
end;
$$;

create policy "realtime: ler canal do hub" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and (select public.can_access_hub_topic(realtime.topic())));
create policy "realtime: enviar no canal do hub" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence') and (select public.can_access_hub_topic(realtime.topic())));

-- ---------------------------------------------------------------------------
-- Storage: miniaturas temporárias em thumbnails/<hub_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbnails', 'thumbnails', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "thumbnails: hub escreve na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select public.current_hub_id())::text);
create policy "thumbnails: hub apaga da própria pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select public.current_hub_id())::text);
create policy "thumbnails: hub e dono leem" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'thumbnails'
    and (
      (storage.foldername(name))[1] = (select public.current_hub_id())::text
      or (select public.owns_hub(((storage.foldername(name))[1])::uuid))
    )
  );
