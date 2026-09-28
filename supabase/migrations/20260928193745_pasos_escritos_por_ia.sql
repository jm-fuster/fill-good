-- ============================================================================
-- De dónde salen los pasos de una receta
-- ============================================================================
-- El Reglamento de IA (art. 50.2) pide marcar «en un formato legible por
-- máquina» el texto que genera la IA, y a Fill Good se le aplica desde el
-- 2-dic-2026. Los menús y las recetas inventadas ya lo llevan
-- (`menu_entries.source`, `weekly_menus.generated_by`, `recipes.source`), y
-- `lib/ai/provenance.ts` lo pasa al HTML. Quedaba un hueco: los pasos que la IA
-- escribe desde el menú con «Escribir los pasos con IA»
-- (`fillRecipeDetailsAction`). Esos se guardan directos, sin que una persona
-- los revise, y caen en una receta que puede ser del hogar o del pack, así que
-- `recipes.source` no dice nada de ellos.
--
-- Los pasos que la IA propone en el FORMULARIO siguen fuera: llegan como
-- borrador, una persona los revisa y los guarda, y desde ese momento son del
-- hogar. Por eso guardar el formulario devuelve la columna a 'manual'.
--
-- Sin relleno del histórico, a propósito: el 28-sep solo UNA receta de
-- producción tenía pasos, y no hay forma de saber quién los escribió.
-- ============================================================================

alter table public.recipes
  add column steps_source text not null default 'manual'
    constraint recipes_steps_source_check check (steps_source in ('manual', 'ai'));

comment on column public.recipes.steps_source is
  'Quién escribió `steps`: ''ai'' cuando los guardó la IA sin revisión (el botón del menú), ''manual'' en el resto. Guardar el formulario lo devuelve a ''manual''. Marca del art. 50.2 del Reglamento de IA; ver src/lib/ai/provenance.ts.';
