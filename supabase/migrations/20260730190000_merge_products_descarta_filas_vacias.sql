-- ============================================================================
-- Migración — La fusión de productos descarta filas de inventario vacías (E9)
-- ============================================================================
-- Una fila a cantidad 0 no aporta stock, pero al fusionar viajaba al destino
-- conservando su unidad original y dejaba trampas invisibles: una «sandía (ud)
-- agotada» en nevera colgando del producto fusionado (kg) bloqueaba después
-- cualquier movimiento a esa ubicación con el error de «unifica la unidad»,
-- sin nada visible que unificar (las tarjetas agotadas se ordenan las últimas
-- de una sección que puede estar plegada). Y en el sentido contrario, una fila
-- vacía del DESTINO descartaba stock real del origen al colisionar por
-- ubicación. El historial no se pierde: vive en inventory_events.
--
-- Cambios sobre 20260721160000_merge_products.sql (solo el bloque de
-- inventario; el resto de la función es idéntico):
--   · se borran las filas del ORIGEN a cantidad 0 antes de fusionar;
--   · se borran las filas del DESTINO a cantidad 0 que taparían (por
--     ubicación) una fila del origen con stock.
-- La política de unidades de E9 no cambia: misma unidad suma; unidades
-- distintas con stock en AMBAS conservan la del destino.
-- ============================================================================

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

  -- Historial de precios y sugerencias: repuntar al destino.
  update public.receipt_items set product_id = p_target where product_id = p_source;
  update public.receipt_items set suggested_product_id = p_target
    where suggested_product_id = p_source;

  -- Recetas y lista de la compra: repuntar (sin unique por product_id).
  update public.recipe_ingredients set product_id = p_target where product_id = p_source;
  update public.shopping_list_items set product_id = p_target where product_id = p_source;

  -- Aliases: quitar los del origen que chocarían (unique household_id,
  -- alias_normalized) con otro producto, repuntar el resto, y añadir el nombre
  -- del origen como alias del destino (para que tickets futuros con el nombre
  -- del duplicado matcheen solos).
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

  -- Inventario (unique household_id, product_id, location):
  --   0. las filas VACÍAS no viajan: se borran las del origen a cantidad 0, y
  --      también las del destino a cantidad 0 que taparían una fila del origen
  --      con stock (una fila agotada no debe descartar stock real ni dejar
  --      conflictos de unidad invisibles tras la fusión);
  --   1. donde destino ya tiene fila en esa ubicación con la MISMA unidad, sumar;
  --   2. borrar las filas del origen que colisionan por ubicación (sumadas o de
  --      unidad distinta, que se descartan conservando la del destino, como E3);
  --   3. repuntar al destino las filas del origen sin colisión.
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

  delete from public.inventory_items s
  where s.product_id = p_source
    and exists (
      select 1 from public.inventory_items t
      where t.product_id = p_target
        and t.household_id = s.household_id
        and t.location = s.location
    );

  update public.inventory_items set product_id = p_target where product_id = p_source;

  -- Pines por usuario (pk user_id, product_id): quitar los que colisionarían y
  -- repuntar el resto.
  delete from public.user_pinned_products s
  where s.product_id = p_source
    and exists (
      select 1 from public.user_pinned_products t
      where t.user_id = s.user_id and t.product_id = p_target
    );
  update public.user_pinned_products set product_id = p_target where product_id = p_source;

  -- Sumar la habitualidad al destino; conservar min_quantity/default_* del destino.
  update public.products t
  set purchase_count = t.purchase_count + s.purchase_count,
      last_purchased_at = greatest(t.last_purchased_at, s.last_purchased_at),
      updated_at = now()
  from public.products s
  where t.id = p_target and s.id = p_source;

  -- Borrar el producto origen (ya sin referencias).
  delete from public.products where id = p_source;
end;
$$;

-- create or replace conserva los grants, pero se repiten para que la migración
-- sea autocontenida (toda función definer DEBE revocar public, ver auditoría).
revoke execute on function public.merge_products(uuid, uuid) from public, anon;
grant execute on function public.merge_products(uuid, uuid) to authenticated;
