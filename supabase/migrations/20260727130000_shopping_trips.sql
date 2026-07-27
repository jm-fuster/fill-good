-- ============================================================================
-- Migración — Snapshot de compra cerrada (G2, "compra perfecta"): captura de datos
-- ============================================================================
-- Fill Good tiene algo que casi ninguna app de la compra tiene: la LISTA y el
-- TICKET de la misma compra. Cruzarlos dice cuántos productos entraron fuera de
-- lista, que es justo el comportamiento que promete "compra lo justo".
--
-- El problema: `checkoutAction` BORRA los items marcados al finalizar la compra
-- (src/features/shopping-list/actions.ts), así que hoy no queda ningún rastro de
-- qué había en la lista y el cruce es imposible a posteriori. Los
-- `inventory_events` de tipo 'restocked' registran lo que entró en casa, pero no
-- distinguen "estaba en la lista" de "capricho".
--
-- Esta tabla guarda UNA fila por compra cerrada, justo antes de ese borrado.
--
-- Se aplica ANTES que la UI que la consume, y a propósito: el dato es sensible al
-- tiempo. Cada checkout que ocurra sin esta captura es una comparación que ya no
-- se podrá hacer nunca. La UI puede llegar después; el histórico, no.
--
-- `product_ids` guarda los productos YA RESUELTOS (los de texto libre se crean o
-- se emparejan durante el checkout), que es la forma comparable con
-- `receipt_items.product_id`. `receipt_id` se rellena al confirmar un ticket
-- cercano en el tiempo; null = compra sin ticket escaneado, que es un caso
-- normal y no un error.
-- ============================================================================

create table public.shopping_trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  closed_at timestamptz not null default now(),
  closed_by text,
  product_ids uuid[] not null default '{}',
  item_count int not null default 0 check (item_count >= 0),
  -- on delete set null: descartar un ticket no debe borrar la compra que existió.
  receipt_id uuid references public.receipts (id) on delete set null
);

create index shopping_trips_household_closed_idx
  on public.shopping_trips (household_id, closed_at desc);

alter table public.shopping_trips enable row level security;

create policy "shopping_trips_all_member" on public.shopping_trips
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.shopping_trips to authenticated;

comment on table public.shopping_trips is
  'Snapshot de una compra cerrada desde la lista (G2). Se escribe en checkoutAction justo antes de borrar los items marcados, que es el único momento en que esa información existe.';
comment on column public.shopping_trips.product_ids is
  'Productos ya resueltos que se llevaron, comparables con receipt_items.product_id.';
comment on column public.shopping_trips.receipt_id is
  'Ticket confirmado que se corresponde con esta compra; null = compra sin ticket (caso normal).';
