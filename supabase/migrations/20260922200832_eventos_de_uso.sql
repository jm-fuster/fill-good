-- ============================================================================
-- Medición de uso: visitas, embudo del repaso de despensa e invitaciones
-- ============================================================================
-- La foto de uso del 22-sep-2026, sacada de lo que YA guarda la base, respondió
-- casi todo lo que se preguntaba sobre retención —quién escanea, quién invita,
-- quién cocina—, porque eso queda escrito en sus propias tablas. Dejó tres
-- huecos, y esta migración es solo para ellos:
--
--   1. Quién VUELVE. La base solo ve escrituras: quien abre la app para mirar
--      la lista y la cierra no deja rastro, así que «lleva 36 días sin escribir»
--      no distingue «ya no entra» de «entra y no toca nada».
--   2. Si el repaso de despensa se usa. Solo se guarda cuándo se contestó por
--      última vez, no cuántas veces se abrió, se aplazó o se dejó a medias.
--   3. Si la invitación falla al compartir o al aceptar. Las aceptadas están en
--      `household_members`; los intentos de compartir no están en ninguna parte.
--
-- Lo que NO se registra aquí, a propósito: tickets, menús, platos cocinados,
-- compras cerradas, miembros y suscripciones push. Ya tienen tabla con fecha, y
-- copiarlos a un registro aparte sería una segunda verdad que tarde o temprano
-- no cuadra con la primera. `npm run informe:uso` los lee de su sitio.
--
-- El diseño es el de `ai_usage`: tablas con RLS y SIN políticas —nadie las lee
-- ni las escribe con su propio token— y funciones SECURITY DEFINER que
-- comprueban la membresía antes de escribir. Solo se leen con la clave de
-- servicio, desde el informe. Nada de esto usa cookies ni almacenamiento en el
-- dispositivo: se anota en el servidor, al usar la app (ver /privacidad §2, §3,
-- §7 y §10).
-- ============================================================================

-- ── 1. Visitas: una fila por persona, hogar y día ───────────────────────────
-- La clave primaria ES la deduplicación: abrir la app diez veces el mismo día
-- deja una sola fila. Por eso el cliente puede avisar en cada arranque sin
-- llevar la cuenta en el dispositivo, que exigiría almacenamiento local y, con
-- él, pedir consentimiento.
create table public.usage_days (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id text not null,
  day date not null,
  primary key (household_id, user_id, day)
);

alter table public.usage_days enable row level security;

-- ── 2. Eventos: pasos concretos de dos funciones ────────────────────────────
-- La lista cerrada de nombres va en un CHECK y no solo en el tipo de
-- TypeScript: la función se puede llamar por PostgREST con cualquier texto, y
-- un nombre mal escrito crearía una serie que nadie cuenta. Un evento nuevo es
-- una línea aquí (en una migración), su tipo en `src/lib/usage.ts` y, si cambia
-- lo que se mide, el párrafo de /privacidad.
create table public.usage_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id text not null,
  name text not null check (name in (
    'pantry_review_opened',
    'pantry_review_answered',
    'pantry_review_to_list',
    'pantry_review_postponed',
    'pantry_review_disabled',
    'pantry_review_enabled',
    'invite_shared'
  )),
  -- Recuentos y respuestas cortas (`{"answer": "low"}`), nunca contenido: ni
  -- nombres de producto ni texto que haya escrito nadie. El tope de tamaño lo
  -- hace valer aunque alguien llame a la función a mano.
  props jsonb not null default '{}'::jsonb
    check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 512),
  created_at timestamptz not null default now()
);

create index usage_events_household_idx
  on public.usage_events (household_id, created_at);
-- Para el tope por hora de `record_usage_event`.
create index usage_events_user_idx
  on public.usage_events (user_id, created_at);

alter table public.usage_events enable row level security;

-- ── 3. Oposición (art. 21 RGPD) ─────────────────────────────────────────────
-- La base legal es el interés legítimo, así que quien se oponga tiene que poder
-- dejar de ser medido. Se pide por email —decisión de producto del 22-sep: sin
-- interruptor en Ajustes—, y cumplirlo es una fila aquí más borrar lo anotado:
--
--   insert into public.usage_opt_outs (user_id) values ('user_…');
--   delete from public.usage_events where user_id = 'user_…';
--   delete from public.usage_days where user_id = 'user_…';
--
-- Sin esta tabla, «dejaremos de anotarlo» sería una promesa que solo se podría
-- cumplir cambiando código.
create table public.usage_opt_outs (
  user_id text primary key,
  created_at timestamptz not null default now()
);

alter table public.usage_opt_outs enable row level security;

-- ── 4. Escritura ────────────────────────────────────────────────────────────
-- Las dos funciones CALLAN en vez de lanzar cuando no toca anotar (sin sesión,
-- hogar ajeno, persona que se ha opuesto, tope superado): las llama un registro
-- de uso que nunca debe romper la acción que lo dispara, y un error ahí no le
-- sirve a nadie. Lo que sí lanza es lo que está mal de verdad —un nombre fuera
-- de la lista, unas props que no caben—, porque eso es un fallo de código y así
-- aparece en los logs.

create function public.record_usage_day(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
begin
  if v_uid is null or not public.is_household_member(p_household_id) then
    return;
  end if;
  if exists (select 1 from public.usage_opt_outs where user_id = v_uid) then
    return;
  end if;

  -- El día es el del calendario ESPAÑOL, igual que `APP_TIME_ZONE` en
  -- `src/lib/dates.ts`: la base corre en UTC, y entre las 00:00 y las 02:00 de
  -- Madrid `current_date` todavía diría ayer.
  insert into public.usage_days (household_id, user_id, day)
  values (p_household_id, v_uid, (now() at time zone 'Europe/Madrid')::date)
  on conflict do nothing;
end;
$$;

revoke execute on function public.record_usage_day(uuid) from public, anon;
grant execute on function public.record_usage_day(uuid) to authenticated;

create function public.record_usage_event(
  p_household_id uuid,
  p_name text,
  p_props jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
begin
  if v_uid is null or not public.is_household_member(p_household_id) then
    return;
  end if;
  if exists (select 1 from public.usage_opt_outs where user_id = v_uid) then
    return;
  end if;

  -- Tope por persona y hora. Un uso normal se queda en unas decenas (un repaso
  -- completo son diez apuntes); existe porque la función se puede llamar a mano,
  -- y sin él cualquier cuenta podría llenar la tabla.
  if (
    select count(*)
    from public.usage_events
    where user_id = v_uid
      and created_at > now() - interval '1 hour'
  ) >= 300 then
    return;
  end if;

  insert into public.usage_events (household_id, user_id, name, props)
  values (p_household_id, v_uid, p_name, coalesce(p_props, '{}'::jsonb));
end;
$$;

revoke execute on function public.record_usage_event(uuid, text, jsonb) from public, anon;
grant execute on function public.record_usage_event(uuid, text, jsonb) to authenticated;

-- ── 5. Retención: 12 meses ──────────────────────────────────────────────────
-- Un año basta para ver cómo evoluciona un hogar desde que entra; guardar más
-- sería guardar por guardar. `usage_opt_outs` NO se purga: es la constancia de
-- una oposición, y borrarla volvería a medir a quien pidió que no.
-- El resto del cuerpo es idéntico a 20260729160000_alexa_multiusuario.
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

  delete from public.usage_events
  where created_at < now() - interval '12 months';

  delete from public.usage_days
  where day < (current_date - interval '12 months');
$$;

-- ── 6. delete_account(): lo anotado es de la persona ────────────────────────
-- Regla de 20260728150000: toda columna nueva con un id de Clerk entra en
-- delete_account() en la MISMA migración que la crea. Aquí se BORRA en vez de
-- anular la atribución: una visita o un evento sin autor no le dicen nada al
-- hogar. También la oposición: con la cuenta desaparece la persona a la que
-- había que dejar de medir.
-- El resto del cuerpo es idéntico a 20260729120000_alexa_links.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- 1. Propietario de un hogar con más miembros → exige transferir primero.
  if exists (
    select 1
    from public.household_members owner_row
    where owner_row.user_id = v_uid
      and owner_row.role = 'owner'
      and exists (
        select 1
        from public.household_members other
        where other.household_id = owner_row.household_id
          and other.user_id <> v_uid
      )
  ) then
    raise exception 'owner_must_transfer';
  end if;

  -- 2. Hogares donde es propietario y único miembro → borrar (cascade limpia todo).
  delete from public.households h
  where exists (
    select 1 from public.household_members o
    where o.household_id = h.id and o.user_id = v_uid and o.role = 'owner'
  )
  and not exists (
    select 1 from public.household_members m
    where m.household_id = h.id and m.user_id <> v_uid
  );

  -- 3. Anular la atribución personal en el contenido que sobrevive (hogares que
  --    abandona como miembro). Columnas nullable; el contenido es del hogar.
  update public.recipes set created_by = null where created_by = v_uid;
  update public.inventory_events set created_by = null where created_by = v_uid;
  update public.receipts set uploaded_by = null where uploaded_by = v_uid;
  update public.shopping_list_items set added_by = null where added_by = v_uid;
  update public.shopping_list_items set checked_by = null where checked_by = v_uid;
  update public.inventory_items set updated_by = null where updated_by = v_uid;
  update public.shopping_trips set closed_by = null where closed_by = v_uid;
  update public.households set created_by = null where created_by = v_uid;

  -- 4. Abandonar cualquier hogar restante (miembro no propietario).
  delete from public.household_members where user_id = v_uid;

  -- 5. Datos estrictamente personales.
  delete from public.user_pinned_products where user_id = v_uid;
  delete from public.recipe_ratings where user_id = v_uid;
  delete from public.push_subscriptions where user_id = v_uid;
  delete from public.alexa_links where user_id = v_uid;
  delete from public.alexa_link_codes where user_id = v_uid;
  delete from public.usage_events where user_id = v_uid;
  delete from public.usage_days where user_id = v_uid;
  delete from public.usage_opt_outs where user_id = v_uid;
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
