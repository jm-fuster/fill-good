-- ============================================================================
-- Migración — El contenido puede ser un PESO MEDIO, no un dato exacto
-- ============================================================================
-- Un brick trae 500 ml exactos; una pera pesa "unos" 200 g. Las dos cosas se
-- describen igual (`content_size` + `content_unit`), pero no valen lo mismo: con
-- la primera se puede afirmar, con la segunda solo estimar.
--
-- En vez de columnas nuevas para el fresco al peso, se marca el contenido que ya
-- existe. Así todo lo construido sobre él (conversión, coste de receta, €/kg,
-- suficiencia) sigue funcionando sin duplicar caminos: la bandera solo cambia la
-- CONFIANZA con la que se presenta el resultado (se muestra con «≈» y no emite
-- veredictos de suficiencia).
--
-- Invariante que NO se toca: el histórico de precios sigue guardando el €/kg del
-- ticket. Un peso medio jamás reescribe un precio pagado — eso convertiría la
-- parte más fiable de la app en una estimación.
-- ============================================================================

alter table public.products
  add column content_is_estimate boolean not null default false;

-- Marcar como aproximado un contenido que no existe no significa nada.
alter table public.products
  add constraint products_content_estimate_needs_content check (
    content_is_estimate = false or content_size is not null
  );
