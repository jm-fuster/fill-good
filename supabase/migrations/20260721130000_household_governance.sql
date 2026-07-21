-- ============================================================================
-- Migración — Gobernanza del hogar: propiedad y borrado (D1)
-- ============================================================================
-- El enum member_role ('owner' | 'member') existía desde la migración init pero
-- ninguna política ni RPC lo usaba. Esta migración añade:
--   * is_household_owner(hid): helper de autorización por rol (definer).
--   * transfer_household_ownership: el owner cede la propiedad a otro miembro.
--   * delete_household: el owner elimina el hogar (cascade limpia el resto).
--   * leave_household: reglas de abandono en la BD (no solo en la UI).
-- Todas security definer, siguiendo el patrón de permisos de la migración init.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: ¿es el usuario actual el OWNER del hogar `hid`?
-- Análogo a is_household_member; definer para saltarse RLS de household_members.
-- ---------------------------------------------------------------------------
create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid
      and user_id = public.clerk_user_id()
      and role = 'owner'
  )
$$;

-- ---------------------------------------------------------------------------
-- RPC: transferir la propiedad del hogar a otro miembro. Solo el owner actual;
-- el destinatario debe ser ya miembro. En la misma transacción el destinatario
-- pasa a `owner` y el anterior a `member`.
-- ---------------------------------------------------------------------------
create or replace function public.transfer_household_ownership(
  p_household_id uuid,
  p_new_owner_user_id text
)
returns void
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

  if not public.is_household_owner(p_household_id) then
    raise exception 'not_owner';
  end if;

  if p_new_owner_user_id = v_uid then
    raise exception 'already_owner';
  end if;

  if not exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = p_new_owner_user_id
  ) then
    raise exception 'not_a_member';
  end if;

  update public.household_members
  set role = 'owner'
  where household_id = p_household_id
    and user_id = p_new_owner_user_id;

  update public.household_members
  set role = 'member'
  where household_id = p_household_id
    and user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: eliminar el hogar completo. Solo el owner. Los `on delete cascade` de
-- todas las tablas con household_id limpian inventario, listas, recetas, menús…
-- ---------------------------------------------------------------------------
create or replace function public.delete_household(p_household_id uuid)
returns void
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

  if not public.is_household_owner(p_household_id) then
    raise exception 'not_owner';
  end if;

  delete from public.households where id = p_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: abandonar el hogar con las reglas de propiedad garantizadas en la BD.
--   * un `member` sale sin más;
--   * el `owner` NO puede salir si quedan otros miembros (owner_must_transfer);
--   * el último miembro (sea quien sea) al salir elimina el hogar completo.
-- ---------------------------------------------------------------------------
create or replace function public.leave_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_role public.member_role;
  v_member_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select role into v_role
  from public.household_members
  where household_id = p_household_id
    and user_id = v_uid;

  if v_role is null then
    raise exception 'not_a_member';
  end if;

  select count(*) into v_member_count
  from public.household_members
  where household_id = p_household_id;

  -- Último miembro: abandonar = eliminar el hogar completo (cascade).
  if v_member_count = 1 then
    delete from public.households where id = p_household_id;
    return;
  end if;

  -- El owner no puede dejar el hogar sin propietario: debe transferir antes.
  if v_role = 'owner' then
    raise exception 'owner_must_transfer';
  end if;

  delete from public.household_members
  where household_id = p_household_id
    and user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: solo usuarios autenticados pueden ejecutar los RPCs.
-- ---------------------------------------------------------------------------
revoke execute on function public.is_household_owner(uuid) from public, anon;
revoke execute on function public.transfer_household_ownership(uuid, text) from public, anon;
revoke execute on function public.delete_household(uuid) from public, anon;
revoke execute on function public.leave_household(uuid) from public, anon;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.transfer_household_ownership(uuid, text) to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
