-- ============================================================================
-- Salir del hogar solo por la puerta, y fusionar productos sin perder nada
-- ============================================================================
-- Dos pendientes de la auditoría del 23-sep-2026, más uno que salió al
-- revisar el segundo.
--
-- 1. `members_delete_self` (desde el init) dejaba a cualquier miembro borrar
--    su fila de `household_members` directamente por PostgREST. Con eso:
--    · el propietario podía irse dejando el hogar SIN propietario, que es
--      justo lo que `leave_household` prohíbe (`owner_must_transfer`);
--    · y quien se iba así se saltaba la limpieza que hace `leave_household`:
--      sus suscripciones push y su Echo seguían vivos sobre un hogar al que ya
--      no pertenecía.
--    La app nunca borra miembros así: sale por `leave_household`, expulsa por
--    `remove_household_member` y borra la cuenta por `delete_account`, las
--    tres definer. Se quita la política y el DELETE directo.
--
-- 2. `merge_products` repuntaba precios, inventario, alias, recetas, lista y
--    pines, pero se olvidaba de dos sitios:
--    · `inventory_events` (FK on delete cascade): al borrar el origen se
--      llevaba su historial de movimientos entero;
--    · `shopping_trips.product_ids` (un array, sin FK): las compras cerradas
--      seguían apuntando a un producto que ya no existe, y la «compra
--      perfecta» contaba como extra lo que sí iba en la lista.
--
-- 3. Y fusionar con existencias en la MISMA ubicación pero en unidades
--    distintas (2 kg en el origen, 3 ud en el destino) perdía stock: la suma
--    solo se hace a igual unidad, pero el borrado posterior del origen no
--    miraba la unidad, así que los 2 kg desaparecían. Ahora se rechaza con
--    `unit_conflict` antes de escribir nada, como hace «mover» en la app.
-- ============================================================================

-- ── 1. Sin borrado directo de miembros ─────────────────────────────────────
drop policy if exists "members_delete_self" on public.household_members;
revoke delete on public.household_members from authenticated;

-- ── 2 y 3. merge_products ───────────────────────────────────────────────────
create or replace function public.merge_products(
  p_source uuid,
  p_target uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_target_hh uuid;
  v_source_hh uuid;
  v_source_name text;
  v_source_norm text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_source = p_target then
    raise exception 'same_product';
  end if;

  select household_id into v_target_hh from public.products where id = p_target;
  select household_id, name, normalized_name
    into v_source_hh, v_source_name, v_source_norm
    from public.products where id = p_source;

  if v_target_hh is null or v_source_hh is null then
    raise exception 'product_not_found';
  end if;
  if v_target_hh <> v_source_hh then
    raise exception 'different_household';
  end if;
  if not public.is_household_member(v_target_hh) then
    raise exception 'not_a_member';
  end if;

  -- Antes de tocar nada: dos filas CON stock en la misma ubicación y en
  -- unidades distintas no se pueden sumar, y borrar una perdería género.
  if exists (
    select 1
    from public.inventory_items s
    join public.inventory_items t
      on t.household_id = s.household_id
     and t.location = s.location
    where s.product_id = p_source
      and t.product_id = p_target
      and s.quantity > 0
      and t.quantity > 0
      and s.unit <> t.unit
  ) then
    raise exception 'unit_conflict';
  end if;

  update public.receipt_items set product_id = p_target where product_id = p_source;
  update public.receipt_items set suggested_product_id = p_target
    where suggested_product_id = p_source;

  update public.recipe_ingredients set product_id = p_target where product_id = p_source;
  update public.shopping_list_items set product_id = p_target where product_id = p_source;

  -- Historial de movimientos: se repunta (antes lo borraba el cascade).
  update public.inventory_events set product_id = p_target where product_id = p_source;

  -- Compras cerradas: el origen pasa a ser el destino, sin duplicarlo si la
  -- compra ya llevaba los dos.
  update public.shopping_trips
  set product_ids = array(
    select distinct x
    from unnest(array_replace(product_ids, p_source, p_target)) as x
  )
  where household_id = v_target_hh
    and p_source = any (product_ids);

  delete from public.product_aliases a
  where a.product_id = p_source
    and exists (
      select 1 from public.product_aliases b
      where b.household_id = a.household_id
        and b.alias_normalized = a.alias_normalized
        and b.product_id <> p_source
    );
  update public.product_aliases set product_id = p_target where product_id = p_source;
  insert into public.product_aliases (household_id, product_id, alias, alias_normalized, source)
  values (v_target_hh, p_target, v_source_name, v_source_norm, 'merge')
  on conflict (household_id, alias_normalized) do nothing;

  delete from public.inventory_items
  where product_id = p_source and quantity = 0;

  delete from public.inventory_items t
  where t.product_id = p_target
    and t.quantity = 0
    and exists (
      select 1 from public.inventory_items s
      where s.product_id = p_source
        and s.household_id = t.household_id
        and s.location = t.location
    );

  update public.inventory_items t
  set quantity = t.quantity + s.quantity, updated_at = now()
  from public.inventory_items s
  where s.product_id = p_source
    and t.product_id = p_target
    and t.household_id = s.household_id
    and t.location = s.location
    and t.unit = s.unit;

  -- Tras la guarda de arriba, aquí solo quedan filas del origen cuya suma ya
  -- se ha hecho (misma unidad).
  delete from public.inventory_items s
  where s.product_id = p_source
    and exists (
      select 1 from public.inventory_items t
      where t.product_id = p_target
        and t.household_id = s.household_id
        and t.location = s.location
    );

  update public.inventory_items set product_id = p_target where product_id = p_source;

  delete from public.user_pinned_products s
  where s.product_id = p_source
    and exists (
      select 1 from public.user_pinned_products t
      where t.user_id = s.user_id and t.product_id = p_target
    );
  update public.user_pinned_products set product_id = p_target where product_id = p_source;

  update public.products t
  set purchase_count = t.purchase_count + s.purchase_count,
      last_purchased_at = greatest(t.last_purchased_at, s.last_purchased_at),
      updated_at = now()
  from public.products s
  where t.id = p_target and s.id = p_source;

  delete from public.products where id = p_source;
end;
$$;

revoke execute on function public.merge_products(uuid, uuid) from public, anon;
grant execute on function public.merge_products(uuid, uuid) to authenticated;
