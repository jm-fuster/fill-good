-- ============================================================================
-- Migración — Panel de gasto mensual (M1)
-- ============================================================================
-- Soporte para el bloque "Resumen del mes" de /precios:
--   · households.monthly_budget: objetivo de gasto mensual OPCIONAL, editable
--     desde /ajustes. Nullable: sin objetivo = sin barra de progreso.
--   · receipts.discount_total: total ahorrado en descuentos del ticket. Las
--     líneas de descuento (is_discount) NO se persisten en receipt_items (se
--     filtran al escanear), así que aquí se guarda su suma al confirmar. El
--     valor es POSITIVO = € ahorrados.
-- Backfill de discount_total desde raw_extraction para los tickets que ya
-- estaban confirmados antes de esta migración.
-- ============================================================================

alter table public.households
  add column monthly_budget numeric(10, 2);

alter table public.receipts
  add column discount_total numeric(10, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Backfill: suma del valor absoluto de las líneas de descuento guardadas en la
-- extracción. El modelo puede emitir total_price negativo o positivo en esas
-- líneas; abs() lo normaliza a "€ ahorrados".
-- ---------------------------------------------------------------------------
update public.receipts r
set discount_total = coalesce(sub.disc, 0)
from (
  select r2.id,
         sum(abs((item ->> 'total_price')::numeric)) as disc
  from public.receipts r2,
       jsonb_array_elements(r2.raw_extraction -> 'items') as item
  where r2.raw_extraction is not null
    and (item ->> 'is_discount')::boolean is true
    and item ->> 'total_price' is not null
  group by r2.id
) sub
where r.id = sub.id;
