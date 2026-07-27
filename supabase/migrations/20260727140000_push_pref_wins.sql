-- ============================================================================
-- Migración — Preferencia de push para el resumen del mes (G4)
-- ============================================================================
-- El resumen mensual (G4) se envía el día 1 a los suscriptores que lo quieran.
-- Como el resto de preferencias de `push_subscriptions`, es POR DISPOSITIVO
-- (cada endpoint tiene las suyas), no por usuario.
--
-- Default true: quien ya tiene notificaciones activadas recibirá el resumen sin
-- tener que descubrir un toggle nuevo. Es defendible porque este aviso llega UNA
-- vez al mes y solo trae buenas noticias; para cualquier cosa más frecuente el
-- default correcto sería false.
--
-- Sin cambios de RLS: push_subscriptions ya está restringida por hogar.
-- ============================================================================

alter table public.push_subscriptions
  add column pref_wins boolean not null default true;

comment on column public.push_subscriptions.pref_wins is
  'Recibir el resumen mensual del hogar (G4), enviado el día 1. Por dispositivo.';
