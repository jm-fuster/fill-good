-- ============================================================================
-- Alexa abierta a terceros: idempotencia del webhook + vinculación en vivo
-- ============================================================================
-- La skill deja de ser solo doméstica (beta con testers / tienda de skills), y
-- dos cosas que con un único Echo de casa se perdonan pasan a ser inaceptables:
--
-- 1. REINTENTOS DE AMAZON (corrupción de datos). Si el endpoint tarda más de ~8 s
--    (cold start), Amazon reenvía la MISMA petición, con el mismo `requestId`, y
--    el descuento se aplicaba dos veces: «resta dos yogures» dejaba el inventario
--    con cuatro menos y nadie sabía por qué. Ahora toda petición que ESCRIBE se
--    reclama por `requestId` antes de tocar nada; el reintento devuelve la
--    respuesta ya calculada en vez de repetir la escritura.
--
--    Se guarda la RESPUESTA, no solo el id: el reintento es lo que el usuario
--    acaba oyendo (el primer envío se lo comió el timeout), así que contestarlo
--    en silencio o con un error sería peor que el duplicado que venimos a evitar.
--
-- 2. VINCULAR A CIEGAS (abandono). Quien estrena la skill dicta el código y se
--    queda mirando la pantalla sin saber si ha funcionado. Con `alexa_links` en
--    la publicación de Realtime, la card de /perfil pasa sola a «vinculado» en el
--    instante del canje. La RLS sigue aplicando a la suscripción: cada quien solo
--    recibe los vínculos de los hogares de los que es miembro.
-- ============================================================================

-- ── 1. Peticiones ya atendidas (anti duplicado) ─────────────────────────────
-- Solo la toca el webhook con service-role → RLS activada SIN políticas ni
-- grants, igual que alexa_link_attempts (20260729120000) y ai_usage
-- (20260728130000). Ningún cliente tiene privilegio sobre ella.
create table public.alexa_requests (
  -- El requestId de Amazon ES la clave: «reclamar» la petición es insertar aquí,
  -- y la clave primaria es el cerrojo que impide que dos copias pasen a la vez.
  request_id text primary key,
  -- Respuesta de voz ya calculada (el envelope entero que devolvimos). Queda en
  -- null mientras la primera copia sigue en vuelo: un reintento que caiga en ese
  -- hueco se contesta «voy con retraso» en vez de duplicar la escritura.
  response jsonb,
  created_at timestamptz not null default now()
);

alter table public.alexa_requests enable row level security;

-- ── 2. Purga diaria dentro de la retención existente ────────────────────────
-- Los reintentos de Amazon llegan en segundos, así que un día de historia sobra.
-- El resto del cuerpo es idéntico a 20260729120000_alexa_links.
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

  delete from public.receipts
  where status in ('needs_review', 'processing', 'failed')
    and created_at < now() - interval '30 days';

  delete from public.weekly_menus
  where week_start < (current_date - interval '26 weeks');

  delete from public.join_attempts
  where attempted_at < now() - interval '1 day';

  delete from public.ai_usage
  where created_at < now() - interval '2 days';

  delete from public.alexa_link_codes
  where expires_at < now() - interval '1 day';

  delete from public.alexa_link_attempts
  where attempted_at < now() - interval '1 day';

  delete from public.alexa_requests
  where created_at < now() - interval '1 day';
$$;

-- ── 3. Realtime: el canje del código se ve en /perfil sin recargar ──────────
-- Solo hace falta el INSERT (el momento «vinculado»): las revocaciones salen de
-- la propia app, que ya revalida /perfil por su cuenta.
alter publication supabase_realtime add table public.alexa_links;
