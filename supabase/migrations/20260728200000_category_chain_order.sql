-- ============================================================================
-- Migración — Orden de pasillos POR TIENDA (fase B del orden de la tienda)
-- ============================================================================
-- `categories.sort_order` sigue siendo EL ORDEN GENERAL del hogar: es el que
-- manda en /lista y el que usa cualquier tienda que no tenga uno propio. Esta
-- tabla solo guarda EXCEPCIONES: "en Lidl, Congelados va antes que Panadería".
--
-- Por qué una tabla de excepciones y no un orden completo por tienda:
--   1. Un hogar con una sola tienda (la mayoría) no escribe ni una fila y todo
--      sigue funcionando exactamente igual que antes de esta migración.
--   2. No hay backfill ni riesgo de dejar dos fuentes de verdad desincronizadas:
--      sin fila, la respuesta es el orden general.
--   3. Añadir una categoría nueva no obliga a tocar N tiendas.
--
-- `chain` es texto y NO un FK: el vocabulario de cadenas vive en
-- src/features/prices/chains.ts y admite tiendas propias del hogar, donde el
-- nombre escrito ES la clave (ver el comentario de ese módulo). Mismo criterio
-- que receipts.store_chain, products.preferred_chain y
-- households.preferred_chains, con las que comparte columna conceptual. El CHECK
-- solo pone cotas de cordura (1..40, igual que CHAIN_NAME_MAX); de aceptar solo
-- claves con sentido se encarga la Server Action.
--
-- Consecuencia asumida: quitar una tienda del hogar NO borra su orden. Si se
-- vuelve a añadir, reaparece tal como estaba, que es lo que espera quien la
-- quitó por error. Son unas pocas filas por tienda; no compensa un trigger.
--
-- La PK (household_id, chain, category_id) ya da el índice por el que se lee
-- siempre (todas las filas de un hogar, o las de un hogar y una tienda), así que
-- no hace falta ningún índice extra. El orden se aplica en TS al agrupar.
-- ============================================================================

create table public.category_chain_order (
  household_id uuid not null references public.households (id) on delete cascade,
  chain text not null check (char_length(chain) between 1 and 40),
  -- on delete cascade: borrar un pasillo borra su posición en cada tienda.
  category_id uuid not null references public.categories (id) on delete cascade,
  sort_order int not null check (sort_order >= 0),
  primary key (household_id, chain, category_id)
);

alter table public.category_chain_order enable row level security;

create policy "category_chain_order_all_member" on public.category_chain_order
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.category_chain_order to authenticated;

comment on table public.category_chain_order is
  'Orden de pasillos propio de una tienda. Solo excepciones: sin fila para (hogar, tienda, categoría) manda categories.sort_order, que es el orden general del hogar.';
comment on column public.category_chain_order.chain is
  'Clave de cadena (chains.ts): las ocho conocidas en minúsculas o el nombre de una tienda propia del hogar.';
comment on column public.category_chain_order.sort_order is
  'Posición 0..n-1 dentro de esta tienda. Los pasillos sin fila van DETRÁS de los colocados, en su orden general.';
