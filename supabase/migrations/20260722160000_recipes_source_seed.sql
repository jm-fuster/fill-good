-- ============================================================================
-- Migración — N4: recetas importadas del pack curado ("Explorar recetas")
-- ============================================================================
-- Amplía el check de recipes.source con 'seed' para trazar las recetas que el
-- usuario importa del pack curado del repo (distintas de 'manual' y 'ai'). Son
-- recetas normales del hogar (editables/borrables); 'seed' solo marca su origen.

alter table public.recipes drop constraint if exists recipes_source_check;
alter table public.recipes
  add constraint recipes_source_check
  check (source in ('manual', 'ai', 'seed'));
