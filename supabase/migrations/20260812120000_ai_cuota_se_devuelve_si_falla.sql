-- ============================================================================
-- La cuota de IA se devuelve cuando la llamada no llega a dar nada
-- ============================================================================
-- `record_ai_usage` (20260728130000) cuenta el uso ANTES de llamar a Gemini,
-- que es lo correcto para que el límite sea atómico: comprobar e insertar en la
-- misma sentencia es lo que impide que dos peticiones a la vez se cuelen. El
-- problema es lo que pasaba después, porque ese apunte no se deshacía nunca.
--
-- Con el free tier saturado (429) la app dice, con razón, «el servicio de IA
-- está saturado, espera un minuto y vuelve a intentarlo». El usuario obedece.
-- A la vigésima vez el mensaje cambia a «has escaneado muchos tickets seguidos»
-- —o sea, se le acusa de abusar— por veinte intentos de los que NINGUNO llegó a
-- leer un ticket. Lo mismo con un timeout, o con una API key mal configurada:
-- fallos del servicio que gastaban el cupo del usuario.
--
-- En vez de partir la RPC en «comprobar» + «registrar» (que abriría la carrera
-- que la versión atómica evita), se mantiene el apunte por delante y se DEVUELVE
-- cuando la llamada fracasa. El contador es un conteo, no un registro de
-- identidades: para que el número quede bien basta con borrar un apunte
-- reciente del mismo usuario y tipo, no exactamente la fila que se insertó.
-- ============================================================================

create or replace function public.refund_ai_usage(p_kind text)
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

  -- El apunte más reciente del usuario para ese tipo, y solo si es de la
  -- ventana viva: fuera de ella ya no cuenta para el límite, así que borrarlo
  -- no devolvería nada y sí borraría historia que la purga diaria gestiona.
  delete from public.ai_usage
  where id = (
    select id
    from public.ai_usage
    where user_id = v_uid
      and kind = p_kind
      and created_at > now() - interval '1 hour'
    order by created_at desc
    limit 1
  );
end;
$$;

-- Misma regla que el resto de funciones SECURITY DEFINER del proyecto: nunca
-- public/anon (auditoría de seguridad jul-2026).
revoke execute on function public.refund_ai_usage(text) from public, anon;
grant execute on function public.refund_ai_usage(text) to authenticated;
