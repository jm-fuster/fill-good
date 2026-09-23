-- ============================================================================
-- Seguridad: códigos de Alexa generados por la base y cuota de IA sin atajos
-- ============================================================================
-- Dos agujeros de la auditoría del 23-sep-2026, los dos por la misma razón:
-- una escritura que el servidor hacía «bien» estaba abierta también a
-- cualquier sesión por PostgREST, con valores que nadie comprobaba.
--
-- 1. Códigos de vinculación de Alexa. El cliente los insertaba directamente,
--    con el código y `expires_at` que quisiera. Como el código es la clave
--    primaria GLOBAL, un alta masiva con `on conflict do nothing` delataba qué
--    códigos de OTROS hogares estaban vivos (los que no entraban), y con uno de
--    ellos se vincula tu Echo al hogar ajeno durante su ventana de 10 minutos.
--    Y con `expires_at` en 2099 se podían acaparar los 900.000 códigos para
--    siempre. Ahora el código lo genera `create_alexa_link_code` (definer), con
--    la caducidad fija, y el cliente ya no tiene INSERT. Sigue pudiendo ver y
--    borrar los suyos.
--
-- 2. Cuota de IA. Dos formas de saltársela:
--    · `ai_usage.household_id … on delete cascade`: borrar un hogar borraba
--      también los apuntes PERSONALES de quien lo usó, así que crear un hogar,
--      gastar, borrarlo y repetir dejaba el límite individual a cero. Pasa a
--      `on delete set null`: el apunte sigue contando para su usuario.
--    · `refund_ai_usage` era ejecutable por `authenticated`: llamarla después
--      de cada generación que SÍ salió devolvía la cuota sin límite. Ahora solo
--      la ejecuta `service_role` y recibe el usuario explícito; la llama el
--      servidor (`refundAiUsage`) con la clave de servicio y el usuario de su
--      sesión de Clerk, únicamente en los fallos del modelo.
-- ============================================================================

-- ── 1. Códigos de Alexa ─────────────────────────────────────────────────────
create or replace function public.create_alexa_link_code(p_household_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_code text;
  v_expires timestamptz := now() + interval '10 minutes';
  v_attempt int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_household_member(p_household_id) then
    raise exception 'not_authenticated';
  end if;

  -- Un código vivo por persona: generar otro revoca el anterior.
  delete from public.alexa_link_codes c where c.user_id = v_uid;

  for v_attempt in 1..10 loop
    -- gen_random_uuid() sale de una fuente criptográfica; random() no.
    v_code := (100000 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint % 900000))::text;
    begin
      insert into public.alexa_link_codes (code, household_id, user_id, expires_at)
      values (v_code, p_household_id, v_uid, v_expires);
      return query select v_code, v_expires;
      return;
    exception when unique_violation then
      -- Otro hogar tiene ese código vivo: se prueba otro. El que llama no
      -- llega a saber cuál estaba ocupado.
      null;
    end;
  end loop;
  raise exception 'no_code_available';
end;
$$;

revoke execute on function public.create_alexa_link_code(uuid) from public, anon;
grant execute on function public.create_alexa_link_code(uuid) to authenticated;

drop policy if exists "alexa_link_codes_insert_own" on public.alexa_link_codes;
revoke insert on public.alexa_link_codes from authenticated;

-- Los códigos ya acaparados con una caducidad lejana se recortan a la normal.
update public.alexa_link_codes
set expires_at = created_at + interval '10 minutes'
where expires_at > created_at + interval '10 minutes';

-- ── 2. Cuota de IA ──────────────────────────────────────────────────────────
alter table public.ai_usage
  drop constraint if exists ai_usage_household_id_fkey;
alter table public.ai_usage
  add constraint ai_usage_household_id_fkey
  foreign key (household_id) references public.households (id) on delete set null;

drop function if exists public.refund_ai_usage(text, uuid);

create function public.refund_ai_usage(
  p_user_id text,
  p_kind text,
  p_household_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.ai_usage
  where id = (
    select id
    from public.ai_usage
    where user_id = p_user_id
      and kind = p_kind
      and created_at > now() - interval '1 hour'
      and (p_household_id is null or household_id = p_household_id)
    order by created_at desc
    limit 1
  );
end;
$$;

revoke execute on function public.refund_ai_usage(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.refund_ai_usage(text, text, uuid) to service_role;
