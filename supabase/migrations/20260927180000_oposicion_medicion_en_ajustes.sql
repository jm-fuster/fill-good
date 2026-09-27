-- ============================================================================
-- Oposición a la medición de uso desde Ajustes
-- ============================================================================
-- `20260922200832_eventos_de_uso.sql` dejó la oposición (art. 21 RGPD) solo
-- por email, con un SQL a mano. La revisión legal del 27-sep lo cambia: el
-- derecho hay que presentarlo de forma explícita (art. 21.4) y facilitarlo
-- (art. 12.2), y un interruptor lo hace de un toque. Estas dos funciones son
-- el único camino: `usage_opt_outs` sigue sin políticas.
--
-- Oponerse hace lo mismo que el SQL de aquella migración: una fila en
-- `usage_opt_outs` y borrar lo ya anotado. Volver a aceptar solo quita la fila;
-- lo borrado no vuelve.
-- ============================================================================

create function public.get_usage_opt_out()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usage_opt_outs where user_id = public.clerk_user_id()
  );
$$;

revoke execute on function public.get_usage_opt_out() from public, anon;
grant execute on function public.get_usage_opt_out() to authenticated;

create function public.set_usage_opt_out(p_opt_out boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_opt_out then
    insert into public.usage_opt_outs (user_id) values (v_uid)
    on conflict do nothing;
    delete from public.usage_events where user_id = v_uid;
    delete from public.usage_days where user_id = v_uid;
  else
    delete from public.usage_opt_outs where user_id = v_uid;
  end if;

  return p_opt_out;
end;
$$;

revoke execute on function public.set_usage_opt_out(boolean) from public, anon;
grant execute on function public.set_usage_opt_out(boolean) to authenticated;
