-- ============================================================================
-- Migración 0009 — Gustos y apetencia (B2)
-- ============================================================================
-- Dos señales complementarias para el generador de menús (C3) y para /recetas:
--   1. GUSTO explícito por miembro → recipe_ratings (1–5, único por usuario).
--   2. APETENCIA implícita (uso real) → menu_entries.cooked_at ("Lo cocinamos").
--
-- Sin contadores denormalizados: «veces planificada», «veces cocinada» y
-- «última vez» se derivan por query (getRecipeSignals). RLS por hogar con el
-- mismo patrón is_household_member del resto de tablas.
-- ============================================================================

create table public.recipe_ratings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id text not null,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un miembro solo puede tener una valoración por receta (la UI hace upsert).
  unique (recipe_id, user_id)
);
create index recipe_ratings_recipe_idx on public.recipe_ratings (recipe_id);
create index recipe_ratings_household_idx on public.recipe_ratings (household_id);

-- Apetencia implícita: fecha real en que se cocinó una entrada del menú.
-- Se rellena con la propia fecha de la entrada al marcar "Lo cocinamos".
alter table public.menu_entries add column cooked_at date;
-- Índice para derivar señales por receta (veces cocinada / última vez).
create index menu_entries_cooked_idx
  on public.menu_entries (recipe_id, cooked_at)
  where recipe_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.recipe_ratings enable row level security;

create policy "recipe_ratings_all_member" on public.recipe_ratings
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.recipe_ratings to authenticated;
