-- ============================================================================
-- Migración — Realtime de la lista: que los BORRADOS lleguen al otro móvil
-- ============================================================================
-- Con la identidad de réplica por defecto (la clave primaria), el WAL de un
-- DELETE solo lleva el `id`: el registro viejo no tiene `list_id`, así que el
-- filtro de la suscripción (`list_id=eq.<lista>`) no puede casar y el evento no
-- se entrega a NADIE. Resultado: quitar un artículo se veía al instante en el
-- móvil que lo quitaba (por su propio refresco) y no llegaba nunca al de quien
-- compraba con él, que seguía viéndolo hasta recargar.
--
-- Con `replica identity full` el registro viejo viaja completo, de modo que el
-- filtro casa y la RLS puede autorizar el evento por hogar (necesita
-- `household_id`, que también va dentro). El coste es un WAL algo mayor en
-- updates y deletes; en una tabla de artículos de lista es irrelevante.
-- ============================================================================

alter table public.shopping_list_items replica identity full;
