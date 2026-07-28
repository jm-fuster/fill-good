-- ============================================================================
-- Revocar el acceso al hogar: expulsar miembros + caducidad de la invitación
-- ============================================================================
-- La auditoría 2026-07 (severidad alta) señaló que el acceso a un hogar era
-- IRREVOCABLE: no se podía expulsar a nadie y el código de invitación no
-- caducaba, no era de un solo uso ni se rotaba al salir. Un ex-conviviente o
-- cualquiera con el enlace reenviado conservaba acceso CRUD indefinido.
--
-- Decisiones de producto (documentadas):
--  · El código de invitación CADUCA a los 7 días. El owner lo regenera cuando
--    quiera (renueva código y caducidad). NO se hace "un solo uso": el modelo es
--    un código por hogar para invitar a varios convivientes; un solo uso lo
--    rompería. La caducidad + la rotación cubren el riesgo.
--  · El PROPIETARIO puede expulsar a un miembro; al hacerlo se rota el código
--    para que el expulsado no pueda volver con el que tenía.
-- ============================================================================

-- ── 1. Caducidad del código de invitación ───────────────────────────────────
alter table public.households add column invite_code_expires_at timestamptz;
-- Backfill: los códigos existentes siguen válidos 7 días desde el despliegue.
update public.households
  set invite_code_expires_at = now() + interval '7 days'
  where invite_code_expires_at is null;
alter table public.households
  alter column invite_code_expires_at set default now() + interval '7 days';
alter table public.households
  alter column invite_code_expires_at set not null;

-- ── 2. regenerate_invite_code: renueva también la caducidad ─────────────────
create or replace function public.regenerate_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_a_member';
  end if;

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

  return v_code;
end;
$$;

-- ── 3. join_household_by_code: rechaza códigos caducados ────────────────────
-- Idéntica a 20260724140000 (rate-limit) salvo el filtro de caducidad: un código
-- caducado se trata como inválido (registra intento fallido y devuelve null, sin
-- revelar que existía).
create or replace function public.join_household_by_code(
  p_code text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_household_id uuid;
  v_recent int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.join_attempts
  where user_id = v_uid and attempted_at <= now() - interval '15 minutes';

  select count(*) into v_recent
  from public.join_attempts
  where user_id = v_uid;
  if v_recent >= 10 then
    raise exception 'rate_limited';
  end if;

  select id into v_household_id
  from public.households
  where invite_code = upper(trim(p_code))
    and invite_code_expires_at > now();

  if v_household_id is null then
    insert into public.join_attempts (user_id) values (v_uid);
    return null;
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, v_uid, 'member', nullif(trim(p_display_name), ''))
  on conflict (household_id, user_id) do nothing;

  return v_household_id;
end;
$$;

-- ── 4. remove_household_member: el owner expulsa a un miembro ───────────────
-- Solo el propietario; nunca a sí mismo (para eso está leave_household). Borra la
-- membresía del expulsado, sus suscripciones push y sus pines de ESTE hogar, y
-- rota el código de invitación para que no pueda reentrar con el que tenía.
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
