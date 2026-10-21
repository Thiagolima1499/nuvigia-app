-- Notificações de movimento: marca quais eventos já viraram push, para não
-- mandar várias notificações seguidas da mesma câmera.
alter table public.events add column notified boolean not null default false;
create index events_notified_idx on public.events (camera_id, at desc) where notified;

-- Registra o token de push do aparelho para a pessoa logada. Se o aparelho era de
-- outra conta (troca de login), o token passa para a conta atual.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_hub_id() is not null then
    raise exception 'only people can register push tokens' using errcode = '42501';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' or p_platform not in ('ios', 'android', 'web') then
    raise exception 'invalid push token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
