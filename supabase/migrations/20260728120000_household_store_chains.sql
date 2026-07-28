-- ============================================================================
-- Migración — L15 f4: supermercados habituales del hogar
-- ============================================================================
-- `preferred_chains` son las cadenas donde el hogar suele comprar. NO restringe
-- nada (igual que products.preferred_chain es una preferencia BLANDA): solo
--   1. ordena el selector de "tienda preferida" (habituales primero), y
--   2. da contexto al prompt de tickets para normalizar mejor `store_chain`.
--
-- Vacío = SIN CONFIGURAR, y entonces la app las deduce de los tickets del hogar
-- (mismo patrón manual/inferido de products.preferred_chain vs inferred_chain:
-- lo manual manda y lo inferido cubre al resto). Por eso el default es '{}' y no
-- hay backfill: el hogar que no entre nunca aquí obtiene igualmente el beneficio.
--
-- text[] y no un enum, por coherencia con receipts.store_chain y
-- products.preferred_chain: el vocabulario vive en src/features/prices/chains.ts
-- y puede crecer sin migración (p. ej. cadenas regionales). Por eso el CHECK solo
-- pone cotas de cordura y NO la lista de claves válidas: de eso se encarga
-- `storeChainsSchema` en la Server Action, que solo acepta claves conocidas.
--
-- Solo funciones IMMUTABLE en el CHECK (cardinality, array_position): las que
-- serializan el array, como array_to_string, son STABLE y Postgres las rechaza.
-- ============================================================================

alter table public.households
  add column if not exists preferred_chains text[] not null default '{}'::text[]
    check (
      cardinality(preferred_chains) <= 20
      and array_position(preferred_chains, null::text) is null
    );

comment on column public.households.preferred_chains is
  'L15 f4: cadenas donde el hogar suele comprar (claves de chains.ts). ''{}'' = sin configurar → se deducen de los tickets.';

-- El blindaje de 2026-07 revocó el UPDATE de tabla completa y solo concedió
-- monthly_budget; sin este grant por columna, el UPDATE de los miembros falla
-- aunque la RLS de fila (households_update_member) lo permita.
grant update (preferred_chains) on public.households to authenticated;
