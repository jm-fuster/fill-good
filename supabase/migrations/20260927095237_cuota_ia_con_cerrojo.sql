-- ============================================================================
-- La cuota de IA, atómica de verdad: un cerrojo por cubo
-- ============================================================================
-- `record_ai_usage` (última versión en 20260812130000) cuenta los apuntes de la
-- última hora y, si hay sitio, inserta uno. Son DOS sentencias: el `select
-- count(*)` y el `insert`. La migración 20260812120000 decía que comprobar e
-- insertar iban «en la misma sentencia» y que eso impedía que dos peticiones a
-- la vez se colaran; no era así. En READ COMMITTED cada sentencia ve lo que
-- estaba confirmado al empezar, y ninguna de las dos bloquea nada, así que N
-- llamadas simultáneas leen todas el mismo recuento, todas caben y todas
-- insertan. Con un script de cien peticiones en paralelo a la Server Action del
-- ticket, una sola cuenta pasaba de largo los 20/h y los 40/h del hogar, y la
-- cuota gratuita de Gemini —una para todo el despliegue— se agotaba para todos
-- los hogares. Salió en el repaso previo a hacer público el repo (27-sep-2026);
-- publicar el código no lo abre (las acciones se ven en el JS del cliente),
-- pero sí lo abarata.
--
-- El arreglo es serializar por CUBO con `pg_advisory_xact_lock`: la segunda
-- llamada del mismo usuario y tipo espera a que la primera confirme, y su
-- `count(*)`, que en READ COMMITTED toma una instantánea nueva, ya ve el apunte
-- de la otra. El cerrojo se suelta solo al acabar la transacción de la RPC, y
-- la espera es de milisegundos: lo que dura contar e insertar, no la llamada a
-- la IA, que va después y fuera de la base.
--
-- Dos cerrojos, siempre en el mismo orden —primero el del usuario, luego el del
-- hogar—, porque dos convivientes que llaman a la vez comparten el del hogar:
-- con el orden fijo, ninguno puede quedarse esperando al otro en círculo. Una
-- colisión de `hashtextextended` entre dos claves distintas solo haría esperar
-- a quien no hacía falta; nunca deja pasar a nadie.
--
-- La cabecera y los topes no cambian (20/15/10 por usuario, el doble por hogar);
-- el cuerpo es el de 20260812130000 con los dos `perform` añadidos.
-- `refund_ai_usage` no necesita cerrojo: solo borra, y un recuento que baja
-- nunca deja pasar de más.
-- ============================================================================

create or replace function public.record_ai_usage(
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

  -- Cerrojo del cubo individual, ANTES de contar (ver la cabecera).
  perform pg_advisory_xact_lock(
    hashtextextended('ai_usage:user:' || v_uid || ':' || p_kind, 0)
  );

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

    -- Segundo cerrojo, siempre detrás del individual (ver la cabecera).
    perform pg_advisory_xact_lock(
      hashtextextended(
        'ai_usage:household:' || p_household_id::text || ':' || p_kind, 0
      )
    );

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
