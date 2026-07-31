-- ============================================================================
-- Migración — Ahorramás y Spar pasan a ser cadenas conocidas
-- ============================================================================
-- `chains.ts` ya no las trata como TIENDA PROPIA del hogar: ahora tienen clave
-- corta (`ahorramas`, `spar`) y etiqueta. No hace falta ningún cambio de esquema
-- —las columnas de cadena son texto libre con cotas de cordura, justo para que el
-- vocabulario pueda crecer sin migración— pero sí un arreglo de DATOS.
--
-- El problema: quien ya las había añadido a mano las tiene guardadas con el
-- NOMBRE como clave («Ahorramás»), porque así funcionan las tiendas propias. Sin
-- este arreglo convivirían dos claves para la misma tienda:
--
--   · en Ajustes > Tiendas saldría la casilla «Ahorramás» (clave nueva, sin
--     marcar) Y una fila «Ahorramás» en «Tus tiendas»;
--   · en el selector de tienda de la lista saldrían DOS chips con el mismo
--     rótulo y distinto comportamiento;
--   · y el historial de precios de esa tienda quedaría partido en dos.
--
-- Qué hace: reescribir esos nombres a la clave nueva en las ocho columnas que
-- comparten el vocabulario de cadenas. Es una normalización SIN pérdida: los dos
-- valores designan la misma tienda, hoy y antes de esta migración.
--
-- Por qué la lista de grafías es LITERAL y no un normalizador SQL: la migración
-- 20260728180000 ya dejó dicho que reimplementar `normalizeName` en SQL abre una
-- divergencia silenciosa con el TS. Aquí no hace falta: son dos tiendas y sus
-- grafías realistas se enumeran a mano. La lista se corresponde con
-- `CHAIN_ALIASES` + `matchBuiltInChain` de `src/features/prices/chains.ts`; si
-- añades un alias allí, este fichero NO se retoca (ya está aplicado) — lo que
-- toque se arregla en la migración que lo introduzca.
--
-- Lo que NO cubre: un nombre escrito con acentos descompuestos (NFD). El TS lo
-- normaliza, el SQL compara contra literales precompuestos (NFC), que es lo que
-- produce cualquier teclado. Si alguno se escapa, el síntoma es una fila
-- duplicada en Ajustes > Tiendas que se quita a mano — no se pierde nada.
--
-- Idempotente: sobre datos ya convertidos no cambia ninguna fila.
-- ============================================================================

create temporary table chain_fix (old_norm text primary key, new_chain text not null);

-- Solo grafías de la MISMA tienda. Los formatos de una enseña (EuroSpar, Spar
-- Express) NO entran, por lo mismo que no están en `CHAIN_ALIASES`: son tiendas
-- distintas con precios distintos y juntarlas mezclaría dos historiales.
insert into chain_fix (old_norm, new_chain) values
  ('ahorramás', 'ahorramas'),
  ('ahorramas', 'ahorramas'),
  ('ahorra más', 'ahorramas'),
  ('ahorra mas', 'ahorramas'),
  ('spar', 'spar');

-- ── Tiendas del hogar (array) ───────────────────────────────────────────────
-- `distinct` porque un hogar puede tener las dos grafías («Spar» y «SPAR») y al
-- converger a la misma clave el array tendría un repetido, que rompería el
-- selector. El orden alfabético es solo para que el resultado sea determinista:
-- la app reordena las cadenas al pintarlas (`orderChains`).
with remapped as (
  select h.id,
         array_agg(distinct coalesce(f.new_chain, e.val)
                   order by coalesce(f.new_chain, e.val)) as arr
  from public.households h
  cross join lateral unnest(h.preferred_chains) as e(val)
  left join chain_fix f on f.old_norm = lower(btrim(e.val))
  group by h.id
  having bool_or(f.new_chain is not null and f.new_chain <> e.val)
)
update public.households h
set preferred_chains = r.arr
from remapped r
where h.id = r.id;

-- ── Columnas de cadena sueltas ──────────────────────────────────────────────
update public.products p
set preferred_chain = f.new_chain
from chain_fix f
where lower(btrim(p.preferred_chain)) = f.old_norm
  and p.preferred_chain <> f.new_chain;

update public.products p
set inferred_chain = f.new_chain
from chain_fix f
where lower(btrim(p.inferred_chain)) = f.old_norm
  and p.inferred_chain <> f.new_chain;

update public.receipts r
set store_chain = f.new_chain
from chain_fix f
where lower(btrim(r.store_chain)) = f.old_norm
  and r.store_chain <> f.new_chain;

update public.receipt_items ri
set store_chain = f.new_chain
from chain_fix f
where lower(btrim(ri.store_chain)) = f.old_norm
  and ri.store_chain <> f.new_chain;

update public.product_aliases a
set store_chain = f.new_chain
from chain_fix f
where lower(btrim(a.store_chain)) = f.old_norm
  and a.store_chain <> f.new_chain;

-- ── Aviso de ahorro materializado ───────────────────────────────────────────
-- `savings_tip` guarda las cadenas DENTRO de un jsonb ({currentChain,
-- cheaperChain, savingsPct}). En vez de reescribir el json se anula el aviso de
-- los productos afectados: es una caché de `receipt_items`, que las líneas de
-- arriba ya han corregido, y `refreshPriceInsights` la vuelve a calcular. Un
-- aviso de menos durante un rato es mejor que un aviso que compara una tienda
-- consigo misma bajo dos claves.
update public.products p
set savings_tip = null
where p.savings_tip is not null
  and exists (
    select 1
    from chain_fix f
    where lower(btrim(p.savings_tip ->> 'currentChain')) = f.old_norm
       or lower(btrim(p.savings_tip ->> 'cheaperChain')) = f.old_norm
  );

-- ── Orden de pasillos por tienda ────────────────────────────────────────────
-- `chain` forma parte de la PK (household_id, chain, category_id), así que el
-- UPDATE solo mueve la fila si el destino está libre. Colisionar exige tener
-- guardado el orden de la MISMA categoría con dos grafías distintas de la misma
-- tienda; en ese caso se conserva una y se descarta la otra, que es lo único
-- que se puede hacer con dos respuestas a la misma pregunta.
update public.category_chain_order o
set chain = f.new_chain
from chain_fix f
where lower(btrim(o.chain)) = f.old_norm
  and o.chain <> f.new_chain
  and not exists (
    select 1
    from public.category_chain_order x
    where x.household_id = o.household_id
      and x.category_id = o.category_id
      and x.chain = f.new_chain
  );

delete from public.category_chain_order o
using chain_fix f
where lower(btrim(o.chain)) = f.old_norm
  and o.chain <> f.new_chain;

drop table chain_fix;

comment on column public.category_chain_order.chain is
  'Clave de cadena (chains.ts): una de las conocidas en minúsculas o el nombre de una tienda propia del hogar.';
