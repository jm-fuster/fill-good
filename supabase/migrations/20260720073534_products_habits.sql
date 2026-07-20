-- ============================================================================
-- Migración 0006 — Productos habituales (A2)
-- ============================================================================
-- Memoria de "habitualidad" del catálogo: cuántas veces se ha comprado cada
-- producto y cuándo fue la última vez. Alimenta el autocompletado inteligente
-- de la lista y la sección "Habituales".
--   · purchase_count se incrementa al llevar algo al inventario por compra
--     (checkoutAction en la lista y confirmReceiptAction en tickets), vía la
--     función atómica bump_product_purchase().
--   · Backfill inicial desde el historial de líneas de ticket confirmadas.
-- ============================================================================

alter table public.products
  add column purchase_count int not null default 0,
  add column last_purchased_at timestamptz;

-- ---------------------------------------------------------------------------
-- Backfill: nº de líneas de ticket llevadas al inventario, por producto.
-- ---------------------------------------------------------------------------
update public.products p
set purchase_count = sub.cnt,
    last_purchased_at = sub.last_at
from (
  select product_id,
         count(*) as cnt,
         max(coalesce(purchased_at::timestamptz, created_at)) as last_at
  from public.receipt_items
  where product_id is not null
    and added_to_inventory = true
  group by product_id
) as sub
where p.id = sub.product_id;

-- ---------------------------------------------------------------------------
-- Incremento atómico de la habitualidad de un producto.
-- security invoker (por defecto): la RLS de products aplica con el contexto de
-- quien llama, que debe ser miembro del hogar dueño del producto.
-- ---------------------------------------------------------------------------
create or replace function public.bump_product_purchase(pid uuid)
returns void
language sql
as $$
  update public.products
  set purchase_count = purchase_count + 1,
      last_purchased_at = now()
  where id = pid;
$$;

grant execute on function public.bump_product_purchase(uuid) to authenticated;
