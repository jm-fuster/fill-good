-- ============================================================================
-- Migración — "Mis habituales": pines de producto por usuario (E5)
-- ============================================================================
-- Primera tabla PER-USER del proyecto (todo lo demás es por hogar). Cada miembro
-- del hogar puede anclar los productos que USA, porque no todos consumen lo
-- mismo. El pin explícito es la única señal fiable de "esto es mío"
-- (products.purchase_count es por hogar; inventory_items.updated_by solo dice
-- quién tocó el stepper).
--
-- RLS estricta per-user: cada usuario solo ve/escribe sus pines, y solo dentro
-- de un hogar del que es miembro (is_household_member + clerk_user_id, ambos ya
-- existentes desde la migración init).
-- ============================================================================

create table public.user_pinned_products (
  user_id text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index user_pinned_products_user_household_idx
  on public.user_pinned_products (user_id, household_id);

-- ---------------------------------------------------------------------------
-- RLS: el pin es del usuario actual y del hogar al que pertenece.
-- ---------------------------------------------------------------------------
alter table public.user_pinned_products enable row level security;

create policy "user_pinned_products_all_own" on public.user_pinned_products
  for all to authenticated
  using (
    user_id = public.clerk_user_id()
    and public.is_household_member(household_id)
  )
  with check (
    user_id = public.clerk_user_id()
    and public.is_household_member(household_id)
  );

grant select, insert, update, delete on public.user_pinned_products to authenticated;
