-- ============================================================================
-- Migración 0007 — "Consumir pronto" en el inventario (A3)
-- ============================================================================
-- Marca manual para priorizar el consumo de un producto aunque no tenga (o no
-- se conozca) fecha de caducidad — p. ej. "el pan de molde se está poniendo
-- duro". La revisión de caducidades tras la compra (/inventario/revision) y el
-- drawer de edición pueden activar/desactivar este flag; el inventario lo
-- muestra con un badge de aviso y el generador de menús lo trata con la misma
-- prioridad que una caducidad inminente.
-- ============================================================================

alter table public.inventory_items
  add column use_soon boolean not null default false;
