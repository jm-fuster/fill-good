-- ============================================================================
-- Migración 0010 — C2: Reglas del menú
-- ============================================================================
-- Reglas internas del hogar que condicionan la generación de menús (C3):
--   · recipe_min_week → una receta guardada debe aparecer al menos N veces/semana.
--   · recipe_max_week → una receta guardada como mucho N veces/semana.
--   · free_text       → restricción en lenguaje natural que se inyecta al prompt
--                       ("los viernes cena de picoteo", "sin pescado los lunes").
--
-- Las reglas de frecuencia (recipe_%) se validan de forma determinista tras la
-- generación (validateAndPatchRules, C2/C3); las free_text solo van al prompt.
-- RLS por hogar con el mismo patrón is_household_member del resto de tablas.
-- ============================================================================

create table public.menu_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('recipe_min_week', 'recipe_max_week', 'free_text')),
  -- Solo para reglas de frecuencia; cascade para no dejar reglas huérfanas si se
  -- borra la receta.
  recipe_id uuid references public.recipes (id) on delete cascade,
  value int check (value between 1 and 7),
  text_rule text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Coherencia entre kind y sus campos: las de frecuencia necesitan receta y
  -- valor (y no llevan texto); las libres necesitan texto (y no receta ni valor).
  constraint menu_rules_shape check (
    (
      kind in ('recipe_min_week', 'recipe_max_week')
      and recipe_id is not null
      and value is not null
      and text_rule is null
    )
    or (
      kind = 'free_text'
      and text_rule is not null
      and recipe_id is null
      and value is null
    )
  )
);

create index menu_rules_household_idx on public.menu_rules (household_id);
create index menu_rules_recipe_idx
  on public.menu_rules (recipe_id)
  where recipe_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.menu_rules enable row level security;

create policy "menu_rules_all_member" on public.menu_rules
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.menu_rules to authenticated;
