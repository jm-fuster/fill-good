# E12 — Catálogo inicial sembrado + selector "¿Qué tienes ya en casa?"

> **Tarea para un agente de IA.** Lee este documento completo antes de tocar código.
> Lee también `AGENTS.md` (raíz del repo) y la guía de Next.js en
> `node_modules/next/dist/docs/` — este proyecto usa Next.js 16 con cambios que
> pueden diferir de tus datos de entrenamiento.

## Objetivo

Eliminar la fricción del arranque en frío: hoy un hogar recién creado tiene el
inventario vacío, el autocompletado de la lista sin sugerencias y los menús IA
sin datos. La solución tiene dos piezas:

1. **Sembrar el catálogo (`products`)** al crear el hogar con ~75 productos
   típicos de un hogar español, con categoría, unidad y ubicación por defecto
   correctas. **Sin tocar `inventory_items`**: cero stock ficticio.
2. **Selector "¿Qué tienes ya en casa?"** en el empty state del inventario:
   chips agrupados por categoría (a partir del catálogo); el usuario marca lo
   que tiene y se crean sus `inventory_items` reales en un solo gesto.

## Decisión de producto (NO reabrir)

Se evaluó sembrar directamente el inventario con existencias ficticias y se
**descartó**. Razones, verificadas en código:

- `src/lib/ai/menu-prompt.ts` pasa el inventario a la IA como verdad del hogar:
  stock inventado → menús construidos sobre comida que no existe, lo contrario
  del eslogan "compra lo justo".
- `src/features/inventory/status.ts` deriva estados accionables (caduca pronto,
  agotado, quedan pocas) de cantidades reales. Cantidades falsas generan falsas
  alarmas o silencios falsos.
- Borrar 20 ítems que no aplican (veganos, alérgicos, sin mascotas) es más
  fricción que añadir 10 que sí, y deja datos basura en hogares compartidos
  ("¿quién ha puesto 12 huevos aquí?").

En cambio, el **catálogo** es infraestructura invisible: no afirma que tengas
nada, solo hace que añadir sea 1 toque. Es el patrón de Bring! (lista vacía +
catálogo de sugerencias rico) y es coherente con el precedente del propio repo:
`create_household` ya siembra las 14 categorías por defecto.

## Diagnóstico del estado actual (verificado en código)

| Pieza | Archivo | Dato relevante |
|---|---|---|
| Alta de hogar | `supabase/migrations/20260719113713_init.sql` + `20260719121808_inventory.sql` | RPC `create_household` (security definer) llama a `seed_default_categories(hid)` → el hook para sembrar productos ya existe y este es el patrón a imitar |
| Categorías actuales | `supabase/migrations/20260721120000_categories_fruta_verdura.sql` | 14 categorías: Fruta, Verdura, Carne, Pescado, Lácteos y huevos, Panadería, Despensa, Congelados, Bebidas, Snacks y dulces, Limpieza, Higiene, Mascotas, Otros. El seed de productos debe mapear por **nombre** de categoría dentro del hogar |
| Catálogo | `products`: `unique (household_id, normalized_name)` | La siembra puede ser idempotente con `on conflict … do nothing` |
| Normalización | `src/lib/normalize.ts` | `normalized_name` lo calcula **la app** (trim → lowercase → NFD sin diacríticos → espacios colapsados). En SQL **no** usar `unaccent()` (problema de inmutabilidad documentado en la migración 0002): los valores normalizados van **precalculados como literales** en la tabla de datos de abajo |
| Habitualidad | `supabase/migrations/20260720073534_products_habits.sql` | `purchase_count` default 0 → los productos sembrados quedan por detrás de los hábitos reales en el autocompletado (orden por `purchaseCount` en `product-autocomplete.tsx`). Ningún cambio necesario |
| Autocompletado | `src/features/shopping-list/components/product-autocomplete.tsx` | Bebe del catálogo del hogar → beneficio inmediato de la siembra |
| Precios | `src/features/prices/queries.ts` | El listado se construye desde `receipt_items` (compras reales): productos sembrados sin compras **no** aparecen ahí. Sin riesgo de ruido |
| Empty state inventario | `src/app/(app)/inventario/page.tsx:54-58` | `EmptyState` estático ("Aún no hay productos…"). Aquí vive el selector de la Fase 2 |
| Enums | `unit_type`: `ud, g, kg, ml, l` · `location_type`: `pantry, fridge, freezer, other` | Usados en la tabla de datos |

## Fase 1 — Migración: sembrar el catálogo

Nueva migración en `supabase/migrations/` (vía Supabase CLI, según convención):

1. **Función `seed_default_products(hid uuid)`** — `security definer`,
   `set search_path = public`, idempotente. Patrón:

   ```sql
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
       -- … resto de filas de la tabla "Datos de la siembra" …
       ('Jabón de manos', 'jabon de manos', 'Higiene', 'ud', 'other')
     ) as s(name, normalized_name, category, unit, loc)
     left join public.categories c
       on c.household_id = hid and c.name = s.category
     on conflict (household_id, normalized_name) do nothing;
   $$;
   ```

   `left join` a propósito: si un hogar renombró/borró una categoría, el
   producto se siembra con `category_id` null (la UI ya tolera productos sin
   categoría) en vez de fallar.

2. **Redefinir `create_household`** (copiar la versión vigente de la migración
   0002, que es la última que la redefine) añadiendo
   `perform public.seed_default_products(v_household_id);` justo después de
   `perform public.seed_default_categories(v_household_id);`.
   `join_household_by_code` NO se toca (el hogar ya existe y ya fue sembrado).

3. **Backfill**: sembrar solo hogares **sin ningún producto** (mismo patrón que
   el backfill de categorías de la migración 0002). Los hogares activos con
   catálogo propio no se tocan.

4. Aplicar con `supabase db push` — **pide autorización al usuario antes de
   hacer push** — y regenerar los tipos de `src/lib/supabase/types.ts` como
   manda `AGENTS.md` (la migración no cambia el esquema, pero añade la función
   nueva a los tipos de RPC).

## Fase 2 — Selector "¿Qué tienes ya en casa?"

Sustituir el `EmptyState` estático del inventario por un selector cuando el
inventario está vacío **y** el catálogo tiene productos:

- Componente cliente en `src/features/inventory/components/starter-picker.tsx`.
  Recibe el catálogo (productos que aún no tienen fila en inventario) agrupado
  por categoría (nombre + icono, orden por `sort_order`).
- Chips **toggle** multiselección: `<button>` con `aria-pressed`, touch target
  ≥ 44 px, tokens semánticos (seleccionado: `bg-primary text-primary-foreground`;
  no inventar colores). Etiqueta visible del producto, nada de placeholder-only.
- Botón de confirmación pegado abajo ("Añadir N productos", deshabilitado con
  0 seleccionados) siguiendo el patrón de barra fija existente
  (`shopping-list-view.tsx`); en escritorio (E11) dentro de la columna de
  contenido.
- Server Action `addStarterItemsAction(productIds: string[])` en
  `src/features/inventory/actions.ts`:
  - Valida con zod (array de uuids, máx. ~100).
  - Inserta en `inventory_items` una fila por producto: `quantity = 1`,
    `unit = default_unit`, `location = default_location`, sin `expiry_date`,
    `updated_by` = usuario actual — mismo formato que el alta manual existente.
  - `on conflict` de `(household_id, product_id, location)` → ignorar.
  - `revalidatePath("/inventario")`.
- El header del selector deja claro que es opcional y honesto: título
  "¿Qué tienes ya en casa?", subtítulo tipo "Marca lo que haya ahora mismo;
  las cantidades las ajustas luego. También puedes escanear un ticket."
  Mantener visible el acceso al escaneo de ticket y al alta manual (FAB).
- Si el usuario no marca nada, el empty state clásico sigue teniendo sentido
  como texto secundario. No bloquear nada: el selector es un atajo, no un paso
  obligatorio de onboarding (el alta de hogar debe seguir siendo instantánea).

## Datos de la siembra (~75 productos)

Criterio: productos de máxima penetración en hogares españoles según el panel
de consumo alimentario del MAPA (leche, pan, huevos, patatas, fruta fresca,
aceite de oliva… están en prácticamente todos los hogares) + básicos no
alimentarios de droguería/higiene. Se excluyen deliberadamente:

- **Mascotas** (~40 % de hogares; el que tiene mascota añade su pienso en 5 s).
- **Otros** (cajón de sastre, nada que sembrar).
- Marcas y variantes (desnatada/entera, integral…): el genérico maximiza el
  matching de tickets y cada hogar lo refina.

`normalized_name` ya viene precalculado conforme a `src/lib/normalize.ts` —
copiar literal, no recalcular en SQL.

| name | normalized_name | Categoría | unit | location |
|---|---|---|---|---|
| Plátanos | platanos | Fruta | ud | pantry |
| Manzanas | manzanas | Fruta | ud | pantry |
| Naranjas | naranjas | Fruta | kg | pantry |
| Peras | peras | Fruta | ud | pantry |
| Limones | limones | Fruta | ud | pantry |
| Patatas | patatas | Verdura | kg | pantry |
| Cebollas | cebollas | Verdura | kg | pantry |
| Ajos | ajos | Verdura | ud | pantry |
| Tomates | tomates | Verdura | kg | pantry |
| Zanahorias | zanahorias | Verdura | kg | fridge |
| Pimientos | pimientos | Verdura | ud | fridge |
| Calabacines | calabacines | Verdura | ud | fridge |
| Lechuga | lechuga | Verdura | ud | fridge |
| Pepinos | pepinos | Verdura | ud | fridge |
| Brócoli | brocoli | Verdura | ud | fridge |
| Pechugas de pollo | pechugas de pollo | Carne | kg | fridge |
| Carne picada | carne picada | Carne | kg | fridge |
| Lomo de cerdo | lomo de cerdo | Carne | kg | fridge |
| Jamón cocido | jamon cocido | Carne | g | fridge |
| Jamón serrano | jamon serrano | Carne | g | fridge |
| Salmón | salmon | Pescado | kg | fridge |
| Merluza | merluza | Pescado | kg | fridge |
| Leche | leche | Lácteos y huevos | l | pantry |
| Huevos | huevos | Lácteos y huevos | ud | fridge |
| Yogures | yogures | Lácteos y huevos | ud | fridge |
| Queso curado | queso curado | Lácteos y huevos | g | fridge |
| Queso rallado | queso rallado | Lácteos y huevos | g | fridge |
| Mantequilla | mantequilla | Lácteos y huevos | g | fridge |
| Nata para cocinar | nata para cocinar | Lácteos y huevos | ml | pantry |
| Pan | pan | Panadería | ud | pantry |
| Pan de molde | pan de molde | Panadería | ud | pantry |
| Aceite de oliva virgen extra | aceite de oliva virgen extra | Despensa | l | pantry |
| Aceite de girasol | aceite de girasol | Despensa | l | pantry |
| Arroz | arroz | Despensa | kg | pantry |
| Macarrones | macarrones | Despensa | kg | pantry |
| Espaguetis | espaguetis | Despensa | kg | pantry |
| Lentejas | lentejas | Despensa | kg | pantry |
| Garbanzos cocidos | garbanzos cocidos | Despensa | ud | pantry |
| Atún en lata | atun en lata | Despensa | ud | pantry |
| Tomate frito | tomate frito | Despensa | ud | pantry |
| Harina de trigo | harina de trigo | Despensa | kg | pantry |
| Azúcar | azucar | Despensa | kg | pantry |
| Sal | sal | Despensa | kg | pantry |
| Vinagre | vinagre | Despensa | ml | pantry |
| Café | cafe | Despensa | g | pantry |
| Cacao soluble | cacao soluble | Despensa | g | pantry |
| Cereales | cereales | Despensa | ud | pantry |
| Mayonesa | mayonesa | Despensa | ud | pantry |
| Caldo de pollo | caldo de pollo | Despensa | l | pantry |
| Pan rallado | pan rallado | Despensa | g | pantry |
| Miel | miel | Despensa | ud | pantry |
| Guisantes congelados | guisantes congelados | Congelados | g | freezer |
| Gambas congeladas | gambas congeladas | Congelados | g | freezer |
| Pizza congelada | pizza congelada | Congelados | ud | freezer |
| Agua embotellada | agua embotellada | Bebidas | l | pantry |
| Zumo de naranja | zumo de naranja | Bebidas | l | pantry |
| Refrescos | refrescos | Bebidas | ud | pantry |
| Cerveza | cerveza | Bebidas | ud | fridge |
| Galletas | galletas | Snacks y dulces | ud | pantry |
| Chocolate | chocolate | Snacks y dulces | ud | pantry |
| Patatas fritas | patatas fritas | Snacks y dulces | ud | pantry |
| Frutos secos | frutos secos | Snacks y dulces | g | pantry |
| Papel higiénico | papel higienico | Limpieza | ud | other |
| Papel de cocina | papel de cocina | Limpieza | ud | other |
| Detergente para la ropa | detergente para la ropa | Limpieza | ud | other |
| Suavizante | suavizante | Limpieza | ud | other |
| Lavavajillas | lavavajillas | Limpieza | ud | other |
| Limpiador multiusos | limpiador multiusos | Limpieza | ud | other |
| Bolsas de basura | bolsas de basura | Limpieza | ud | other |
| Lejía | lejia | Limpieza | l | other |
| Gel de ducha | gel de ducha | Higiene | ud | other |
| Champú | champu | Higiene | ud | other |
| Pasta de dientes | pasta de dientes | Higiene | ud | other |
| Desodorante | desodorante | Higiene | ud | other |
| Jabón de manos | jabon de manos | Higiene | ud | other |

Unidades y ubicaciones son **valores por defecto razonables**, no verdades:
el usuario las ajusta al editar. No pelearse por "¿manzanas en ud o kg?".

## Qué NO hacer

- **No** insertar filas en `inventory_items` desde la migración. El stock solo
  lo crea el usuario (selector, alta manual, ticket o checkout de la lista).
- **No** añadir columnas tipo `is_seed`/`origin` a `products` (MVP: un producto
  sembrado es un producto normal — se puede editar, fusionar con
  `merge_products` y borrar como cualquier otro).
- **No** convertir el selector en un paso obligatorio del onboarding ni en un
  modal que interrumpa. Vive en el empty state del inventario.
- **No** tocar `join_household_by_code`, ni la ordenación del autocompletado,
  ni `src/components/ui/*`.
- **No** usar `unaccent()`/columnas generadas para `normalized_name` en SQL.

## Criterios de aceptación

1. Crear un hogar nuevo → 14 categorías + ~75 productos en catálogo y **cero**
   `inventory_items`. El inventario muestra el selector, no ítems fantasma.
2. En la lista de la compra de ese hogar recién creado, teclear "le" sugiere al
   instante Leche, Lechuga, Lentejas, Lejía (orden alfabético: todas con
   `purchase_count = 0`).
3. Marcar 8 chips en el selector y confirmar → 8 ítems reales en inventario
   (cantidad 1, unidad/ubicación por defecto, sin caducidad) y el selector da
   paso al listado normal.
4. Ejecutar `seed_default_products` dos veces sobre el mismo hogar no duplica
   nada (verificable en SQL).
5. Un hogar existente **con** productos queda intacto tras la migración; uno
   sin productos recibe la siembra.
6. `/precios` sigue sin listar productos sin compras.
7. Accesibilidad del selector: chips operables por teclado, `aria-pressed`
   correcto, foco visible, touch ≥ 44 px, contraste AA en ambos temas.
8. `npm run build` y lint pasan; tipos de Supabase regenerados.
