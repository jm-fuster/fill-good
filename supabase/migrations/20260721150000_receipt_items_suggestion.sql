-- ============================================================================
-- Migración — Sugerencia de producto por IA en la extracción (E7)
-- ============================================================================
-- La extracción del ticket (una sola llamada a Gemini) puede sugerir, por línea,
-- a qué producto del catálogo del hogar corresponde. Esa sugerencia se calcula
-- en el escaneo (la IA no se puede recomputar en la revisión), así que se
-- persiste por línea. NUNCA auto-asocia: es un candidato que el usuario confirma
-- en la revisión (y esa confirmación aprende el alias, como siempre).
--
-- `on delete set null`: si el producto sugerido se borra, la línea no rompe.
-- ============================================================================

alter table public.receipt_items
  add column suggested_product_id uuid
    references public.products (id) on delete set null;
