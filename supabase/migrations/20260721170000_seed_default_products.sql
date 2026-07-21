-- ============================================================================
-- Migración — Catálogo inicial sembrado (E12)
-- ============================================================================
-- Un hogar recién creado tenía el catálogo (products) vacío: autocompletado sin
-- sugerencias y añadir cada producto costaba escribirlo entero. Sembramos ~75
-- productos de máxima penetración en hogares españoles al crear el hogar, con
-- categoría, unidad y ubicación por defecto razonables.
--
-- Decisión de producto (E12): se siembra el CATÁLOGO, no el inventario. Cero
-- filas en inventory_items — el stock solo lo crea el usuario. Un producto
-- sembrado es un producto normal (editable, fusionable, borrable): no se añade
-- ninguna columna is_seed/origin.
--
-- Mismo patrón que seed_default_categories (0002 / 0012): función idempotente
-- security definer, sembrado en create_household y backfill de los existentes.
--
-- normalized_name va precalculado como literal (trim → lowercase → NFD sin
-- diacríticos → espacios colapsados, igual que src/lib/normalize.ts). En SQL NO
-- se usa unaccent(): evita el problema de inmutabilidad documentado en 0002.
--
-- El left join a categories por NOMBRE es deliberado: si un hogar renombró o
-- borró una categoría, el producto se siembra con category_id null (la UI ya
-- tolera productos sin categoría) en vez de fallar la siembra entera.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Función de siembra del catálogo (idempotente por (household_id, normalized_name))
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_products(hid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.products
    (household_id, name, normalized_name, category_id, default_unit, default_location)
  select hid, s.name, s.normalized_name, c.id,
         s.unit::public.unit_type, s.loc::public.location_type
  from (values
    ('Plátanos', 'platanos', 'Fruta', 'ud', 'pantry'),
    ('Manzanas', 'manzanas', 'Fruta', 'ud', 'pantry'),
    ('Naranjas', 'naranjas', 'Fruta', 'kg', 'pantry'),
    ('Peras', 'peras', 'Fruta', 'ud', 'pantry'),
    ('Limones', 'limones', 'Fruta', 'ud', 'pantry'),
    ('Patatas', 'patatas', 'Verdura', 'kg', 'pantry'),
    ('Cebollas', 'cebollas', 'Verdura', 'kg', 'pantry'),
    ('Ajos', 'ajos', 'Verdura', 'ud', 'pantry'),
    ('Tomates', 'tomates', 'Verdura', 'kg', 'pantry'),
    ('Zanahorias', 'zanahorias', 'Verdura', 'kg', 'fridge'),
    ('Pimientos', 'pimientos', 'Verdura', 'ud', 'fridge'),
    ('Calabacines', 'calabacines', 'Verdura', 'ud', 'fridge'),
    ('Lechuga', 'lechuga', 'Verdura', 'ud', 'fridge'),
    ('Pepinos', 'pepinos', 'Verdura', 'ud', 'fridge'),
    ('Brócoli', 'brocoli', 'Verdura', 'ud', 'fridge'),
    ('Pechugas de pollo', 'pechugas de pollo', 'Carne', 'kg', 'fridge'),
    ('Carne picada', 'carne picada', 'Carne', 'kg', 'fridge'),
    ('Lomo de cerdo', 'lomo de cerdo', 'Carne', 'kg', 'fridge'),
    ('Jamón cocido', 'jamon cocido', 'Carne', 'g', 'fridge'),
    ('Jamón serrano', 'jamon serrano', 'Carne', 'g', 'fridge'),
    ('Salmón', 'salmon', 'Pescado', 'kg', 'fridge'),
    ('Merluza', 'merluza', 'Pescado', 'kg', 'fridge'),
    ('Leche', 'leche', 'Lácteos y huevos', 'l', 'pantry'),
    ('Huevos', 'huevos', 'Lácteos y huevos', 'ud', 'fridge'),
    ('Yogures', 'yogures', 'Lácteos y huevos', 'ud', 'fridge'),
    ('Queso curado', 'queso curado', 'Lácteos y huevos', 'g', 'fridge'),
    ('Queso rallado', 'queso rallado', 'Lácteos y huevos', 'g', 'fridge'),
    ('Mantequilla', 'mantequilla', 'Lácteos y huevos', 'g', 'fridge'),
    ('Nata para cocinar', 'nata para cocinar', 'Lácteos y huevos', 'ml', 'pantry'),
    ('Pan', 'pan', 'Panadería', 'ud', 'pantry'),
    ('Pan de molde', 'pan de molde', 'Panadería', 'ud', 'pantry'),
    ('Aceite de oliva virgen extra', 'aceite de oliva virgen extra', 'Despensa', 'l', 'pantry'),
    ('Aceite de girasol', 'aceite de girasol', 'Despensa', 'l', 'pantry'),
    ('Arroz', 'arroz', 'Despensa', 'kg', 'pantry'),
    ('Macarrones', 'macarrones', 'Despensa', 'kg', 'pantry'),
    ('Espaguetis', 'espaguetis', 'Despensa', 'kg', 'pantry'),
    ('Lentejas', 'lentejas', 'Despensa', 'kg', 'pantry'),
    ('Garbanzos cocidos', 'garbanzos cocidos', 'Despensa', 'ud', 'pantry'),
    ('Atún en lata', 'atun en lata', 'Despensa', 'ud', 'pantry'),
    ('Tomate frito', 'tomate frito', 'Despensa', 'ud', 'pantry'),
    ('Harina de trigo', 'harina de trigo', 'Despensa', 'kg', 'pantry'),
    ('Azúcar', 'azucar', 'Despensa', 'kg', 'pantry'),
    ('Sal', 'sal', 'Despensa', 'kg', 'pantry'),
    ('Vinagre', 'vinagre', 'Despensa', 'ml', 'pantry'),
    ('Café', 'cafe', 'Despensa', 'g', 'pantry'),
    ('Cacao soluble', 'cacao soluble', 'Despensa', 'g', 'pantry'),
    ('Cereales', 'cereales', 'Despensa', 'ud', 'pantry'),
    ('Mayonesa', 'mayonesa', 'Despensa', 'ud', 'pantry'),
    ('Caldo de pollo', 'caldo de pollo', 'Despensa', 'l', 'pantry'),
    ('Pan rallado', 'pan rallado', 'Despensa', 'g', 'pantry'),
    ('Miel', 'miel', 'Despensa', 'ud', 'pantry'),
    ('Guisantes congelados', 'guisantes congelados', 'Congelados', 'g', 'freezer'),
    ('Gambas congeladas', 'gambas congeladas', 'Congelados', 'g', 'freezer'),
    ('Pizza congelada', 'pizza congelada', 'Congelados', 'ud', 'freezer'),
    ('Agua embotellada', 'agua embotellada', 'Bebidas', 'l', 'pantry'),
    ('Zumo de naranja', 'zumo de naranja', 'Bebidas', 'l', 'pantry'),
    ('Refrescos', 'refrescos', 'Bebidas', 'ud', 'pantry'),
    ('Cerveza', 'cerveza', 'Bebidas', 'ud', 'fridge'),
    ('Galletas', 'galletas', 'Snacks y dulces', 'ud', 'pantry'),
    ('Chocolate', 'chocolate', 'Snacks y dulces', 'ud', 'pantry'),
    ('Patatas fritas', 'patatas fritas', 'Snacks y dulces', 'ud', 'pantry'),
    ('Frutos secos', 'frutos secos', 'Snacks y dulces', 'g', 'pantry'),
    ('Papel higiénico', 'papel higienico', 'Limpieza', 'ud', 'other'),
    ('Papel de cocina', 'papel de cocina', 'Limpieza', 'ud', 'other'),
    ('Detergente para la ropa', 'detergente para la ropa', 'Limpieza', 'ud', 'other'),
    ('Suavizante', 'suavizante', 'Limpieza', 'ud', 'other'),
    ('Lavavajillas', 'lavavajillas', 'Limpieza', 'ud', 'other'),
    ('Limpiador multiusos', 'limpiador multiusos', 'Limpieza', 'ud', 'other'),
    ('Bolsas de basura', 'bolsas de basura', 'Limpieza', 'ud', 'other'),
    ('Lejía', 'lejia', 'Limpieza', 'l', 'other'),
    ('Gel de ducha', 'gel de ducha', 'Higiene', 'ud', 'other'),
    ('Champú', 'champu', 'Higiene', 'ud', 'other'),
    ('Pasta de dientes', 'pasta de dientes', 'Higiene', 'ud', 'other'),
    ('Desodorante', 'desodorante', 'Higiene', 'ud', 'other'),
    ('Jabón de manos', 'jabon de manos', 'Higiene', 'ud', 'other')
  ) as s(name, normalized_name, category, unit, loc)
  left join public.categories c
    on c.household_id = hid and c.name = s.category
  on conflict (household_id, normalized_name) do nothing;
$$;

-- ---------------------------------------------------------------------------
-- 2. Ampliar create_household para sembrar el catálogo en los hogares nuevos.
-- ---------------------------------------------------------------------------
-- Se copia la definición VIGENTE (la última que la redefine es 0003
-- shopping_list, que ya siembra categorías y crea la lista activa) y se añade la
-- siembra del catálogo entre las categorías y la lista. join_household_by_code NO
-- se toca: el hogar al que uno se une ya existe y ya fue sembrado.
create or replace function public.create_household(
  p_name text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_household_id uuid;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  loop
    v_code := public.generate_invite_code();
    exit when not exists (
      select 1 from public.households where invite_code = v_code
    );
  end loop;

  insert into public.households (name, invite_code, created_by)
  values (trim(p_name), v_code, v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, v_uid, 'owner', nullif(trim(p_display_name), ''));

  perform public.seed_default_categories(v_household_id);
  perform public.seed_default_products(v_household_id);
  perform public.ensure_active_list(v_household_id);

  return v_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill: sembrar el catálogo SOLO en hogares sin ningún producto.
-- ---------------------------------------------------------------------------
-- Los hogares activos con catálogo propio (aunque sea 1 producto) no se tocan,
-- para no pisar clasificaciones ni resucitar productos borrados a propósito.
do $$
declare
  h record;
begin
  for h in select id from public.households loop
    if not exists (select 1 from public.products where household_id = h.id) then
      perform public.seed_default_products(h.id);
    end if;
  end loop;
end;
$$;
