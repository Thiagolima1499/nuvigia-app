-- Testes de pareamento e RLS. Rodar com: supabase/tests/run-db-tests.sh
\set ON_ERROR_STOP on
\set QUIET on

-- Atores: Ana (pessoa), Beto (pessoa), Hub A (usuário de hub), Hub B.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@exemplo.com', '{}'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@exemplo.com', '{}'),
  ('00000000-0000-0000-0000-0000000000a1', 'hub-a@hubs.nuvigia.invalid', '{"role":"hub"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'hub-b@hubs.nuvigia.invalid', '{"role":"hub"}');
insert into public.hubs (id, hub_user_id, name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Casa da Ana'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'Casa do Beto');

create function pg_temp.act(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, false);
end $$;
create function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- perfis só para pessoas
select pg_temp.check((select count(*) from public.profiles) = 2, 'perfil criado só para pessoas');

-- ---------------------------------------------------------------- pareamento
set role authenticated;

select pg_temp.act('00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform public.create_pairing_code();
  raise exception 'pessoa não deveria gerar código';
exception when insufficient_privilege then raise notice 'ok - pessoa não gera código';
end $$;

select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
create temp table code_a as select * from public.create_pairing_code();
select pg_temp.check((select code ~ '^[0-9]{6}$' from code_a), 'hub gera código de 6 dígitos');
select pg_temp.check((select expires_at between now() + interval '9 minutes' and now() + interval '11 minutes' from code_a), 'código vale 10 minutos');
select pg_temp.check((select count(*) from public.pairing_codes) = 1, 'hub vê o próprio código');

select pg_temp.act('00000000-0000-0000-0000-0000000000b1');
create temp table code_b as select * from public.create_pairing_code();
select pg_temp.check((select count(*) from public.pairing_codes) = 1, 'hub B não vê o código do hub A');

-- hub não pode se parear sozinho
do $$ begin
  perform public.claim_pairing_code((select code from code_b));
  raise exception 'hub não deveria parear';
exception when insufficient_privilege then raise notice 'ok - hub não consome código';
end $$;

-- código errado
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.check(public.claim_pairing_code('000000') is null, 'código errado recusado');

-- Ana pareia o hub A; Beto pareia o hub B
select pg_temp.check(public.claim_pairing_code((select code from code_a)) = '10000000-0000-0000-0000-00000000000a', 'Ana pareia o hub A');
select pg_temp.check(public.claim_pairing_code((select code from code_a)) is null, 'código só vale uma vez');
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(public.claim_pairing_code((select code from code_b)) = '10000000-0000-0000-0000-00000000000b', 'Beto pareia o hub B');

-- --------------------------------------------------------------- dados do hub
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
insert into public.cameras (id, hub_id, name, room, model, ip, online)
  values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Portão', 'Entrada', 'Tapo C200', '192.168.0.22', true);
insert into public.recordings (camera_id, hub_id, started_at, duration_sec, status, upload_progress)
  values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', now(), 48, 'uploading', 10);
insert into public.events (camera_id, hub_id, type) values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'motion');
select public.hub_heartbeat('0.1.0');

do $$ begin
  insert into public.cameras (hub_id, name) values ('10000000-0000-0000-0000-00000000000b', 'Intrusa');
  raise exception 'hub A gravou no hub B';
exception when insufficient_privilege then raise notice 'ok - hub não escreve em outro hub';
end $$;

select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.cameras) = 1, 'Ana vê a câmera do seu hub');
select pg_temp.check((select owner_id from public.cameras limit 1) = '00000000-0000-0000-0000-00000000000a', 'owner_id copiado do hub');
select pg_temp.check((select count(*) from public.recordings) = 1, 'Ana vê a gravação');
select pg_temp.check((select count(*) from public.events) = 1, 'Ana vê o evento');
select pg_temp.check((select count(*) from public.settings) = 1, 'ajustes criados no pareamento');
select pg_temp.check((select online from public.hubs) = true, 'heartbeat marca hub online');

-- Ana pode renomear, mas não alterar colunas do hub
update public.cameras set name = 'Portão da frente', online = false, ip = '1.2.3.4';
select pg_temp.check((select name = 'Portão da frente' and online and ip = '192.168.0.22' from public.cameras), 'pessoa renomeia, mas não muda status/IP');
update public.settings set quality = '2K', cloud_connected = true;
select pg_temp.check((select quality = '2K' and not cloud_connected from public.settings), 'pessoa muda qualidade, mas não o status da nuvem');

select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.cameras) = 0, 'Beto não vê câmeras da Ana');
select pg_temp.check((select count(*) from public.recordings) = 0, 'Beto não vê gravações da Ana');
select pg_temp.check((select count(*) from public.events) = 0, 'Beto não vê eventos da Ana');
select pg_temp.check((select count(*) from public.hubs) = 1, 'Beto vê só o próprio hub');
update public.cameras set name = 'hack';
delete from public.recordings;
reset role;
select pg_temp.check((select name from public.cameras) = 'Portão da frente', 'Beto não edita câmera da Ana');
select pg_temp.check((select count(*) from public.recordings) = 1, 'Beto não apaga gravação da Ana');
set role authenticated;

-- ------------------------------------------------------------------ realtime
select set_config('realtime.topic', 'hub:10000000-0000-0000-0000-00000000000a', false);
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'broadcast', '{}');
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'broadcast', '{}');
select pg_temp.check((select count(*) from realtime.messages) = 2, 'dono e hub usam o canal do hub');
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from realtime.messages) = 0, 'Beto não lê o canal do hub da Ana');
do $$ begin
  insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'broadcast', '{}');
  raise exception 'Beto enviou no canal da Ana';
exception when insufficient_privilege then raise notice 'ok - Beto não envia no canal da Ana';
end $$;

-- ------------------------------------------------------------------- storage
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
insert into storage.objects (bucket_id, name) values ('thumbnails', '10000000-0000-0000-0000-00000000000a/evt.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('thumbnails', '10000000-0000-0000-0000-00000000000b/evt.jpg');
  raise exception 'hub A escreveu na pasta do hub B';
exception when insufficient_privilege then raise notice 'ok - hub só escreve na própria pasta';
end $$;
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from storage.objects) = 1, 'Ana lê miniatura do seu hub');
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from storage.objects) = 0, 'Beto não lê miniatura da Ana');

-- ------------------------------------------------------------- limite de tentativas
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
do $$
declare i int;
begin
  for i in 1..10 loop
    perform public.claim_pairing_code('999999');
  end loop;
  begin
    perform public.claim_pairing_code('999999');
    raise exception 'sem limite';
  exception when raise_exception then
    if sqlerrm not like 'too many attempts%' then raise exception 'esperava limite, veio: %', sqlerrm; end if;
    raise notice 'ok - limite de 10 tentativas em 10 minutos';
  end;
end $$;

-- ------------------------------------------------------------- tokens de push
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select public.register_push_token('ExponentPushToken[aparelho-1]', 'ios');
select pg_temp.check((select count(*) from public.push_tokens) = 1, 'Ana registra o token do aparelho');
do $$ begin
  perform public.register_push_token('qualquer-coisa', 'ios');
  raise exception 'aceitou token inválido';
exception when invalid_parameter_value then raise notice 'ok - token inválido recusado';
end $$;
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.push_tokens) = 0, 'Beto não vê o token da Ana');
-- o mesmo aparelho passa a ser do Beto quando ele entra nele
select public.register_push_token('ExponentPushToken[aparelho-1]', 'android');
select pg_temp.check((select count(*) from public.push_tokens) = 1, 'token passa para a conta que entrou no aparelho');
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.push_tokens) = 0, 'Ana deixa de receber no aparelho do Beto');
select pg_temp.act('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.register_push_token('ExponentPushToken[hub]', 'ios');
  raise exception 'hub registrou token';
exception when insufficient_privilege then raise notice 'ok - hub não registra token de push';
end $$;

-- ---------------------------------------------------------- desparear (apagar)
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
delete from public.hubs where id = '10000000-0000-0000-0000-00000000000a';
reset role;
select pg_temp.check((select count(*) from public.cameras) = 0, 'apagar o hub apaga câmeras e gravações');

\echo 'Todos os testes de banco passaram.'
