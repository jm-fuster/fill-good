-- ============================================================================
-- Cerrar la regla del proyecto: ninguna función invocable por public/anon
-- ============================================================================
-- La auditoría 2026-07 fijó que toda función SECURITY DEFINER debe revocar
-- EXECUTE de public/anon. Quedaban dos funciones sin revocar (impacto práctico
-- nulo, pero incumplen la regla y son el mismo patrón que ya causó una brecha):
--
--  · public.is_household_member(uuid): SECURITY DEFINER de la migración init,
--    nunca revocada (a diferencia de is_household_owner). Solo informa sobre la
--    membresía del PROPIO llamante (con anon devuelve false), pero no debe estar
--    expuesta a anon. El grant a authenticated es imprescindible: todas las
--    políticas RLS la invocan bajo ese rol.
--  · public.generate_invite_code(): no es definer (corre como el llamante, sin
--    elevación posible), pero se expone por RPC sin necesidad — solo la usan RPC
--    definer internamente.
--
-- NOTA: clerk_user_id() se deja como está a propósito: se evalúa dentro de las
-- políticas RLS de todas las tablas y tocar sus grants es más arriesgado que el
-- beneficio (tampoco es definer, así que no hay elevación).
-- ============================================================================

revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

revoke execute on function public.generate_invite_code() from public, anon;
