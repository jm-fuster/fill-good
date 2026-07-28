-- ============================================================================
-- delete_account(): completar la anonimización de la atribución personal
-- ============================================================================
-- La auditoría 2026-07 detectó que delete_account() solo anulaba la atribución
-- en recipes/inventory_events/receipts, pero dejaba el id de Clerk del usuario
-- borrado en otras columnas *_by de contenido que sobrevive al hogar:
--   · shopping_list_items.added_by / checked_by
--   · inventory_items.updated_by
--   · shopping_trips.closed_by
--   · households.created_by  (era NOT NULL → se hace nullable)
-- Contradecía el objetivo declarado de la propia función («no dejar rastro de su
-- id de Clerk») y la promesa de la política §7. (weekly_menus NO aplica: usa
-- generated_by con enum 'manual'|'ai', no un id de usuario.)
--
-- Regla para el futuro: toda columna nueva de atribución personal (*_by,
-- user_id) debe incorporarse a delete_account() en la MISMA migración que la crea.
-- ============================================================================

-- households.created_by debe poder anularse para borrar el id del creador cuando
-- el hogar sobrevive (el usuario transfirió la propiedad antes de borrarse).
alter table public.households alter column created_by drop not null;

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
end;
$$;

-- Solo el usuario autenticado puede borrarse a sí mismo (usa su propio JWT).
revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
