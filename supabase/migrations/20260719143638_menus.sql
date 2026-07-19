-- ============================================================================
-- Migración 0005 — Recetas y menús semanales
-- ============================================================================

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  servings int not null default 2,
  prep_minutes int,
  meal_types text[],
  instructions text,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_by text,
  created_at timestamptz not null default now()
);
create index recipes_household_idx on public.recipes (household_id, created_at desc);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  quantity numeric(10, 2),
  unit public.unit_type,
  optional boolean not null default false
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

create table public.weekly_menus (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null,
  status text not null default 'active' check (status in ('draft', 'active')),
  generated_by text not null default 'manual' check (generated_by in ('manual', 'ai')),
  created_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table public.menu_entries (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.weekly_menus (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid references public.recipes (id) on delete set null,
  free_text text,
  servings int not null default 2,
  unique (menu_id, date, meal_slot)
);
create index menu_entries_menu_idx on public.menu_entries (menu_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.weekly_menus enable row level security;
alter table public.menu_entries enable row level security;

create policy "recipes_all_member" on public.recipes
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "recipe_ingredients_all_member" on public.recipe_ingredients
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "weekly_menus_all_member" on public.weekly_menus
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "menu_entries_all_member" on public.menu_entries
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.weekly_menus to authenticated;
grant select, insert, update, delete on public.menu_entries to authenticated;
