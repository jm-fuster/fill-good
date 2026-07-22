-- F4 — Pack de compra: "1 caja = N unidades" al entrar al inventario.
--
-- `pack_size` es un multiplicador de ENTRADA para productos contables (ud):
-- cada unidad comprada añade `pack_size` unidades al inventario. NO es una
-- conversión entre familias de unidades (eso lo prohíbe la política E3) ni toca
-- el precio del ticket (que sigue siendo por línea/caja).
--
-- null = sin pack → comportamiento actual intacto.

alter table public.products
  add column if not exists pack_size numeric(10, 2) check (pack_size > 0);

comment on column public.products.pack_size is
  'F4: unidades que entran al inventario por cada unidad comprada (solo ud). null = sin pack.';
