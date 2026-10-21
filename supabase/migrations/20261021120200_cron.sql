-- Marca hubs sem batimento como offline a cada minuto (requer a extensão pg_cron,
-- disponível em todos os projetos Supabase; em ambientes sem ela, a migração só avisa).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('nuvigia-stale-hubs', '* * * * *', 'select public.mark_stale_hubs_offline()');
  -- Pareamentos e tentativas antigos
  perform cron.schedule('nuvigia-pairing-cleanup', '17 3 * * *',
    $q$delete from public.pairing_codes where expires_at < now() - interval '1 day';
       delete from public.pairing_attempts where at < now() - interval '1 day';$q$);
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end;
$$;
