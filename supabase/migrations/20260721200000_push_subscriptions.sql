-- ============================================================================
-- Migración — Suscripciones Web Push (M10c)
-- ============================================================================
-- Guarda las suscripciones de notificaciones push del navegador, una por
-- dispositivo/usuario (endpoint único), con las preferencias por tipo de aviso:
--   · pref_expiry  — caducidades (agregado diario, futuro cron).
--   · pref_price   — avisos de precio al confirmar un ticket (M3).
--   · pref_restock — reposición (M5).
-- RLS: un usuario gestiona SOLO sus propias suscripciones; los miembros del
-- hogar pueden LEERLAS para poder enviarse avisos entre sí (el envío corre con
-- el contexto de quien dispara la acción).
-- ============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  pref_expiry boolean not null default true,
  pref_price boolean not null default true,
  pref_restock boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_household_idx
  on public.push_subscriptions (household_id);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_select_member" on public.push_subscriptions
  for select to authenticated using (public.is_household_member(household_id));
create policy "push_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and user_id = public.clerk_user_id()
  );
create policy "push_update_own" on public.push_subscriptions
  for update to authenticated
  using (user_id = public.clerk_user_id())
  with check (user_id = public.clerk_user_id());
create policy "push_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = public.clerk_user_id());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create trigger push_subscriptions_touch_updated_at
  before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();
