-- ============================================================================
-- Migración — Señales de precio materializadas en products (rendimiento, f2)
-- ============================================================================
-- La cadena habitual inferida (L15 f2) y el aviso de ahorro (L15 f3) se
-- calculaban en CADA render de /inventario y /lista escaneando TODO el histórico
-- de receipt_items del hogar (coste creciente con cada ticket). Estas señales
-- solo cambian cuando cambia el histórico (confirmar ticket, fusionar productos,
-- cambiar tienda preferida), así que se materializan en products y se refrescan
-- en esos puntos (ver src/features/prices/materialize.ts).
--
-- Sin cambios de RLS: products ya está restringida por hogar.
-- ============================================================================

alter table public.products
  add column inferred_chain text,
  add column savings_tip jsonb;

comment on column public.products.inferred_chain is
  'Cadena habitual inferida del histórico de tickets (L15 f2). Materializada al confirmar ticket / fusionar / cambiar preferencia. null = sin señal.';
comment on column public.products.savings_tip is
  'Aviso de ahorro {currentChain, cheaperChain, savingsPct} (L15 f3). Materializado junto a inferred_chain. null = sin aviso.';
