-- ============================================================================
-- Al perder el acceso al hogar, el vínculo de Alexa se va con él
-- ============================================================================
-- La auditoría 2026-07-31 (severidad alta) encontró la misma brecha que ya se
-- corrigió para push (20260728140000), pero con más alcance: alexa_links solo
-- se borra en delete_account, así que quien vinculó su Echo y luego dejaba el
-- hogar (o era expulsado) conservaba acceso TOTAL por voz — leer la lista y el
-- menú, y modificar el inventario — indefinidamente. El webhook opera con
-- service-role y solo comprobaba el vínculo, nunca la membresía (arts. 5.1.f
-- y 32 RGPD, igual que entonces).
--
-- Se recrean leave_household y remove_household_member añadiendo el borrado de
-- los vínculos (alexa_links) y de los códigos de vinculación vivos
-- (alexa_link_codes) del usuario que pierde el acceso. El caso del último
-- miembro no lo necesita: borrar el hogar arrastra ambas tablas por cascade.
-- Cinturón y tirantes: el webhook re-verifica además la membresía en cada
-- petición (requireLink en src/features/alexa/handlers.ts) y al canjear un
-- código, para que los vínculos ya existentes de ex-miembros mueran también
-- sin esperar a esta limpieza.
-- ============================================================================

-- ── 1. leave_household: idéntica a 20260728140000 + borrado de Alexa ────────
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
  -- arrastra push_subscriptions, alexa_links y alexa_link_codes).
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

  -- Y su acceso por voz: el Echo que vinculó dejaría de ser suyo pero seguiría
  -- leyendo y escribiendo en el hogar. Los códigos vivos (10 min) también, para
  -- que no pueda re-vincularse tras salir.
  delete from public.alexa_links
  where household_id = p_household_id
    and user_id = v_uid;
  delete from public.alexa_link_codes
  where household_id = p_household_id
    and user_id = v_uid;

  delete from public.household_members
  where household_id = p_household_id
    and user_id = v_uid;
end;
$$;

revoke execute on function public.leave_household(uuid) from public, anon;
grant execute on function public.leave_household(uuid) to authenticated;

-- ── 2. remove_household_member: idéntica a 20260728170000 + Alexa ───────────
create or replace function public.remove_household_member(
  p_household_id uuid,
  p_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_household_owner(p_household_id) then
    raise exception 'not_owner';
  end if;
  if p_user_id = v_uid then
    raise exception 'cannot_remove_self';
  end if;
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = p_user_id
  ) then
    raise exception 'not_a_member';
  end if;

  delete from public.push_subscriptions
  where household_id = p_household_id and user_id = p_user_id;
  delete from public.user_pinned_products
  where household_id = p_household_id and user_id = p_user_id;
  -- El expulsado no conserva su Echo vinculado ni códigos con los que volver.
  delete from public.alexa_links
  where household_id = p_household_id and user_id = p_user_id;
  delete from public.alexa_link_codes
  where household_id = p_household_id and user_id = p_user_id;
  delete from public.household_members
  where household_id = p_household_id and user_id = p_user_id;

  -- Rotar el código: el expulsado no debe poder volver con el que ya conocía.
  loop
    v_code := public.generate_invite_code();
    exit when not exists (
      select 1 from public.households where invite_code = v_code
    );
  end loop;
  update public.households
  set invite_code = v_code,
      invite_code_expires_at = now() + interval '7 days'
  where id = p_household_id;
end;
$$;

revoke execute on function public.remove_household_member(uuid, text) from public, anon;
grant execute on function public.remove_household_member(uuid, text) to authenticated;
