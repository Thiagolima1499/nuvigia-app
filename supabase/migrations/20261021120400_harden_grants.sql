-- Fecha funções auxiliares para quem não está logado (aviso do Security Advisor do Supabase).
-- As funções usadas nas políticas continuam liberadas para "authenticated".
-- Funções de gatilho não precisam de EXECUTE para disparar, então ninguém as chama pela API.
revoke execute on function public.current_hub_id() from public, anon;
revoke execute on function public.owns_hub(uuid) from public, anon;
revoke execute on function public.can_access_hub_topic(text) from public, anon;
grant execute on function public.current_hub_id() to authenticated;
grant execute on function public.owns_hub(uuid) to authenticated;
grant execute on function public.can_access_hub_topic(text) to authenticated;
revoke execute on function public.set_owner_from_hub() from public, anon, authenticated;
revoke execute on function public.propagate_hub_owner() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_hub_managed_columns() from public, anon, authenticated;
