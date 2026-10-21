-- Nuvigia: esquema inicial.
-- Duas identidades usam o banco:
--   * pessoas (usuárias do app), autenticadas pelo Supabase Auth;
--   * hubs, que também são usuários do Auth (criados pela função hub-register,
--     com app_metadata.role = 'hub'). Assim o hub usa login, RLS e Realtime normais,
--     sem nunca guardar a service role key.
-- Credenciais RTSP e tokens de nuvem NUNCA entram aqui: ficam criptografados no hub.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.record_mode as enum ('motion', 'continuous');
create type public.quality as enum ('720p', '1080p', '2K');
create type public.cloud_provider as enum ('google', 'onedrive', 'icloud');
create type public.recording_kind as enum ('video', 'photo');
create type public.recording_status as enum ('recording', 'uploading', 'done', 'failed');
create type public.event_type as enum ('motion', 'person', 'reconnected');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.hubs (
  id uuid primary key default gen_random_uuid(),
  -- Pessoa dona do hub; nula até o pareamento.
  owner_id uuid references auth.users (id) on delete set null,
  -- Usuário do Auth que representa o próprio hub.
  hub_user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'Hub Nuvigia',
  version text,
  online boolean not null default false,
  last_seen_at timestamptz,
  -- URL pública opcional (Cloudflare Tunnel) para o modo de acesso remoto "tunnel".
  public_url text,
  created_at timestamptz not null default now()
);
create index hubs_owner_idx on public.hubs (owner_id);

create table public.pairing_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  hub_id uuid not null references public.hubs (id) on delete cascade,
  expires_at timestamptz not null,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index pairing_codes_hub_idx on public.pairing_codes (hub_id);

-- Tentativas de pareamento por pessoa (limite contra força bruta).
create table public.pairing_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index pairing_attempts_user_at_idx on public.pairing_attempts (user_id, at);

create table public.cameras (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.hubs (id) on delete cascade,
  -- Copiado do hub por gatilho; simplifica as políticas de RLS.
  owner_id uuid references auth.users (id) on delete set null,
  name text not null check (length(name) between 1 and 60),
  room text not null default '' check (length(room) <= 60),
  model text not null default '',
  ip text not null default '',
  online boolean not null default false,
  recording boolean not null default false,
  rec_started_at timestamptz,
  record_mode public.record_mode not null default 'motion',
  upload_to_cloud boolean not null default true,
  supports_talk boolean not null default false,
  created_at timestamptz not null default now()
);
create index cameras_hub_idx on public.cameras (hub_id);
create index cameras_owner_idx on public.cameras (owner_id);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cameras (id) on delete cascade,
  hub_id uuid not null references public.hubs (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  started_at timestamptz not null,
  duration_sec integer not null default 0 check (duration_sec >= 0),
  kind public.recording_kind not null default 'video',
  provider public.cloud_provider,
  cloud_file_ref text,
  upload_progress real not null default 0 check (upload_progress between 0 and 100),
  status public.recording_status not null default 'recording',
  error text,
  -- Caminho no bucket "thumbnails" (temporário).
  thumbnail_path text,
  created_at timestamptz not null default now()
);
create index recordings_owner_started_idx on public.recordings (owner_id, started_at desc);
create index recordings_camera_idx on public.recordings (camera_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cameras (id) on delete cascade,
  hub_id uuid not null references public.hubs (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  type public.event_type not null,
  recording_id uuid references public.recordings (id) on delete set null,
  thumbnail_path text
);
create index events_camera_at_idx on public.events (camera_id, at desc);
create index events_owner_at_idx on public.events (owner_id, at desc);

-- Ajustes por hub (o app tem um hub ativo por vez).
create table public.settings (
  hub_id uuid primary key references public.hubs (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  quality public.quality not null default '1080p',
  record_mode public.record_mode not null default 'motion',
  wifi_only boolean not null default true,
  notify_motion boolean not null default true,
  retention_days integer default 30 check (retention_days is null or retention_days > 0),
  -- Status da nuvem publicado pelo hub (os tokens ficam só no hub).
  cloud_provider public.cloud_provider,
  cloud_connected boolean not null default false,
  cloud_account text,
  cloud_used_bytes bigint not null default 0,
  cloud_total_bytes bigint,
  cloud_folder_ref text,
  updated_at timestamptz not null default now()
);

-- Tokens de push (Expo) dos aparelhos de cada pessoa.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Funções auxiliares (security definer, search_path fixo)
-- ---------------------------------------------------------------------------

-- Hub do usuário autenticado, quando quem chama é um hub.
create or replace function public.current_hub_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select h.id from public.hubs h where h.hub_user_id = auth.uid()
$$;

-- A pessoa autenticada é dona do hub?
create or replace function public.owns_hub(p_hub_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.hubs h where h.id = p_hub_id and h.owner_id = auth.uid())
$$;

-- Copia owner_id do hub para as tabelas filhas.
create or replace function public.set_owner_from_hub()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select h.owner_id into new.owner_id from public.hubs h where h.id = new.hub_id;
  return new;
end;
$$;

create trigger cameras_owner before insert or update of hub_id on public.cameras
  for each row execute function public.set_owner_from_hub();
create trigger recordings_owner before insert or update of hub_id on public.recordings
  for each row execute function public.set_owner_from_hub();
create trigger events_owner before insert or update of hub_id on public.events
  for each row execute function public.set_owner_from_hub();
create trigger settings_owner before insert or update of hub_id on public.settings
  for each row execute function public.set_owner_from_hub();

-- Quando o hub muda de dono (pareamento), propaga para as filhas.
create or replace function public.propagate_hub_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    update public.cameras set owner_id = new.owner_id where hub_id = new.id;
    update public.recordings set owner_id = new.owner_id where hub_id = new.id;
    update public.events set owner_id = new.owner_id where hub_id = new.id;
    update public.settings set owner_id = new.owner_id where hub_id = new.id;
  end if;
  return new;
end;
$$;
create trigger hubs_owner_propagate after update of owner_id on public.hubs
  for each row execute function public.propagate_hub_owner();

-- Cria perfil para pessoas (não para hubs).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'role', '') <> 'hub' then
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at em settings
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pareamento
-- ---------------------------------------------------------------------------

-- Chamado pelo hub: gera um código de 6 dígitos válido por 10 minutos.
create or replace function public.create_pairing_code()
returns table (code text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid := public.current_hub_id();
  v_code text;
  v_exp timestamptz := now() + interval '10 minutes';
begin
  if v_hub is null then
    raise exception 'only a hub can create pairing codes' using errcode = '42501';
  end if;
  -- invalida códigos anteriores deste hub
  delete from public.pairing_codes p where p.hub_id = v_hub and p.claimed_at is null;
  -- limpa códigos vencidos de todos os hubs
  delete from public.pairing_codes p where p.expires_at < now() - interval '1 day';
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.pairing_codes (code, hub_id, expires_at) values (v_code, v_hub, v_exp);
      exit;
    exception when unique_violation then
      -- colisão rara: tenta outro código
    end;
  end loop;
  return query select v_code, v_exp;
end;
$$;

-- Chamado pela pessoa no app: vincula o hub à conta. Máx. 10 tentativas a cada 10 min.
-- Código inválido ou vencido devolve NULL (sem erro), para que a tentativa fique registrada.
create or replace function public.claim_pairing_code(p_code text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_hub uuid;
  v_attempts int;
begin
  if v_user is null or public.current_hub_id() is not null then
    raise exception 'sign in as a person to pair a hub' using errcode = '42501';
  end if;
  select count(*) into v_attempts from public.pairing_attempts a
    where a.user_id = v_user and a.at > now() - interval '10 minutes';
  if v_attempts >= 10 then
    raise exception 'too many attempts, try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.pairing_attempts (user_id) values (v_user);

  update public.pairing_codes p
     set claimed_by = v_user, claimed_at = now()
   where p.code = p_code and p.claimed_at is null and p.expires_at > now()
   returning p.hub_id into v_hub;

  if v_hub is null then
    return null;
  end if;

  update public.hubs h set owner_id = v_user where h.id = v_hub;
  insert into public.settings (hub_id) values (v_hub) on conflict (hub_id) do nothing;
  delete from public.pairing_attempts a where a.user_id = v_user;
  return v_hub;
end;
$$;

-- Hub informa que está vivo.
create or replace function public.hub_heartbeat(p_version text default null)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.hubs set online = true, last_seen_at = now(), version = coalesce(p_version, version)
   where hub_user_id = auth.uid();
$$;

-- Marca como offline hubs sem batimento há mais de 2 minutos (rodar por pg_cron).
create or replace function public.mark_stale_hubs_offline()
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.hubs set online = false where online and last_seen_at < now() - interval '2 minutes';
$$;

revoke all on function public.create_pairing_code() from public, anon;
revoke all on function public.claim_pairing_code(text) from public, anon;
revoke all on function public.hub_heartbeat(text) from public, anon;
revoke all on function public.mark_stale_hubs_offline() from public, anon, authenticated;
grant execute on function public.create_pairing_code() to authenticated;
grant execute on function public.claim_pairing_code(text) to authenticated;
grant execute on function public.hub_heartbeat(text) to authenticated;
