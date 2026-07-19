-- ============================================================================
-- Migración 0002 — Catálogo de productos e inventario
-- ============================================================================
-- categories: por hogar, con set por defecto sembrado al crear el hogar.
-- products: catálogo (1 fila = un concepto de producto del hogar).
-- inventory_items: existencias. Decisión MVP: una fila por (producto,
--   ubicación) con cantidad agregada y una caducidad opcional (en vez de una
--   fila por lote). Más simple y natural para el stepper +/-; si más adelante
--   hace falta seguimiento por lotes con caducidades distintas, se amplía.
-- normalized_name lo calcula la app (lib/normalize.ts) y se guarda como texto
--   plano: evita el problema de inmutabilidad de unaccent() en columnas
--   generadas/índices y mantiene la unicidad insensible a mayúsculas/acentos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index categories_household_idx on public.categories (household_id, sort_order);

alter table public.categories enable row level security;

create policy "categories_select_member" on public.categories
  for select to authenticated using (public.is_household_member(household_id));
create policy "categories_insert_member" on public.categories
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "categories_update_member" on public.categories
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "categories_delete_member" on public.categories
  for delete to authenticated using (public.is_household_member(household_id));

grant select, insert, update, delete on public.categories to authenticated;

-- ---------------------------------------------------------------------------
-- products (catálogo)
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  normalized_name text not null,
  category_id uuid references public.categories (id) on delete set null,
  default_unit public.unit_type not null default 'ud',
  default_location public.location_type not null default 'pantry',
  min_quantity numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, normalized_name)
);
create index products_household_idx on public.products (household_id);
create index products_category_idx on public.products (category_id);

alter table public.products enable row level security;

create policy "products_select_member" on public.products
  for select to authenticated using (public.is_household_member(household_id));
create policy "products_insert_member" on public.products
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "products_update_member" on public.products
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "products_delete_member" on public.products
  for delete to authenticated using (public.is_household_member(household_id));

grant select, insert, update, delete on public.products to authenticated;

-- ---------------------------------------------------------------------------
-- inventory_items (existencias: una fila por producto + ubicación)
-- ---------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  location public.location_type not null default 'pantry',
  quantity numeric(10, 2) not null default 0 check (quantity >= 0),
  unit public.unit_type not null default 'ud',
  expiry_date date,
  notes text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, product_id, location)
);
create index inventory_household_product_idx on public.inventory_items (household_id, product_id);
create index inventory_expiry_idx on public.inventory_items (household_id, expiry_date);

alter table public.inventory_items enable row level security;

create policy "inventory_select_member" on public.inventory_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "inventory_insert_member" on public.inventory_items
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "inventory_update_member" on public.inventory_items
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "inventory_delete_member" on public.inventory_items
  for delete to authenticated using (public.is_household_member(household_id));

grant select, insert, update, delete on public.inventory_items to authenticated;

-- ---------------------------------------------------------------------------
-- Mantener updated_at al día en products e inventory_items
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

create trigger inventory_touch_updated_at
  before update on public.inventory_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Categorías por defecto: sembrado al crear hogar + backfill de los existentes
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_categories(hid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categories (household_id, name, icon, sort_order)
  select hid, c.name, c.icon, c.ord
  from (values
    ('Frutas y verduras', '🥦', 1),
    ('Carne', '🥩', 2),
    ('Pescado', '🐟', 3),
    ('Lácteos y huevos', '🥛', 4),
    ('Panadería', '🍞', 5),
    ('Despensa', '🥫', 6),
    ('Congelados', '🧊', 7),
    ('Bebidas', '🥤', 8),
    ('Snacks y dulces', '🍫', 9),
    ('Limpieza', '🧽', 10),
    ('Higiene', '🧴', 11),
    ('Mascotas', '🐾', 12),
    ('Otros', '📦', 13)
  ) as c(name, icon, ord)
  where not exists (
    select 1 from public.categories
    where household_id = hid and name = c.name
  );
$$;

-- Backfill: sembrar categorías en los hogares que aún no tienen ninguna.
do $$
declare
  h record;
begin
  for h in select id from public.households loop
    if not exists (select 1 from public.categories where household_id = h.id) then
      perform public.seed_default_categories(h.id);
    end if;
  end loop;
end;
$$;

-- Ampliar create_household para sembrar categorías en los hogares nuevos.
create or replace function public.create_household(
  p_name text,
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
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  loop
    v_code := public.generate_invite_code();
    exit when not exists (
      select 1 from public.households where invite_code = v_code
    );
  end loop;

  insert into public.households (name, invite_code, created_by)
  values (trim(p_name), v_code, v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, v_uid, 'owner', nullif(trim(p_display_name), ''));

  perform public.seed_default_categories(v_household_id);

  return v_household_id;
end;
$$;
