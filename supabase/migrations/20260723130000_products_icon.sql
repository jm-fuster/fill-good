-- L16 — Icono personalizable por producto: "que la leche tenga cara de leche".
--
-- `icon` es un OVERRIDE MANUAL a nivel de hogar: cuando está a null (por
-- defecto), el icono se resuelve automáticamente en la app a partir del nombre
-- del producto (diccionario determinista en src/lib/product-icons/guess.ts) y,
-- en su defecto, del icono de la categoría. Guardar un slug aquí lo fija a mano;
-- limpiarlo (null) vuelve al automático. Mismo patrón manual↔automático que
-- `preferred_chain` (L15).
--
-- El valor es un SLUG del registro estático de iconos (Fluent Emoji High
-- Contrast, MIT): texto corto, NO un emoji ni una URL. La validación del slug
-- contra el registro vive en la app (server action); en BBDD solo acotamos la
-- longitud. null = automático (estado por defecto, siempre válido). RLS heredada
-- de la tabla products.

alter table public.products
  add column if not exists icon text
    check (icon is null or char_length(icon) between 1 and 40);

comment on column public.products.icon is
  'L16: slug de icono elegido a mano (registro src/lib/product-icons). null = automatico (se adivina del nombre/categoria).';
