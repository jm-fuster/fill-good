-- ============================================================================
-- Relleno: líneas de tickets confirmados que se quedaron sin fecha de compra
-- ============================================================================
-- `receipt_items.purchased_at` (y `store_chain`) son lo que hace que una línea
-- cuente como PRECIO: todas las consultas de precios filtran
-- `purchased_at is not null`. La confirmación del ticket las copia desde la
-- cabecera, pero hubo tickets confirmados antes de que lo hiciera en todas las
-- líneas, y esas quedaron fuera del historial de precios, de las alertas y de
-- la hucha para siempre.
--
-- Medido en producción el 23-sep-2026: 17 líneas de tickets confirmados sin
-- fecha. 11 son líneas SALTADAS, que se quedan así a propósito (no son una
-- compra del hogar y no deben contar como precio); las otras 6 tienen producto
-- y su ticket sí tiene fecha. Solo esas se rellenan, con la fecha y la cadena
-- del ticket (la cadena solo si la línea no tenía una propia).
--
-- Idempotente: vuelve a aplicarse sin tocar nada, porque solo mira las nulas.
-- Las señales de precio materializadas en `products` se recalculan solas en
-- el próximo ticket confirmado de cada producto.
-- ============================================================================

update public.receipt_items ri
set purchased_at = r.purchased_at,
    store_chain = coalesce(ri.store_chain, r.store_chain)
from public.receipts r
where ri.receipt_id = r.id
  and r.status = 'confirmed'
  and r.purchased_at is not null
  and ri.purchased_at is null
  and ri.product_id is not null
  and ri.match_status <> 'skipped';
