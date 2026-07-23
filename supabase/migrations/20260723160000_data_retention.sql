-- ============================================================================
-- Higiene de datos — retención automática (pg_cron) + backfill + política push
-- ============================================================================
-- Objetivo: que la BD no acumule datos que ya no se leen, con retenciones claras
-- y automáticas dentro de Postgres (cero infraestructura externa; no depende de
-- que nadie visite la app ni consume los cron de Vercel). Justificación completa
-- en PLAN-LIMPIEZA-DATOS.md.
--
-- Retenciones (el valor del dato manda sobre el espacio → márgenes generosos):
--  · inventory_events consumed/restocked: la UI solo muestra 30 días → 90 días.
--  · inventory_events discarded: alimentan el panel de gasto navegable por meses
--    → 24 meses.
--  · receipts sin confirmar (needs_review/processing/failed): escaneos abandonados;
--    sus receipt_items tienen purchased_at/store_chain NULL y ya están excluidos
--    de TODAS las consultas de precios → 30 días. El FK cascade borra las líneas.
--  · weekly_menus: solo se lee la semana visible y la anterior → 26 semanas. El FK
--    de menu_entries es on delete cascade.
--
-- Qué NO se toca: receipt_items de tickets confirmados (son el historial de
-- precios, sin ventana temporal), product_aliases, products, push por antigüedad.
-- ============================================================================

-- ── B1. Extensión + función de limpieza ────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.cleanup_retention()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.inventory_events
  where kind in ('consumed', 'restocked')
    and created_at < now() - interval '90 days';

  delete from public.inventory_events
  where kind = 'discarded'
    and created_at < now() - interval '24 months';

  -- El FK de receipt_items → receipts es on delete cascade: borra las líneas.
  delete from public.receipts
  where status in ('needs_review', 'processing', 'failed')
    and created_at < now() - interval '30 days';

  -- El FK de menu_entries → weekly_menus es on delete cascade.
  delete from public.weekly_menus
  where week_start < (current_date - interval '26 weeks');
$$;

-- security definer + owner postgres → ignora RLS (es mantenimiento global).
-- NO se concede execute a authenticated: solo la ejecuta el cron.
revoke all on function public.cleanup_retention() from public;

-- ── B2. Programación diaria (04:30 UTC) ─────────────────────────────────────
-- cron.schedule con el mismo nombre ACTUALIZA el job si ya existe (idempotente).
select cron.schedule(
  'fill-good-retention',
  '30 4 * * *',
  $$select public.cleanup_retention()$$
);

-- ── B3a. Backfill: vaciar raw_extraction de tickets ya confirmados ──────────
-- A partir de ahora se vacía al confirmar (src/features/receipts/actions.ts); esto
-- limpia el histórico ya existente. Los descuentos ya viven en discount_total.
update public.receipts set raw_extraction = null where status = 'confirmed';

-- ── B3b. Política push: los miembros del hogar pueden borrar suscripciones ──
-- Autolimpieza de endpoints muertos (404/410) en notifyPriceRises: quien confirma
-- el ticket rara vez es el dueño del endpoint muerto, así que "solo las propias"
-- (push_delete_own) casi nunca limpiaba nada. Los miembros ya pueden LEER las
-- suscripciones del hogar (push_select_member); poder borrar una demostradamente
-- muerta es coherente con ese diseño.
drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_household" on public.push_subscriptions
  for delete to authenticated
  using (
    user_id = public.clerk_user_id()
    or public.is_household_member(household_id)
  );
