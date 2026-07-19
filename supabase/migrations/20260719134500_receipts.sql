-- ============================================================================
-- Migración 0004 — Escaneo de tickets
-- ============================================================================
-- product_aliases: aprende que "GAZPACHO HACEND." = producto "Gazpacho" para
--   que la 2ª compra ya matchee sola.
-- receipts + receipt_items: un ticket y sus líneas. receipt_items confirmados
--   SON el historial de precios (de aquí salen las tendencias, Fase 5).
-- ============================================================================

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  alias text not null,
  alias_normalized text not null,
  source text not null default 'receipt',
  created_at timestamptz not null default now(),
  unique (household_id, alias_normalized)
);
create index product_aliases_product_idx on public.product_aliases (product_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  uploaded_by text,
  store_name text,
  store_chain text,
  purchased_at date,
  total_amount numeric(10, 2),
  currency char(3) not null default 'EUR',
  image_path text,
  status text not null default 'processing'
    check (status in ('processing', 'needs_review', 'confirmed', 'failed')),
  raw_extraction jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index receipts_household_idx on public.receipts (household_id, created_at desc);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  raw_text text,
  description text not null,
  quantity numeric(10, 3) not null default 1,
  unit public.unit_type not null default 'ud',
  is_weighted boolean not null default false,
  total_price numeric(10, 2),
  unit_price numeric(10, 4),
  price_per_kg numeric(10, 2),
  product_id uuid references public.products (id) on delete set null,
  match_status text not null default 'new_product'
    check (match_status in ('auto', 'manual', 'new_product', 'skipped')),
  added_to_inventory boolean not null default false,
  -- Denormalizados al confirmar (aceleran las tendencias de precios sin join).
  purchased_at date,
  store_chain text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
-- Índice clave para las gráficas de precios de la Fase 5.
create index receipt_items_product_date_idx
  on public.receipt_items (product_id, purchased_at);
create index receipt_items_receipt_idx on public.receipt_items (receipt_id, position);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.product_aliases enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

create policy "aliases_all_member" on public.product_aliases
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "receipts_all_member" on public.receipts
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "receipt_items_all_member" on public.receipt_items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.product_aliases to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.receipt_items to authenticated;
