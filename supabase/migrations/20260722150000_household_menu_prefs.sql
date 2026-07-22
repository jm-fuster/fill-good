-- ============================================================================
-- Migración — N3: perfil de menús del hogar
-- ============================================================================
-- Configuración cualitativa (nunca nutricional) que sesga la generación de
-- menús: objetivo del hogar, estilo de dieta, ingredientes a evitar, nº de
-- raciones y si se planifica desayuno. Una fila por hogar (PK = household_id).
--
-- Sin fila = hogar sin configurar: las lecturas devuelven defaults y la
-- generación se comporta como antes. La existencia de la fila marca además que
-- el onboarding ya se resolvió (aunque fuese con "Ahora no").
--
-- Decisión de producto: CERO números nutricionales (macros/calorías). El
-- objetivo es del HOGAR, no por miembro. "Evitar ingredientes" es preferencia,
-- nunca gestión de alergias. RLS por hogar con el patrón is_household_member.

create table public.household_menu_prefs (
  household_id uuid primary key references public.households (id) on delete cascade,
  goal text not null default 'balanced'
    check (goal in ('balanced', 'light', 'muscle', 'gain')),
  diet_style text not null default 'omnivore'
    check (diet_style in ('omnivore', 'vegetarian', 'vegan', 'gluten_free')),
  avoid_text text,
  servings int not null default 2 check (servings between 1 and 12),
  plan_breakfast boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.household_menu_prefs enable row level security;

create policy "household_menu_prefs_all_member" on public.household_menu_prefs
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.household_menu_prefs to authenticated;
