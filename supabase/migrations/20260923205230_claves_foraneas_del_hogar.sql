-- ============================================================================
-- Las referencias entre objetos del hogar, atadas a su hogar
-- ============================================================================
-- Hasta aquí una fila apuntaba a su producto, receta, lista, menú, ticket o
-- categoría solo por el id (`product_id` → products.id), así que nada impedía
-- a un miembro crear en su hogar una fila que apuntara a un objeto de OTRO
-- hogar si conocía su UUID (un ex-miembro los conoce). La RLS no lo ve:
-- comprueba el hogar de la fila, no el de lo que referencia. Con la sesión del
-- usuario eso no enseñaba nada, porque la RLS también filtra lo referenciado,
-- pero el código que corre con la clave de servicio no tiene esa red, y así fue
-- como el webhook de Alexa fundía un alta con una fila de otro hogar (arreglado
-- en el código en la #53). Esto lo cierra en la propia base: las 18 claves
-- foráneas entre objetos del hogar pasan a ser compuestas,
-- (household_id, product_id) → products (household_id, id), y una referencia a
-- otro hogar ya no se puede escribir.
--
-- Cada tabla referenciada necesita un `unique (household_id, id)` al que
-- apuntar; es redundante con la clave primaria, pero Postgres lo exige. Las
-- acciones al borrar son las de antes. En las `set null` se nombra la columna
-- (`set null (product_id)`), porque si no Postgres intentaría vaciar también
-- household_id, que es obligatorio; esa forma existe desde Postgres 15
-- (producción está en 17). El SQL de abajo se generó del catálogo, con los
-- nombres y las acciones de las claves que sustituye.
--
-- Cada clave se valida al añadirla, contra los datos que ya hay: si quedara
-- una referencia cruzada, la migración fallaría en vez de dejarla dentro sin
-- que nadie se entere. Antes de escribirla se comprobó en producción, en solo
-- lectura y bajando solo ids, y había UNA; la repara el paso 1.
-- ============================================================================

-- ── 1. Reparar lo que ya apunta a otro hogar ────────────────────────────────
-- La que había no la creó nadie a propósito: una línea de la lista, añadida el
-- 26 de julio por alguien que es miembro de los dos hogares, que apuntaba a un
-- producto del otro. Es la «fila híbrida» que después cerraron en el código el
-- alta múltiple, el deshacer y el alta por producto (hoy los tres comprueban
-- que el producto sea del hogar activo), pero la fila siguió ahí. Se le quita
-- el producto, que es lo mismo que le pasaría si ese producto se borrara
-- (`set null`): la línea se queda en la lista con su nombre.
--
-- Se hace en las siete claves `set null`, no solo en la que tenía el caso. En
-- las `cascade` no había ninguna, y no se reparan: si apareciera alguna antes
-- de aplicar esto, la validación del paso 3 haría fallar la migración entera en
-- vez de borrar filas por su cuenta.
update public.menu_entries c set recipe_id = null
where c.recipe_id is not null and not exists (
  select 1 from public.recipes p
  where p.id = c.recipe_id and p.household_id = c.household_id);

update public.products c set category_id = null
where c.category_id is not null and not exists (
  select 1 from public.categories p
  where p.id = c.category_id and p.household_id = c.household_id);

update public.receipt_items c set product_id = null
where c.product_id is not null and not exists (
  select 1 from public.products p
  where p.id = c.product_id and p.household_id = c.household_id);

update public.receipt_items c set suggested_product_id = null
where c.suggested_product_id is not null and not exists (
  select 1 from public.products p
  where p.id = c.suggested_product_id and p.household_id = c.household_id);

update public.recipe_ingredients c set product_id = null
where c.product_id is not null and not exists (
  select 1 from public.products p
  where p.id = c.product_id and p.household_id = c.household_id);

update public.shopping_list_items c set product_id = null
where c.product_id is not null and not exists (
  select 1 from public.products p
  where p.id = c.product_id and p.household_id = c.household_id);

update public.shopping_trips c set receipt_id = null
where c.receipt_id is not null and not exists (
  select 1 from public.receipts p
  where p.id = c.receipt_id and p.household_id = c.household_id);

-- ── 2. A qué pueden apuntar ─────────────────────────────────────────────────
alter table public.categories
  add constraint categories_household_id_id_key unique (household_id, id);
alter table public.products
  add constraint products_household_id_id_key unique (household_id, id);
alter table public.receipts
  add constraint receipts_household_id_id_key unique (household_id, id);
alter table public.recipes
  add constraint recipes_household_id_id_key unique (household_id, id);
alter table public.shopping_lists
  add constraint shopping_lists_household_id_id_key unique (household_id, id);
alter table public.weekly_menus
  add constraint weekly_menus_household_id_id_key unique (household_id, id);

-- ── 3. Las 18 claves, compuestas ────────────────────────────────────────────
alter table public.category_chain_order
  drop constraint category_chain_order_category_id_fkey,
  add constraint category_chain_order_category_id_fkey
    foreign key (household_id, category_id) references public.categories (household_id, id)
    on delete cascade;
alter table public.inventory_events
  drop constraint inventory_events_product_id_fkey,
  add constraint inventory_events_product_id_fkey
    foreign key (household_id, product_id) references public.products (household_id, id)
    on delete cascade;
alter table public.inventory_items
  drop constraint inventory_items_product_id_fkey,
  add constraint inventory_items_product_id_fkey
    foreign key (household_id, product_id) references public.products (household_id, id)
    on delete cascade;
alter table public.menu_entries
  drop constraint menu_entries_menu_id_fkey,
  add constraint menu_entries_menu_id_fkey
    foreign key (household_id, menu_id) references public.weekly_menus (household_id, id)
    on delete cascade;
alter table public.menu_entries
  drop constraint menu_entries_recipe_id_fkey,
  add constraint menu_entries_recipe_id_fkey
    foreign key (household_id, recipe_id) references public.recipes (household_id, id)
    on delete set null (recipe_id);
alter table public.menu_rules
  drop constraint menu_rules_recipe_id_fkey,
  add constraint menu_rules_recipe_id_fkey
    foreign key (household_id, recipe_id) references public.recipes (household_id, id)
    on delete cascade;
alter table public.product_aliases
  drop constraint product_aliases_product_id_fkey,
  add constraint product_aliases_product_id_fkey
    foreign key (household_id, product_id) references public.products (household_id, id)
    on delete cascade;
alter table public.products
  drop constraint products_category_id_fkey,
  add constraint products_category_id_fkey
    foreign key (household_id, category_id) references public.categories (household_id, id)
    on delete set null (category_id);
alter table public.receipt_items
  drop constraint receipt_items_product_id_fkey,
  add constraint receipt_items_product_id_fkey
    foreign key (household_id, product_id) references public.products (household_id, id)
    on delete set null (product_id);
alter table public.receipt_items
  drop constraint receipt_items_receipt_id_fkey,
  add constraint receipt_items_receipt_id_fkey
    foreign key (household_id, receipt_id) references public.receipts (household_id, id)
    on delete cascade;
alter table public.receipt_items
  drop constraint receipt_items_suggested_product_id_fkey,
  add constraint receipt_items_suggested_product_id_fkey
    foreign key (household_id, suggested_product_id) references public.products (household_id, id)
    on delete set null (suggested_product_id);
alter table public.recipe_ingredients
  drop constraint recipe_ingredients_product_id_fkey,
  add constraint recipe_ingredients_product_id_fkey
    foreign key (household_id, product_id) references public.products (household_id, id)
    on delete set null (product_id);
alter table public.recipe_ingredients
  drop constraint recipe_ingredients_recipe_id_fkey,
  add constraint recipe_ingredients_recipe_id_fkey
    foreign key (household_id, recipe_id) references public.recipes (household_id, id)
    on delete cascade;
alter table public.recipe_ratings
  drop constraint recipe_ratings_recipe_id_fkey,
  add constraint recipe_ratings_recipe_id_fkey
    foreign key (household_id, recipe_id) references public.recipes (household_id, id)
    on delete cascade;
alter table public.shopping_list_items
  drop constraint shopping_list_items_list_id_fkey,
  add constraint shopping_list_items_list_id_fkey
    foreign key (household_id, list_id) references public.shopping_lists (household_id, id)
    on delete cascade;
alter table public.shopping_list_items
  drop constraint shopping_list_items_product_id_fkey,
  add constraint shopping_list_items_product_id_fkey
    foreign key (household_id, product_id) references public.products (household_id, id)
    on delete set null (product_id);
alter table public.shopping_trips
  drop constraint shopping_trips_receipt_id_fkey,
  add constraint shopping_trips_receipt_id_fkey
    foreign key (household_id, receipt_id) references public.receipts (household_id, id)
    on delete set null (receipt_id);
alter table public.user_pinned_products
  drop constraint user_pinned_products_product_id_fkey,
  add constraint user_pinned_products_product_id_fkey
    foreign key (household_id, product_id) references public.products (household_id, id)
    on delete cascade;
