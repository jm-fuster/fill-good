-- ============================================================================
-- F5 — Historial de movimientos de stock: consumido / tirado / REPUESTO
-- ============================================================================
-- M8 solo registraba bajas (consumed/discarded) al borrar. F5 amplía el registro
-- a las ALTAS por compra y a los ajustes del stepper, para un historial completo.
--
-- 1) Nuevo valor de enum 'restocked' (alta de stock). Postgres no permite USAR el
--    valor nuevo en la misma transacción que lo crea; esta migración NO lo usa
--    (sin backfills), así que es seguro añadirlo aquí.
-- 2) El folding anti-ruido del stepper (acumular ajustes recientes en un evento
--    en vez de una fila por pulsación) necesita poder ACTUALIZAR eventos: se
--    añade la política y el grant de UPDATE, que M8 no tenía.
-- ============================================================================

alter type public.inventory_event_kind add value if not exists 'restocked';

create policy "inv_events_update_member" on public.inventory_events
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant update on public.inventory_events to authenticated;
