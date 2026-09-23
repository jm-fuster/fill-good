-- ============================================================================
-- Topes: nombres de miembro, tipos de uso de IA, hogares por persona y tamaño
-- ============================================================================
-- Cuatro huecos del repaso de permisos previo a publicar el repo (#53). Ninguno
-- deja leer ni tocar datos de otro hogar; los cuatro dejan a alguien con sesión
-- saltarse por la API un límite que la app sí respeta, y la mayoría sirven para
-- llenar la base. En el plan gratuito eso no es un detalle: al pasarse del disco
-- el proyecto entero se queda en solo lectura, para todos los hogares.
-- ============================================================================

-- ── 1. El nombre de cada miembro, con el mismo tope en todas partes ─────────
-- set_member_display_name exige de 1 a 80 caracteres, y la app pone esos mismos
-- 80 al crear un hogar o al unirse, pero create_household y
-- join_household_by_code no lo comprobaban: una llamada directa a la API podía
-- dejar un nombre de cualquier tamaño, y lo ven los demás miembros. El tope va
-- en la tabla, que es la única forma de que lo cumpla también la próxima
-- función que escriba ahí. Antes se recortan los que ya lo pasen (no debería
-- haber ninguno) para que la restricción valide lo que ya existe.
update public.household_members
set display_name = nullif(left(btrim(display_name), 80), '')
where display_name is not null
  and (char_length(display_name) > 80 or btrim(display_name) = '');

alter table public.household_members
  add constraint household_members_display_name_len
  check (display_name is null or char_length(display_name) between 1 and 80);

-- ── 2. Solo los tres tipos de uso de IA que existen ─────────────────────────
-- record_ai_usage cuenta por tipo (`kind`), y a uno desconocido le daba el tope
-- por defecto de 10 a la hora: inventando tipos se multiplicaba el límite y se
-- llenaba la tabla. La app solo usa estos tres (`AiRateKind` en
-- src/lib/ai/rate-limit.ts); con la restricción, una llamada con otro tipo
-- falla al insertar. Las filas son contadores que se purgan a los dos días, y
-- las de otro tipo, si las hay, no pueden venir de la app: se borran.
delete from public.ai_usage where kind not in ('receipt', 'menu', 'recipe');

alter table public.ai_usage
  add constraint ai_usage_kind_check
  check (kind in ('receipt', 'menu', 'recipe'));

-- ── 3. Como mucho 10 hogares por persona ────────────────────────────────────
-- Crear un hogar siembra de golpe un centenar de filas (categorías, productos y
-- la lista), y nada limitaba cuántos crea una misma cuenta: un bucle contra
-- create_household bastaba para llenar la base. Diez sobran para cualquier casa
-- real (la propia, la de los padres, la del pueblo…).
--
-- Va en un trigger de household_members y no en create_household porque las
-- dos puertas de entrada a un hogar, crearlo y unirse con código, insertan ahí:
-- con el tope en una sola, la otra lo esquivaba (el patrón de la guarda ausente
-- en la hermana). Volver a un hogar en el que ya estás no cuenta:
-- join_household_by_code hace `on conflict do nothing`, pero un BEFORE INSERT
-- salta igual, antes de que se vea el conflicto, así que el trigger lo mira.
-- La app traduce `too_many_households` en las dos acciones.
create or replace function public.enforce_household_membership_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.household_members
    where household_id = new.household_id and user_id = new.user_id
  ) then
    return new;
  end if;
  if (
    select count(*) from public.household_members where user_id = new.user_id
  ) >= 10 then
    raise exception 'too_many_households';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_household_membership_limit()
  from public, anon;

create trigger household_members_membership_limit
  before insert on public.household_members
  for each row execute function public.enforce_household_membership_limit();

-- ── 4. Tope de tamaño en lo que escribe cada hogar ──────────────────────────
-- Los nombres ya tenían tope (productos, recetas, categorías, la lista, el
-- hogar), pero otras 38 columnas que un miembro escribe con su propio token
-- no: notas, textos libres del menú, alias, campos del ticket, la suscripción
-- push, los jsonb y los arrays. Por la API se podía guardar en cualquiera un
-- valor de cientos de megas, y con una sola petición así se llena la base. Los
-- topes van holgados, de dos a cinco veces lo que deja escribir la app (los
-- esquemas de zod de cada feature) y generosos en lo que escribe la IA, porque
-- su trabajo es parar un abuso, no recortar un uso normal. Los ids de autor
-- (`*_by`) son ids de Clerk de 32 caracteres; la app los valida hasta 64.
--
-- Van `not valid`: se aplican a toda fila que se inserte o se modifique desde
-- ahora, pero no se revisan las que ya existen, así que la migración no puede
-- fallar por un dato viejo. Con estos márgenes no debería haber ninguno fuera,
-- y se pueden validar después con `alter table … validate constraint …`.
--
-- Lo que esto NO impide es meter muchas filas pequeñas: el tope corta el
-- tamaño de cada una, no cuántas hay. Para eso harían falta cuotas por hogar.
alter table public.categories
  add constraint categories_icon_len
    check (char_length(icon) <= 100) not valid;

alter table public.household_menu_prefs
  add constraint household_menu_prefs_avoid_text_len
    check (char_length(avoid_text) <= 2000) not valid;

alter table public.households
  add constraint households_preferred_chains_len
    check (char_length(array_to_string(preferred_chains, '')) <= 1000) not valid;

alter table public.inventory_events
  add constraint inventory_events_created_by_len
    check (char_length(created_by) <= 100) not valid;

alter table public.inventory_items
  add constraint inventory_items_notes_len
    check (char_length(notes) <= 2000) not valid,
  add constraint inventory_items_updated_by_len
    check (char_length(updated_by) <= 100) not valid;

alter table public.menu_entries
  add constraint menu_entries_free_text_len
    check (char_length(free_text) <= 1000) not valid;

alter table public.menu_rules
  add constraint menu_rules_text_rule_len
    check (char_length(text_rule) <= 1000) not valid;

alter table public.product_aliases
  add constraint product_aliases_alias_len
    check (char_length(alias) <= 500) not valid,
  add constraint product_aliases_alias_normalized_len
    check (char_length(alias_normalized) <= 500) not valid,
  add constraint product_aliases_source_len
    check (char_length(source) <= 40) not valid,
  add constraint product_aliases_store_chain_len
    check (char_length(store_chain) <= 100) not valid;

alter table public.products
  add constraint products_inferred_chain_len
    check (char_length(inferred_chain) <= 100) not valid,
  add constraint products_normalized_name_len
    check (char_length(normalized_name) <= 500) not valid,
  add constraint products_savings_tip_size
    check (pg_column_size(savings_tip) <= 4096) not valid;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_len
    check (char_length(endpoint) <= 2048) not valid,
  add constraint push_subscriptions_p256dh_len
    check (char_length(p256dh) <= 256) not valid,
  add constraint push_subscriptions_auth_len
    check (char_length(auth) <= 256) not valid;

alter table public.receipt_items
  add constraint receipt_items_description_len
    check (char_length(description) <= 1000) not valid,
  add constraint receipt_items_raw_text_len
    check (char_length(raw_text) <= 1000) not valid,
  add constraint receipt_items_store_chain_len
    check (char_length(store_chain) <= 100) not valid;

-- raw_extraction guarda la respuesta entera de la IA para un ticket: un ticket
-- largo son decenas de KB, así que el tope está en 256 KB (tamaño almacenado).
alter table public.receipts
  add constraint receipts_image_path_len
    check (char_length(image_path) <= 1024) not valid,
  add constraint receipts_raw_extraction_size
    check (pg_column_size(raw_extraction) <= 262144) not valid,
  add constraint receipts_store_chain_len
    check (char_length(store_chain) <= 100) not valid,
  add constraint receipts_store_name_len
    check (char_length(store_name) <= 1000) not valid,
  add constraint receipts_uploaded_by_len
    check (char_length(uploaded_by) <= 100) not valid;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_name_len
    check (char_length(name) <= 500) not valid;

alter table public.recipes
  add constraint recipes_created_by_len
    check (char_length(created_by) <= 100) not valid,
  add constraint recipes_description_len
    check (char_length(description) <= 5000) not valid,
  add constraint recipes_instructions_len
    check (char_length(instructions) <= 20000) not valid,
  add constraint recipes_normalized_name_len
    check (char_length(normalized_name) <= 500) not valid,
  add constraint recipes_meal_types_count
    check (cardinality(meal_types) <= 10) not valid,
  add constraint recipes_seasons_count
    check (cardinality(seasons) <= 10) not valid;

alter table public.shopping_list_items
  add constraint shopping_list_items_added_by_len
    check (char_length(added_by) <= 100) not valid,
  add constraint shopping_list_items_checked_by_len
    check (char_length(checked_by) <= 100) not valid;

alter table public.shopping_lists
  add constraint shopping_lists_name_len
    check (char_length(name) <= 200) not valid;

alter table public.shopping_trips
  add constraint shopping_trips_closed_by_len
    check (char_length(closed_by) <= 100) not valid,
  add constraint shopping_trips_product_ids_count
    check (cardinality(product_ids) <= 1000) not valid;
