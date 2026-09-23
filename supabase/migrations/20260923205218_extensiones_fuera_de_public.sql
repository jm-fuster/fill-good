-- ============================================================================
-- pg_trgm y unaccent, fuera de public
-- ============================================================================
-- Las dos extensiones se instalaron en `public`, y todo lo que vive ahí lo
-- publica la Data API: sus funciones (`unaccent`, `show_trgm`, `show_limit`…)
-- salían como RPC que cualquiera podía llamar con la clave pública. No tocan
-- ningún dato, pero es superficie que no hace falta, y es justo lo que marca el
-- linter de Supabase (extension_in_public).
--
-- Se pueden mover sin tocar nada más porque la base no las usa: ninguna
-- función, índice ni consulta llama a `unaccent()` ni a `similarity()` (el
-- `unaccent` se descartó para las columnas en la migración de inventario por no
-- ser inmutable, y la similitud de los nombres se calcula en TypeScript, en
-- `src/lib/similarity.ts`). Quedan instaladas en `extensions`, que la Data API
-- no expone, por si algún día se usan desde SQL. Las dos son reubicables.
-- ============================================================================
create schema if not exists extensions;

alter extension pg_trgm set schema extensions;
alter extension unaccent set schema extensions;
