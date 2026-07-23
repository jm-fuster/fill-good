-- L15 — Tienda preferida por producto: "este pan, siempre en Mercadona".
--
-- `preferred_chain` es una preferencia BLANDA a nivel de hogar: orienta el modo
-- compra (filtro por tienda y badge en la lista) pero nunca oculta ni bloquea
-- nada. Comparte vocabulario con `receipts.store_chain` / `receipt_items.store_chain`
-- (claves de src/features/prices/chains.ts: mercadona, carrefour, dia…) para
-- poder cruzarlo en el futuro con la comparativa de precios por cadena.
--
-- Texto libre (no enum) por coherencia con store_chain, que viene de la IA de
-- tickets y puede traer cadenas fuera del catálogo. null = "de cualquier sitio"
-- (estado por defecto, siempre válido). RLS heredada de la tabla products.

alter table public.products
  add column if not exists preferred_chain text
    check (preferred_chain is null or char_length(preferred_chain) between 1 and 40);

comment on column public.products.preferred_chain is
  'L15: cadena donde el hogar prefiere comprar este producto (clave de chains.ts). null = sin preferencia.';
