-- ============================================================================
-- Migración — Eventos de inventario: consumo vs. desperdicio (M8)
-- ============================================================================
-- Registra las BAJAS de stock distinguiendo si algo se consumió o se tiró, para
-- traducir el desperdicio a euros en el panel de gasto (M1). Solo se registran
-- bajas (no cada edición de cantidad). La valorización (× último precio) se hace
-- en lectura; aquí solo se guarda cantidad + unidad + tipo.
-- ============================================================================

create type public.inventory_event_kind as enum ('consumed', 'discarded');

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity numeric(10, 2) not null check (quantity >= 0),
  unit public.unit_type not null default 'ud',
  kind public.inventory_event_kind not null,
  created_by text,
  created_at timestamptz not null default now()
);
create index inventory_events_household_created_idx
  on public.inventory_events (household_id, created_at);
create index inventory_events_product_idx
  on public.inventory_events (product_id);

alter table public.inventory_events enable row level security;

create policy "inv_events_select_member" on public.inventory_events
  for select to authenticated using (public.is_household_member(household_id));
create policy "inv_events_insert_member" on public.inventory_events
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "inv_events_delete_member" on public.inventory_events
  for delete to authenticated using (public.is_household_member(household_id));

grant select, insert, delete on public.inventory_events to authenticated;
