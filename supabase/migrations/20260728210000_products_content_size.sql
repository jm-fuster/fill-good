-- ============================================================================
-- Migración — Contenido de cada unidad (envases con medida dentro)
-- ============================================================================
-- Hasta ahora `default_unit` hacía dos trabajos a la vez: la unidad en la que se
-- CUENTA el stock y la unidad en la que se PAGA. Para casi todo lo envasado son
-- cosas distintas: cuentas 3 bricks y pagas 500 ml cada uno. Forzar una sola
-- columna obligaba a elegir, y elegir la medida dejaba el producto sin poder
-- contarse ("0,75 g de peras" en vez de "3 peras").
--
-- `content_size` + `content_unit` describen el contenido de UNA unidad. Con eso,
-- 3 ud de caldo son también 1,5 l, y las conversiones ud↔medida dejan de ser
-- adivinanzas: el factor lo da el usuario, no lo inventa la app. Eso es lo que
-- las hace compatibles con la política de E3/E9 (no convertir en silencio).
--
-- NO confundir con `pack_size` (F4), que es conteo→conteo ("1 compra = 30 ud").
-- Son números distintos y se pueden componer: un pack de 6 bricks de 1 l. Por
-- eso `content_unit` no admite 'ud': ese caso ya lo cubre `pack_size`.
--
-- null = comportamiento actual intacto. Aplica solo a productos contables (lo
-- gatea la app, no una restricción: cambiar la unidad de una fila no debe
-- fallar por un contenido que se queda inerte).
-- ============================================================================

alter table public.products
  add column content_size numeric(10, 2) check (content_size > 0),
  add column content_unit public.unit_type;

-- O los dos o ninguno: un contenido sin unidad (o una unidad sin contenido) no
-- significa nada y ensuciaría cualquier cálculo posterior.
alter table public.products
  add constraint products_content_pair check (
    (content_size is null and content_unit is null)
    or (
      content_size is not null
      and content_unit is not null
      and content_unit <> 'ud'
    )
  );
