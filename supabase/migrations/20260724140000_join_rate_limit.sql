-- ============================================================================
-- Rate-limiting de join_household_by_code (anti fuerza-bruta de códigos)
-- ============================================================================
-- La auditoría 2026-07 señaló que join_household_by_code era un oráculo de
-- códigos válidos sin límite de intentos. Se añade un rate-limit NATIVO en
-- Postgres (sin infra externa): máx 10 intentos FALLIDOS por usuario cada 15 min.
--
-- Nota transaccional: un `raise exception` revierte TODA la llamada del RPC
-- (incluido el INSERT del intento). Por eso el código inválido ya NO lanza
-- excepción: registra el intento fallido y DEVUELVE NULL (la transacción
-- commitea y el intento persiste, contando para el límite). El cliente
-- interpreta null = código inválido. Solo se lanza excepción en
-- 'not_authenticated' y 'rate_limited' (no hay nada que persistir → rollback
-- inocuo).
-- ============================================================================

-- ── Tabla de intentos ───────────────────────────────────────────────────────
create table public.join_attempts (
  id bigint generated always as identity primary key,
  user_id text not null,
  attempted_at timestamptz not null default now()
);
create index join_attempts_user_idx
  on public.join_attempts (user_id, attempted_at);

-- RLS activada SIN políticas ni grants a authenticated: solo las funciones
-- SECURITY DEFINER (que corren como owner y saltan RLS) la leen/escriben. Los
-- clientes no tienen privilegio sobre ella.
alter table public.join_attempts enable row level security;

-- ── RPC con rate-limit ──────────────────────────────────────────────────────
-- create or replace conserva los grants existentes (revoke public/anon + grant
-- authenticated de la migración init).
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

  -- Limpia los intentos caducados de este usuario (ventana de 15 min).
  delete from public.join_attempts
  where user_id = v_uid and attempted_at <= now() - interval '15 minutes';

  -- Rate limit: demasiados intentos fallidos recientes → rechazar.
  select count(*) into v_recent
  from public.join_attempts
  where user_id = v_uid;
  if v_recent >= 10 then
    raise exception 'rate_limited';
  end if;

  select id into v_household_id
  from public.households
  where invite_code = upper(trim(p_code));

  if v_household_id is null then
    -- Código inválido: registra el intento fallido y devuelve NULL (sin raise,
    -- para que el INSERT persista y cuente en el rate-limit).
    insert into public.join_attempts (user_id) values (v_uid);
    return null;
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, v_uid, 'member', nullif(trim(p_display_name), ''))
  on conflict (household_id, user_id) do nothing;

  return v_household_id;
end;
$$;

-- ── Purga diaria de intentos dentro de la retención existente ───────────────
-- Se recrea cleanup_retention añadiendo la limpieza de join_attempts (>1 día).
-- El resto del cuerpo es idéntico a 20260723160000_data_retention.
create or replace function public.cleanup_retention()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.inventory_events
  where kind in ('consumed', 'restocked')
    and created_at < now() - interval '90 days';

  delete from public.inventory_events
  where kind = 'discarded'
    and created_at < now() - interval '24 months';

  delete from public.receipts
  where status in ('needs_review', 'processing', 'failed')
    and created_at < now() - interval '30 days';

  delete from public.weekly_menus
  where week_start < (current_date - interval '26 weeks');

  delete from public.join_attempts
  where attempted_at < now() - interval '1 day';
$$;
