-- ============================================================================
-- Migración — Cambiar tu nombre dentro del hogar
-- ============================================================================
-- `household_members.display_name` es el nombre con el que TE VEN tus
-- convivientes: aparece en "quién añadió esto" del inventario, en la lista de
-- miembros y en la transferencia de propiedad. Hasta ahora solo se escribía al
-- crear el hogar o al unirse (create_household / join_household_by_code), así
-- que quedaba congelado para siempre: un typo al registrarse era permanente.
--
-- No se resuelve con una política de UPDATE sobre household_members. La tabla
-- solo tiene select (mismo hogar) y delete (propia membresía) a propósito, y una
-- política `using (user_id = clerk_user_id())` dejaría al miembro escribir
-- CUALQUIER columna de su fila, incluida `role` — es decir, autoascenderse a
-- owner. Por eso un RPC definer que toca exclusivamente display_name.
--
-- El nombre es por hogar, no por cuenta: quien pertenece a dos hogares puede
-- ser "Jorge" en uno y "Papá" en el otro. Es la semántica que ya tenía la
-- columna, y esta migración no la cambia.
-- ============================================================================

create or replace function public.set_member_display_name(
  p_household_id uuid,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Mismos límites que create_household/join_household_by_code (máx. 80). Vacío
  -- no se acepta: sin nombre la UI cae al genérico "Miembro", y eso debe ser el
  -- estado de quien nunca lo puso, no algo a lo que se pueda volver por error.
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;

  -- Filtra por user_id además de household_id: el definer se salta RLS, así que
  -- la restricción "solo tu propia membresía" tiene que estar aquí explícita.
  update public.household_members
  set display_name = v_name
  where household_id = p_household_id
    and user_id = v_uid;

  if not found then
    raise exception 'not_a_member';
  end if;
end;
$$;

revoke execute on function public.set_member_display_name(uuid, text)
  from public, anon;
grant execute on function public.set_member_display_name(uuid, text)
  to authenticated;
