-- ============================================================================
-- Evento de uso: «¿Compartes la compra con alguien?»
-- ============================================================================
-- La pregunta con la que termina ahora el alta de un hogar (`/bienvenida`).
-- La foto de uso del 28-sep dice que los dos únicos hogares que siguen vivos
-- son los dos que invitaron a alguien, y los cuatro que se fueron estaban solos;
-- pero no sabemos cuánta gente usa la app sola A PROPÓSITO, que es lo que
-- decide si la invitación es la palanca de todos o solo de una parte. Por eso
-- se anota la respuesta: 'yes', 'solo' o 'skip' («Ahora no»), y nada más —ni
-- con quién, ni cuántos—.
--
-- Un evento nuevo son tres sitios (AGENTS.md): este CHECK, el tipo
-- `UsageEvent` de `src/lib/usage.ts` (y el zod de `features/usage/actions.ts`,
-- porque el «sí» lo manda el navegador) y la línea de /privacidad §2.
-- ============================================================================

alter table public.usage_events
  drop constraint usage_events_name_check,
  add constraint usage_events_name_check check (name in (
    'pantry_review_opened',
    'pantry_review_answered',
    'pantry_review_to_list',
    'pantry_review_postponed',
    'pantry_review_disabled',
    'pantry_review_enabled',
    'invite_shared',
    'onboarding_shares'
  ));
