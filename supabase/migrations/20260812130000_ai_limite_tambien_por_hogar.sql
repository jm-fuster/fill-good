-- ============================================================================
-- El límite de IA gana un segundo cubo: por HOGAR
-- ============================================================================
-- El contador de 20260728130000 es por usuario, pero la cuota gratuita de
-- Gemini es por PROYECTO: una sola para todo el despliegue. Con el límite solo
-- individual, cuatro convivientes de un mismo hogar pueden agotarla entre todos
-- sin que ninguno llegue a ver «has hecho muchas» —cada uno se queda muy por
-- debajo de su tope— y el resultado es que el escaneo y los menús dejan de
-- funcionar para TODOS los hogares. Es el DoS funcional que la migración
-- original decía prevenir, por la puerta que no cerraba: no hace falta abusar,
-- basta con ser varios y usar la app a la vez.
--
-- Los dos cubos son complementarios y se comprueban los dos: el individual
-- sigue protegiendo de una cuenta desbocada, y el de hogar pone el techo real
-- de lo que un domicilio puede consumir en una hora.
--
-- Los topes por hogar son el DOBLE del individual, y eso los coloca donde deben
-- estar: una persona sola nunca los alcanza (su propio límite salta antes), así
-- que el cubo de hogar no puede castigar a quien está usando la app con
-- normalidad; y a la vez ningún domicilio pasa de ahí por muchos móviles que
-- tenga. Nadie escanea 40 tickets ni planifica 30 semanas en una hora.
--
-- Lo que esto NO cubre: un tope GLOBAL del despliegue. Con muchos hogares
-- activos, la suma sigue pudiendo agotar el free tier. Cerrar eso pide decidir
-- qué pasa cuando el proyecto entero se queda sin cuota, que es otra
-- conversación (y hoy se manifiesta como el 429 que `classifyAiError` ya
-- distingue y avisa como «servicio saturado»).
-- ============================================================================

-- ── El apunte pasa a saber de qué hogar salió ───────────────────────────────
-- Nullable a propósito: los apuntes que ya existen no tienen hogar y no se
-- inventa uno. Cuentan para el cubo individual, como hasta ahora, y desaparecen
-- solos en dos días (purga de `cleanup_retention`).
alter table public.ai_usage
  add column if not exists household_id uuid references public.households(id) on delete cascade;

create index if not exists ai_usage_household_kind_idx
  on public.ai_usage (household_id, kind, created_at);

-- ── Registro con los dos cubos ──────────────────────────────────────────────
-- `drop` + `create` y no `create or replace`: añadir un parámetro no es
-- reemplazar una función, es declarar otra, y dejar las dos vivas haría ambigua
-- cualquier llamada con un solo argumento.
--
-- El nuevo parámetro va con DEFAULT null para que la ventana entre esta
-- migración y el despliegue del código no rompa nada: PostgREST llama por
-- NOMBRE, así que una petición del código anterior (`{p_kind}`) sigue
-- resolviendo aquí y se comporta como antes —solo cubo individual—.
drop function if exists public.record_ai_usage(text);

create function public.record_ai_usage(
  p_kind text,
  p_household_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_recent int;
  v_limit int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_limit := case p_kind
    when 'receipt' then 20
    when 'menu' then 15
    else 10
  end;

  select count(*) into v_recent
  from public.ai_usage
  where user_id = v_uid
    and kind = p_kind
    and created_at > now() - interval '1 hour';

  if v_recent >= v_limit then
    raise exception 'rate_limited';
  end if;

  -- Cubo del hogar. Se salta si no se sabe de qué hogar viene (código anterior
  -- al despliegue): sin hogar no hay cubo que aplicar, y quedarse en el
  -- comportamiento de antes es preferible a rechazar la petición.
  if p_household_id is not null then
    -- El hogar tiene que ser suyo: `p_household_id` llega del cliente de la
    -- app, y esta función corre como owner (salta RLS), así que sin esta
    -- comprobación cualquiera podría gastar el cubo de un hogar ajeno.
    if not public.is_household_member(p_household_id) then
      raise exception 'not_authenticated';
    end if;

    select count(*) into v_recent
    from public.ai_usage
    where household_id = p_household_id
      and kind = p_kind
      and created_at > now() - interval '1 hour';

    if v_recent >= v_limit * 2 then
      raise exception 'rate_limited_household';
    end if;
  end if;

  insert into public.ai_usage (user_id, kind, household_id)
  values (v_uid, p_kind, p_household_id);
end;
$$;

revoke execute on function public.record_ai_usage(text, uuid) from public, anon;
grant execute on function public.record_ai_usage(text, uuid) to authenticated;

-- ── La devolución, acotada también al hogar ─────────────────────────────────
-- Sin el filtro, a un usuario con dos hogares un fallo en uno podía descontarle
-- el apunte del otro: el número total quedaba bien y el cubo de cada hogar mal.
drop function if exists public.refund_ai_usage(text);

create function public.refund_ai_usage(
  p_kind text,
  p_household_id uuid default null
)
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

  delete from public.ai_usage
  where id = (
    select id
    from public.ai_usage
    where user_id = v_uid
      and kind = p_kind
      and created_at > now() - interval '1 hour'
      and (p_household_id is null or household_id = p_household_id)
    order by created_at desc
    limit 1
  );
end;
$$;

revoke execute on function public.refund_ai_usage(text, uuid) from public, anon;
grant execute on function public.refund_ai_usage(text, uuid) to authenticated;
