-- ============================================================================
-- Migración — R2: repaso de cocinado (skipped_at + checkin_enabled)
-- ============================================================================
-- El problema: nadie entra al menú a posteriori a marcar "Lo cocinamos", así que
-- `cooked_at` se queda a null y el inventario, la apetencia y el coste semanal
-- se desfasan. La solución pregunta por los platos pasados sin resolver, y para
-- no volver a preguntar necesita distinguir tres cosas, no dos:
--
--   cooked_at  → se cocinó (ya existía).
--   skipped_at → se planificó pero NO se cocinó (nuevo).
--   ambos null → sin resolver: de esto es de lo que se pregunta.
--
-- Semántica de `skipped_at` (idéntica a la de `cooked_at`): guarda la FECHA DE LA
-- ENTRADA, no el instante de la respuesta, y es MUTUAMENTE EXCLUYENTE con
-- `cooked_at` (marcar una limpia la otra; lo garantizan las actions).
--
-- `skipped_at` se guarda desde el día 1 pero NO alimenta todavía al generador
-- ni a "¿Qué hago hoy?": primero acumular dato real. Es una señal nueva
-- ("planificado y nunca cocinado") que hoy no existe en ninguna parte.

alter table public.menu_entries
  add column if not exists skipped_at date;

-- Interruptor del repaso proactivo, POR HOGAR (no por usuario): usa la tabla de
-- preferencias del menú que ya existe y la misma UI («Ajustes del menú»). El
-- caso "un miembro lo quiere y otro no" lo mitiga el snooze por dispositivo.
-- Default true: el repaso es la razón de ser de la feature; quien no lo quiera
-- lo apaga (y puede hacerlo desde el propio modal de repaso).
alter table public.household_menu_prefs
  add column if not exists checkin_enabled boolean not null default true;

-- Búsqueda de pendientes del repaso: hogar + rango de fechas, solo sin resolver.
-- Índice PARCIAL porque la consulta siempre lleva las dos condiciones y lo
-- resuelto (la mayoría de las filas con el tiempo) no interesa indexarlo.
create index if not exists menu_entries_pending_checkin_idx
  on public.menu_entries (household_id, date)
  where cooked_at is null and skipped_at is null;
