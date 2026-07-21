-- ============================================================================
-- Migración 0012 — Separar "Frutas y verduras" en "Fruta" y "Verdura"
-- ============================================================================
-- La fruta y la verdura se compran y caducan de forma distinta, así que son
-- categorías separadas. Cambios:
--   1. Redefinir seed_default_categories con las dos categorías (hogares nuevos).
--   2. Backfill de hogares existentes: renombrar la categoría combinada a
--      "Verdura" (conserva los productos ya asociados) y crear "Fruta".
-- No hay cambios de esquema: las categorías son datos, no columnas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Semilla para hogares nuevos (Fruta y Verdura separadas, sort_order 1..14)
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
    ('Fruta', '🍎', 1),
    ('Verdura', '🥦', 2),
    ('Carne', '🥩', 3),
    ('Pescado', '🐟', 4),
    ('Lácteos y huevos', '🥛', 5),
    ('Panadería', '🍞', 6),
    ('Despensa', '🥫', 7),
    ('Congelados', '🧊', 8),
    ('Bebidas', '🥤', 9),
    ('Snacks y dulces', '🍫', 10),
    ('Limpieza', '🧽', 11),
    ('Higiene', '🧴', 12),
    ('Mascotas', '🐾', 13),
    ('Otros', '📦', 14)
  ) as c(name, icon, ord)
  where not exists (
    select 1 from public.categories
    where household_id = hid and name = c.name
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Backfill de hogares existentes
-- ---------------------------------------------------------------------------
-- Renombrar la categoría combinada a "Verdura": conserva todos los productos ya
-- asociados (mismo id) para no perder clasificaciones existentes.
update public.categories
set name = 'Verdura', icon = '🥦'
where name = 'Frutas y verduras';

-- Crear "Fruta" en cada hogar que tenga "Verdura" pero aún no "Fruta".
-- sort_order 0 → aparece justo antes de "Verdura" en el listado.
insert into public.categories (household_id, name, icon, sort_order)
select v.household_id, 'Fruta', '🍎', 0
from public.categories v
where v.name = 'Verdura'
  and not exists (
    select 1 from public.categories f
    where f.household_id = v.household_id and f.name = 'Fruta'
  );
