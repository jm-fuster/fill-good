-- ============================================================================
-- Rate-limiting de las llamadas de IA (protección de la cuota free-tier)
-- ============================================================================
-- La auditoría 2026-07 señaló que scanReceiptAction y generateMenuAction no
-- tenían ningún límite por usuario: una sola cuenta podía agotar en bucle la
-- cuota gratuita de Gemini (única para todo el despliegue) y dejar el escaneo y
-- los menús inservibles para TODOS los hogares (DoS funcional).
--
-- Mismo patrón nativo que join_attempts (20260724140000): contador en Postgres,
-- sin infraestructura externa. Ventana móvil de 1 hora por usuario y tipo.
-- ============================================================================

-- ── Tabla de uso ─────────────────────────────────────────────────────────────
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id text not null,
  kind text not null, -- 'receipt' | 'menu'
  created_at timestamptz not null default now()
);
create index ai_usage_user_kind_idx
  on public.ai_usage (user_id, kind, created_at);

-- RLS activada SIN políticas ni grants a authenticated: solo la función
-- SECURITY DEFINER de abajo (que corre como owner y salta RLS) la lee/escribe.
alter table public.ai_usage enable row level security;

-- ── RPC que registra un uso y aplica el límite ──────────────────────────────
-- Registra un uso de IA del usuario actual tras comprobar el límite de la
-- ventana. Lanza 'rate_limited' si se supera (rollback inocuo: no hay nada que
-- persistir) y 'not_authenticated' si no hay sesión. Límite por tipo:
--   * receipt: 20/hora   * menu: 15/hora   * otros: 10/hora
create or replace function public.record_ai_usage(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_recent int;
  v_limit int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_limit := case p_kind
    when 'receipt' then 20
    when 'menu' then 15
    else 10
  end;

  select count(*) into v_recent
  from public.ai_usage
  where user_id = v_uid
    and kind = p_kind
    and created_at > now() - interval '1 hour';

  if v_recent >= v_limit then
    raise exception 'rate_limited';
  end if;

  insert into public.ai_usage (user_id, kind) values (v_uid, p_kind);
end;
$$;

-- Solo usuarios autenticados; nunca public/anon (regla de la auditoría para toda
-- función SECURITY DEFINER).
revoke execute on function public.record_ai_usage(text) from public, anon;
grant execute on function public.record_ai_usage(text) to authenticated;

-- ── Purga diaria dentro de la retención existente ───────────────────────────
-- Se recrea cleanup_retention añadiendo la limpieza de ai_usage (>2 días). El
-- resto del cuerpo es idéntico a 20260724140000_join_rate_limit.
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

  delete from public.ai_usage
  where created_at < now() - interval '2 days';
$$;
