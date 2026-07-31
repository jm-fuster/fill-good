-- ============================================================================
-- Tickets confirmados sin fecha de compra: rescatarlos de la invisibilidad
-- ============================================================================
-- Los agregados mensuales (gasto, hucha, resumen, push del día 1) filtran con
-- gte(purchased_at, …), que excluye los NULL: un ticket confirmado sin fecha
-- desaparecía de TODAS las cifras sin dejar rastro (auditoría 2026-07-31). El
-- caso real es una foto de la que la IA no saca fecha y una revisión que no la
-- corrige.
--
-- Desde ahora confirmar garantiza fecha (confirmReceiptAction cae a la fecha
-- de subida como último recurso: se escanea al llegar a casa, el error posible
-- es de horas, no de mes); esto rescata los ya confirmados con el mismo
-- criterio.
update public.receipts
  set purchased_at = created_at::date
  where purchased_at is null and status = 'confirmed';
