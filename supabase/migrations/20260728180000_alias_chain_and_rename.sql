-- ============================================================================
-- Migración — Cadena de origen de los nombres de ticket y aviso de renombrado
-- ============================================================================
-- `product_aliases` ya permite que un producto tenga VARIOS nombres de ticket
-- (uno por cadena, más las variantes de rótulo), y eso es exactamente lo que se
-- quiere: el mismo gazpacho se imprime distinto en Mercadona y en Carrefour.
--
-- Lo que faltaba es saber DE DÓNDE vino cada nombre. Sin la cadena no se puede
-- distinguir el caso legítimo ("dos supermercados, dos rótulos") del caso que
-- ensucia el catálogo: la MISMA cadena acumulando dos nombres del mismo
-- artículo porque cambió su etiqueta ("GAZPACHO HACEND." → "GAZPACHO HACENDADO
-- 1L"). Con la cadena guardada, ese segundo caso se detecta y se pregunta.
--
-- Tres columnas, ninguna tabla nueva:
--
--  · store_chain: cadena en la que se vio este nombre POR ÚLTIMA VEZ. No es un
--    historial: un rótulo de ticket es propio de su cadena y casi nunca aparece
--    en dos, así que en la práctica es estable. Guardar el historial completo
--    exigiría una tabla de avistamientos y no compra nada que se vaya a usar.
--    NULL = aprendido antes de esta migración (o por fusión de productos, que no
--    viene de ningún ticket): nunca genera aviso de renombrado.
--
--  · last_seen_at: fecha de compra del último ticket que trajo este nombre. Es
--    contexto para que el usuario decida ("en Mercadona ya lo llamabas X, última
--    vez el 12 de mayo"), no un criterio automático.
--
--  · rename_dismissed_at: el usuario ya dijo que este nombre NO es un rótulo
--    viejo que haya que borrar. Sin esto, decir "no, son distintos" no serviría
--    de nada: el mismo aviso volvería en el siguiente ticket, que es justo la
--    clase de aviso que se aprende a ignorar. Va en el alias VIEJO porque la
--    unidad de silencio es él: «este nombre es legítimo, déjalo en paz».
--
-- El aviso NUNCA borra nada por su cuenta: propone, y el usuario decide en la
-- revisión del ticket (misma regla que el resto del matching).
-- ============================================================================

alter table public.product_aliases
  add column if not exists store_chain text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists rename_dismissed_at timestamptz;

comment on column public.product_aliases.store_chain is
  'Cadena donde se vio este nombre por última vez (null = origen desconocido).';
comment on column public.product_aliases.last_seen_at is
  'Fecha de compra del último ticket que trajo este nombre.';
comment on column public.product_aliases.rename_dismissed_at is
  'El usuario confirmó que este nombre no es un rótulo viejo: no volver a proponer borrarlo.';

-- La detección pregunta «¿tiene este producto otros nombres en esta cadena?».
create index if not exists product_aliases_product_chain_idx
  on public.product_aliases (product_id, store_chain);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Los aliases existentes se guardaron con el texto crudo de la línea TAL CUAL
-- (`raw_text || description`), así que se pueden repuntar a su cadena por
-- igualdad LITERAL contra `receipt_items`. Deliberadamente no se normaliza en
-- SQL: `normalizeName` vive en TS y reimplementarla aquí abriría una
-- divergencia silenciosa en la unicidad de aliases. Lo que no case por igualdad
-- literal se queda con store_chain NULL, que solo significa «este nombre no
-- participa en los avisos de renombrado hasta que vuelva a aparecer en un
-- ticket» — nada se rompe ni se pierde.
with sightings as (
  select
    ri.household_id,
    ri.product_id,
    ri.raw_text,
    max(ri.purchased_at) as last_seen,
    -- Cadena del avistamiento MÁS RECIENTE (no una cualquiera del grupo).
    (array_agg(ri.store_chain order by ri.purchased_at desc))[1] as store_chain
  from public.receipt_items ri
  where ri.raw_text is not null
    and ri.product_id is not null
    and ri.purchased_at is not null
    and ri.store_chain is not null
  group by ri.household_id, ri.product_id, ri.raw_text
)
update public.product_aliases a
set store_chain = s.store_chain,
    last_seen_at = s.last_seen
from sightings s
where a.household_id = s.household_id
  and a.product_id = s.product_id
  and a.alias = s.raw_text
  and a.store_chain is null;
