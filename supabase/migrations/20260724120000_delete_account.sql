-- ============================================================================
-- Borrado de cuenta — RPC delete_account() (RGPD «derecho al olvido»)
-- ============================================================================
-- Borra al usuario actual (claim `sub` del JWT de Clerk) de la BD y todos sus
-- datos personales. NO borra la cuenta de acceso en Clerk: eso lo hace la Server
-- Action con la Backend API después de que este RPC termine sin error.
--
-- Reglas de propiedad (coherentes con leave_household):
--  · Si es propietario de algún hogar con OTROS miembros → 'owner_must_transfer':
--    debe transferir la propiedad antes (no dejamos hogares huérfanos).
--  · Hogares donde es propietario y único miembro → se borran (el cascade limpia
--    inventario, listas, tickets, recetas, menús y suscripciones del hogar).
--  · Hogares donde es miembro → sale (se elimina su fila de household_members).
--
-- Datos personales que se borran: pertenencias a hogar, pines, valoraciones de
-- recetas y suscripciones push. Además se anula su atribución personal en el
-- contenido compartido que sobrevive (recipes/inventory_events/receipts), para
-- no dejar rastro de su id de Clerk una vez la cuenta desaparece.
-- ============================================================================

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

  -- 4. Abandonar cualquier hogar restante (miembro no propietario).
  delete from public.household_members where user_id = v_uid;

  -- 5. Datos estrictamente personales.
  delete from public.user_pinned_products where user_id = v_uid;
  delete from public.recipe_ratings where user_id = v_uid;
  delete from public.push_subscriptions where user_id = v_uid;
end;
$$;

-- Solo el usuario autenticado puede borrarse a sí mismo (usa su propio JWT).
revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
