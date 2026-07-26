-- ============================================================================
-- Migración — Renombrar hogar (solo propietario)
-- ============================================================================
-- El hardening de 2026-07-24 dejó a `authenticated` solo con UPDATE de
-- monthly_budget en households, así que el nombre no puede cambiarse con un
-- UPDATE directo. Este RPC security definer aplica la regla en la BD (no solo
-- en la UI): únicamente el owner renombra, con el nombre saneado (1–80 chars).
-- ============================================================================

create or replace function public.rename_household(
  p_household_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if public.clerk_user_id() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_household_owner(p_household_id) then
    raise exception 'not_owner';
  end if;

  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;

  update public.households
  set name = v_name
  where id = p_household_id;
end;
$$;

revoke execute on function public.rename_household(uuid, text) from public, anon;
grant execute on function public.rename_household(uuid, text) to authenticated;
