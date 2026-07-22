-- ============================================================================
-- Migración — N2: regeneración respetuosa (source + pinned)
-- ============================================================================
-- Para que "Generar menú con IA" deje de arrasar la semana necesitamos saber
-- qué entradas nacieron de la IA y cuáles ha fijado el usuario.
--
--   source = 'manual' | 'ai'  — quién creó/tocó por última vez la entrada.
--   pinned                     — el usuario la fija: la regeneración NUNCA la toca.
--
-- El default 'manual' hace de backfill CONSERVADOR: todo lo que ya existía queda
-- protegido de la regeneración (mejor proteger de más que borrar trabajo humano).

alter table public.menu_entries
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai')),
  add column if not exists pinned boolean not null default false;
