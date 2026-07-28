-- ============================================================================
-- Al abandonar un hogar, borrar las suscripciones push de ese hogar
-- ============================================================================
-- La auditoría 2026-07 detectó que leave_household() solo borraba la fila de
-- household_members, dejando intactas las push_subscriptions (household_id,
-- user_id) del que se va. Como los envíos (notifyPriceRises y los crons) no
-- re-verifican la membresía, un EX-MIEMBRO seguía recibiendo notificaciones con
-- datos del hogar (caducidades, subidas de precio): comunicación a un tercero
-- ya sin legitimación (arts. 5.1.f y 32 RGPD).
--
-- Se recrea leave_household() idéntica salvo por el borrado de las suscripciones
-- push del usuario en ese hogar antes de retirar la membresía. El único caso que
-- no lo necesita es el del último miembro (se elimina el hogar entero y el
-- cascade de households ya arrastra sus push_subscriptions).
-- ============================================================================

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

  -- Último miembro: abandonar = eliminar el hogar completo (cascade, que ya
  -- arrastra push_subscriptions).
  if v_member_count = 1 then
    delete from public.households where id = p_household_id;
    return;
  end if;

  -- El owner no puede dejar el hogar sin propietario: debe transferir antes.
  if v_role = 'owner' then
    raise exception 'owner_must_transfer';
  end if;

  -- Revoca las notificaciones push del que se va PARA ESTE hogar: sin esto,
  -- seguiría recibiendo avisos del hogar tras perder el acceso a los datos.
  delete from public.push_subscriptions
  where household_id = p_household_id
    and user_id = v_uid;

  delete from public.household_members
  where household_id = p_household_id
    and user_id = v_uid;
end;
$$;

-- create or replace conserva los grants existentes (revoke public/anon + grant
-- authenticated de 20260721130000_household_governance), pero los repetimos por
-- claridad e idempotencia.
revoke execute on function public.leave_household(uuid) from public, anon;
grant execute on function public.leave_household(uuid) to authenticated;
