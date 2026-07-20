-- ============================================================================
-- Migración 0008 — Recetario del hogar (B1)
-- ============================================================================
-- Distingue las recetas del RECETARIO (guardadas a mano o adoptadas de la IA)
-- de las recetas EFÍMERAS que la IA crea al generar un menú:
--   · is_saved = true  → pertenece al recetario y aparece en /recetas.
--   · is_saved = false → receta efímera de un menú generado (no listada).
-- Añade también la temporada (para filtrar sopas de invierno, etc.) y el
-- nombre normalizado (dedupe del recetario + vinculación ingrediente→producto).
--
-- normalized_name lo calcula la app (lib/normalize.ts) al escribir; aquí solo
-- se backfillea el histórico con la misma lógica (minúsculas, sin acentos,
-- espacios colapsados). Mismo criterio que products.normalized_name.
-- ============================================================================

alter table public.recipes
  add column is_saved boolean not null default false,
  add column seasons text[] not null default '{all}',
  add column normalized_name text;

-- Las recetas manuales existentes forman ya parte del recetario.
update public.recipes set is_saved = true where source = 'manual';

-- ---------------------------------------------------------------------------
-- Backfill de normalized_name (equivalente SQL de lib/normalize.ts):
-- trim + lower + quitar diacríticos (incl. ñ→n, ç→c) + colapsar espacios.
-- ---------------------------------------------------------------------------
update public.recipes
set normalized_name = regexp_replace(
  translate(
    lower(btrim(name)),
    'áàäâãéèëêíìïîóòöôõúùüûñç',
    'aaaaaeeeeiiiiooooouuuunc'
  ),
  '\s+', ' ', 'g'
)
where normalized_name is null;

-- ---------------------------------------------------------------------------
-- Dedupe del recetario: un mismo nombre normalizado no puede guardarse dos
-- veces en el hogar. Parcial (solo is_saved) para no molestar a las efímeras.
-- ---------------------------------------------------------------------------
create unique index recipes_saved_normalized_idx
  on public.recipes (household_id, normalized_name)
  where is_saved;

-- Índice para el listado del recetario (se filtra por is_saved en /recetas).
create index recipes_saved_idx
  on public.recipes (household_id, is_saved, created_at desc);
