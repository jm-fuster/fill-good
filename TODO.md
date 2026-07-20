# TO-DO — Mejoras de Stash

Documento de trabajo para implementar las próximas mejoras **progresivamente con agentes de IA**.
Cada tarea es autocontenida: incluye contexto, diseño propuesto, pasos y criterios de aceptación.
Ejecutar las tareas **en orden dentro de cada bloque**; los bloques A, B y C son secuenciales
(A = mejoras rápidas independientes, B = recetario, C = generador de menús 2.0, que depende de B).

## Instrucciones para el agente (leer antes de cada tarea)

- Leer `AGENTS.md` y respetar el sistema de diseño (`/styleguide`, tokens semánticos, touch targets ≥ 44px, drawers en móvil, UI en español).
- **Next.js 16 tiene breaking changes**: leer la guía correspondiente en `node_modules/next/dist/docs/` antes de escribir código.
- Migraciones con Supabase CLI (`supabase migration new <nombre>` + `supabase db push`) y **regenerar tipos** (`src/lib/supabase/types.ts`) tras cada migración.
- Lecturas en Server Components, escrituras en Server Actions (`src/features/<feature>/actions.ts`) + `revalidatePath`.
- IA siempre vía `getModel('receipts' | 'menus')` (`src/lib/ai/models.ts`). Mantener Gemini free tier.
- Al terminar una tarea: marcar sus checkboxes aquí, compilar (`npm run build` o dev server) y verificar los criterios de aceptación en el preview.

### Estado global

- [x] A1 — Invitación por enlace (URL con código)
- [x] A2 — Productos habituales y autocompletado inteligente en la lista
- [x] A3 — Revisión de caducidades tras la compra + "consumir pronto"
- [x] B1 — Recetario del hogar (CRUD de recetas, tipo de comida y temporada)
- [x] B2 — Gustos y apetencia (valoraciones + señales de uso)
- [x] C1 — Varios platos por comida/cena
- [x] C2 — Reglas del menú
- [x] C3 — Generador de menús 2.0 (integra recetario, gustos, temporada, reglas y stock)

---

## Bloque A — Mejoras rápidas e independientes

### A1 — Invitación por enlace (URL con código)

**Idea original:** al copiar el código de invitación, copiar la URL completa con el código para que unirse sea un clic.

**Contexto actual**
- `src/features/household/components/household-card.tsx` → `copyCode()` copia solo el código.
- `joinHouseholdAction` (`src/features/household/actions.ts`) llama al RPC `join_household_by_code`; el formulario de unión vive en `src/features/household/components/onboarding-form.tsx` (tab "Unirme").
- No hay ninguna ruta pública que acepte el código.

**Diseño propuesto**
- Nueva ruta `src/app/unirse/[code]/page.tsx` (Server Component):
  - Usuario **no autenticado** → redirigir a sign-in con `redirect_url=/unirse/<code>` para volver tras autenticarse.
  - Autenticado **sin hogar** → mostrar formulario de unión con el código ya relleno (reutilizar `onboarding-form` con prop `initialCode` y tab "Unirme" preseleccionado, o un componente `JoinByLinkCard` más simple con nombre a mostrar + botón "Unirme al hogar").
  - Autenticado **con hogar** → mensaje "Ya perteneces a un hogar" con enlace a `/ajustes` (la app es de un hogar por usuario; no intentar unirse).
- En `household-card.tsx`, `copyCode()` pasa a copiar `${window.location.origin}/unirse/${household.inviteCode}` (toast "Enlace copiado"). Mantener el código visible en pantalla por si quieren dictarlo.
- Extra móvil: si `navigator.share` existe, ofrecer compartir nativo (Web Share API) además de copiar.
- El caso "código regenerado/inválido" ya lo cubre el error del RPC ("Ese código no corresponde a ningún hogar.").

**Pasos**
- [x] Añadir prop `initialCode?: string` (y tab por defecto) a `onboarding-form.tsx`, o crear `JoinByLinkCard`.
- [x] Crear `src/app/unirse/[code]/page.tsx` con los tres estados (no auth / sin hogar / con hogar).
- [x] Cambiar `copyCode()` para copiar la URL; añadir botón de compartir con Web Share API si está disponible.
- [x] Actualizar el texto descriptivo de la tarjeta ("Comparte el enlace…").

**Criterios de aceptación**
- Copiar desde Ajustes produce una URL tipo `https://<host>/unirse/ABC123` y muestra toast.
- Abrir esa URL sin sesión → tras iniciar sesión se vuelve a la página de unión con el código relleno.
- Abrir con sesión y sin hogar → un clic para unirse; con hogar → mensaje informativo, sin errores.

---

### A2 — Productos habituales y autocompletado inteligente en la lista

**Idea original:** que la app recuerde lo que sueles tener (p. ej. leche); al buscar "le" en la lista debe salir "Leche" directamente, y la app ya debe saber dónde va (nevera, despensa…).

**Contexto actual**
- `products` ya guarda `default_location` y `default_unit`, y el checkout (`checkoutAction` en `src/features/shopping-list/actions.ts`) ya envía cada producto a su ubicación por defecto. **Lo que falta es memoria de "habitualidad" y un autocompletado bueno.**
- El formulario `add-item-form.tsx` usa un `<datalist>` nativo (pobre en móvil, sin ranking ni tolerancia a acentos).
- `normalized_name` (vía `src/lib/normalize.ts`) ya permite comparación sin acentos/mayúsculas.

**Diseño propuesto**
- **Migración** `products_habits`:
  - `alter table products add column purchase_count int not null default 0;`
  - `alter table products add column last_purchased_at timestamptz;`
  - Backfill desde el historial: `purchase_count` = nº de líneas en `receipt_items` con ese `product_id` (`added_to_inventory = true`).
- **Señales:** incrementar `purchase_count` y `last_purchased_at` en los dos puntos donde algo entra al inventario por compra:
  - `checkoutAction` (lista) y `confirmReceiptAction` (`src/features/receipts/actions.ts`), tras resolver `productId`.
- **Autocompletado propio** (sustituir el `<datalist>`):
  - La página `/lista` pasa al cliente el catálogo ligero: `{ id, name, normalizedName, defaultUnit, defaultLocation, purchaseCount }` (los catálogos por hogar son pequeños; filtrar en cliente).
  - Componente `ProductAutocomplete`: al escribir ≥ 1 letra, muestra hasta ~6 sugerencias filtradas por `normalizedName.includes(normalize(query))`, ordenadas por `purchaseCount` desc y después alfabético. Cada sugerencia muestra nombre + badge de ubicación ("Nevera", "Despensa", "Congelador") y unidad por defecto.
  - Tocar una sugerencia → `addProductToListAction(productId)` directamente (ya existe). Enter con texto libre → comportamiento actual (`addListItemAction`).
  - Lista de sugerencias como popover/panel bajo el input con roles ARIA de combobox (`role="listbox"`, `aria-activedescendant`), targets ≥ 44px.
- **Sección "Habituales"** (opcional pero recomendada): bajo el formulario, chips con los productos con `purchase_count >= 2` que **no** están en la lista ni tienen stock (> 0) en inventario → añadir de un toque.

**Pasos**
- [x] Migración + backfill + regenerar tipos.
- [x] Incrementar contadores en `checkoutAction` y `confirmReceiptAction`.
- [x] Query en `/lista` que devuelva el catálogo ligero ordenado por habitualidad.
- [x] Componente `ProductAutocomplete` accesible; integrarlo en `add-item-form.tsx`.
- [x] Sección "Habituales" con chips de un toque.

> **Nota de implementación (A2):** migración `supabase/migrations/20260720073534_products_habits.sql`
> (columnas `purchase_count`/`last_purchased_at`, backfill desde `receipt_items` y función atómica
> `bump_product_purchase`). **YA APLICADA en remoto** (verificado 2026-07-20 con
> `npx supabase migration list --linked`: `local == remote` para todas las migraciones hasta A2). El proyecto
> está enlazado por CLI (`supabase/.temp/linked-project.json`); la advertencia previa de "no enlazado /
> pendiente" quedó obsoleta. Tipos en `src/lib/supabase/types.ts` mantenidos a mano.

**Criterios de aceptación**
- Con "Leche" comprada previamente, escribir "le" muestra "Leche" primero, con badge "Nevera".
- Tocar la sugerencia añade el item ya vinculado al producto (con su unidad), y al finalizar la compra entra en la nevera.
- El buscador ignora acentos/mayúsculas ("platano" encuentra "Plátano").

---

### A3 — Revisión de caducidades tras la compra + "consumir pronto"

**Idea original:** al finalizar una compra, una página **opcional** para poner fecha de caducidad a cada producto; y si no, poder marcar un producto como "consumir pronto" (p. ej. "se está poniendo duro el pan de molde").

**Contexto actual**
- `inventory_items` ya tiene `expiry_date` (editable a mano en `edit-item-drawer.tsx`), y el prompt del menú ya prioriza lo que caduca (`getExpiryStatus` en `src/lib/dates.ts`).
- Hay **dos** entradas al inventario por compra: `checkoutAction` (lista) y `confirmReceiptAction` (ticket). Ninguna devuelve los items de inventario tocados.

**Diseño propuesto**
- **Migración** `inventory_use_soon`:
  - `alter table inventory_items add column use_soon boolean not null default false;`
- **Recoger los items tocados:** `checkoutAction` y `confirmReceiptAction` acumulan los `inventory_items.id` insertados/actualizados y los devuelven (`{ ok, added, inventoryItemIds }`).
- **Página de revisión** `src/app/(app)/inventario/revision/page.tsx?items=id1,id2…`:
  - Server Component que carga esos items (RLS ya protege por hogar) con producto y ubicación.
  - Lista cliente: por fila, nombre + ubicación + cantidad, presets rápidos de caducidad (**+3 días · +1 semana · +1 mes · fecha exacta** con `<input type="date">`) y toggle "Consumir pronto". Todo opcional; botón primario "Guardar" y secundario "Omitir" (vuelve a `/inventario`).
  - Server Action `saveExpiryReviewAction` que actualiza `expiry_date` / `use_soon` en lote.
- **Navegación:** tras checkout con éxito, `shopping-list-view.tsx` navega a la página de revisión (si hubo items); tras confirmar ticket, `receipt-review.tsx` igual. Mostrar antes el toast de éxito actual.
- **Inventario:** badge "Consumir pronto" (token `warning`) en `inventory-item-card.tsx` cuando `use_soon`; toggle en `edit-item-drawer.tsx`; los items `use_soon` ordenan/agrupan junto a los que caducan pronto.
- **Menú IA:** en `generateMenuAction`, las líneas de inventario con `use_soon` se marcan en el prompt como "(consumir pronto)" con la misma prioridad que una caducidad inminente.
- Al consumir/agotar el item (cantidad a 0) o editarlo, `use_soon` se puede desmarcar manualmente; no automatizar más por ahora.

**Pasos**
- [x] Migración + regenerar tipos.
- [x] `checkoutAction` y `confirmReceiptAction` devuelven `inventoryItemIds`.
- [x] Página `/inventario/revision` + `saveExpiryReviewAction` con presets y toggle.
- [x] Redirecciones tras compra y tras ticket (con opción clara de omitir).
- [x] Badge + toggle "Consumir pronto" en inventario; orden con prioridad.
- [x] Marcar `use_soon` en el prompt del menú.

> **Nota de implementación (A3):** migración `supabase/migrations/20260720101500_inventory_use_soon.sql`
> (columna `inventory_items.use_soon boolean not null default false`). Tipos actualizados a mano en
> `src/lib/supabase/types.ts`. **El proyecto SÍ está enlazado por CLI** (`supabase/.temp/linked-project.json`,
> ref `mxnbvgcaedaccpxefqiq`) y todas las migraciones anteriores —incluida la de A2 `20260720073534`—
> **ya están aplicadas en remoto** (verificado con `npx supabase migration list --linked`). Solo esta
> migración de A3 queda pendiente: aplicarla con `npx supabase db push` (requiere autorización del usuario;
> hasta entonces `/inventario` y `/menus` fallarán al leer `use_soon`).

**Criterios de aceptación**
- Finalizar compra con 3 items marcados → aparece la página con esos 3; asignar "+1 semana" a uno y omitir el resto funciona.
- Marcar "consumir pronto" en el pan de molde → badge de aviso en inventario y aparece priorizado al generar menú.
- No pasar por la página (omitir) no deja nada a medias.

---

## Bloque B — Recetario del hogar (fundación de los menús 2.0)

### B1 — CRUD de recetas con tipo de comida y temporada

**Idea original:** poder añadir recetas con ingredientes, diferenciando si son de comida, cena o ambas, para que la generación de menús las tenga en cuenta junto al stock. También diferenciar recetas de invierno/verano (una sopa solo en invierno).

**Contexto actual**
- Las tablas ya existen (`supabase/migrations/20260719143638_menus.sql`): `recipes` (con `meal_types text[]`, `source 'manual'|'ai'`) y `recipe_ingredients` (con `product_id` opcional hacia el catálogo).
- **No hay ninguna UI de recetas**: hoy solo las crea la IA al generar menú, una fila nueva por plato generado (la tabla se llena de recetas efímeras).
- La navegación inferior (`src/components/layout/bottom-nav.tsx`) está completa (5 tabs) → el acceso a recetas irá desde la página de Menús.

**Diseño propuesto**
- **Distinguir recetario de recetas efímeras.** Migración `recipes_recetario`:
  - `alter table recipes add column is_saved boolean not null default false;` — `true` = pertenece al recetario del hogar. Backfill: `update recipes set is_saved = true where source = 'manual';`
  - `alter table recipes add column seasons text[] not null default '{all}';` — valores: `all`, `winter`, `summer` (extensible). Regla de mapeo para España: `winter` = octubre–abril, `summer` = mayo–septiembre; helper `getCurrentSeason(date)` en `src/lib/dates.ts`.
  - `alter table recipes add column normalized_name text;` + backfill con la misma lógica de `src/lib/normalize.ts` + índice `(household_id, normalized_name) where is_saved` (único parcial) para deduplicar el recetario.
- **Feature nueva** `src/features/recipes/{components,actions.ts,queries.ts,schemas.ts}`:
  - Página `/recetas`: listado de recetas guardadas (tarjetas con nombre, chips de `meal_types` — "Comida"/"Cena"/ambas — y de temporada — "Todo el año"/"Invierno"/"Verano" —, nº de ingredientes), buscador y filtro por tipo. Estado vacío con CTA "Añade tu primera receta".
  - Crear/editar en página propia (`/recetas/nueva`, `/recetas/[id]`): el formulario es largo (nombre, descripción, raciones, minutos, tipos de comida como toggles, temporada, instrucciones, lista dinámica de ingredientes con nombre + cantidad + unidad + opcional). Un formulario así no cabe bien en un bottom sheet; reservar drawers para acciones rápidas (borrar, valorar).
  - Al guardar ingredientes, vincular `product_id` si `normalized_name` del ingrediente coincide con un producto del catálogo (así el generador sabrá qué hay en stock).
  - Acciones: `createRecipeAction`, `updateRecipeAction`, `deleteRecipeAction` (borrar = si la receta está usada en menús, `menu_entries.recipe_id` ya hace `on delete set null`; confirmar antes).
- **Adoptar recetas de la IA:** en el menú (`menu-view.tsx`), al tocar una entrada con receta generada, botón "Guardar en mi recetario" → `is_saved = true` (y pedir/editar `meal_types`/`seasons` si se quiere). Es la vía natural de poblar el recetario.
- **Acceso:** botón/enlace "Mis recetas" en la cabecera de `/menus`.

**Pasos**
- [x] Migración (`is_saved`, `seasons`, `normalized_name` + backfills + único parcial) + regenerar tipos.
- [x] Helper `getCurrentSeason` en `src/lib/dates.ts` con tests mentales documentados (oct–abr = invierno).
- [x] Feature `recipes`: schemas (zod), queries (listado con ingredientes), actions.
- [x] Página `/recetas` (listado + buscador + filtros) y páginas de crear/editar con lista dinámica de ingredientes.
- [x] Vinculación ingrediente→producto por nombre normalizado al guardar.
- [x] Botón "Guardar en mi recetario" sobre recetas generadas por IA en el menú.
- [x] Enlace "Mis recetas" desde `/menus`.

> **Nota de implementación (B1):** migración `supabase/migrations/20260720120000_recipes_recetario.sql`
> (`recipes.is_saved`, `recipes.seasons text[] default '{all}'`, `recipes.normalized_name` + backfills +
> índice único parcial `recipes_saved_normalized_idx (household_id, normalized_name) where is_saved`).
> Tipos actualizados a mano en `src/lib/supabase/types.ts`. Feature nueva en `src/features/recipes/`
> (`schemas.ts`, `queries.ts`, `actions.ts`, `components/{recipe-form,recipes-list}.tsx`, `constants.ts`);
> páginas en `src/app/(app)/recetas/{page,nueva/page,[id]/page}.tsx`. Helper `getCurrentSeason` en
> `src/lib/dates.ts`. `getMenuEntries` ahora trae `is_saved`/`source`; `menu-view.tsx` muestra "Guardar en
> mi recetario" solo sobre recetas IA no guardadas; `generateMenuAction` fija `normalized_name` en las
> efímeras. **Migración PENDIENTE en remoto** (verificado con `npx supabase migration list --linked`:
> `20260720120000`). **YA APLICADA en remoto** (autorizada por el usuario y verificada con
> `npx supabase migration list --linked`: `local == remote` en todas). `npx tsc --noEmit` y
> `npx eslint` limpios.

**Criterios de aceptación**
- Crear "Lentejas con verduras" (Comida, Invierno) con 6 ingredientes; aparece en el listado con sus chips y sobrevive a recargas.
- Un ingrediente llamado "Lentejas" queda vinculado al producto "Lentejas" del catálogo si existe.
- Guardar una receta generada por IA la hace aparecer en `/recetas`.
- Las recetas efímeras de la IA (no guardadas) **no** aparecen en `/recetas`.

---

### B2 — Gustos y apetencia

**Idea original:** que la app sepa cuánto te gusta una comida y cuánto te suele apetecer hacerla.

**Contexto actual**
- No existe ninguna señal explícita ni implícita. Tras B1 hay recetario; los menús (`menu_entries`) referencian recetas, lo que permite derivar frecuencia de uso.

**Diseño propuesto — dos señales complementarias**
1. **Gusto explícito (por miembro):** migración `recipe_ratings`:
   - `create table recipe_ratings (id uuid pk, household_id uuid refs households, recipe_id uuid refs recipes on delete cascade, user_id text not null, rating smallint not null check (rating between 1 and 5), created_at, updated_at, unique (recipe_id, user_id));` + RLS por hogar (mismo patrón `is_household_member` del resto de tablas).
   - UI: estrellas 1–5 en la tarjeta/página de receta (valoración del usuario actual, targets táctiles generosos) y media del hogar visible ("★ 4,5 · 2 votos"). Acción `rateRecipeAction` (upsert).
2. **Apetencia implícita (uso real):** migración sobre `menu_entries`:
   - `alter table menu_entries add column cooked_at date;` — al marcar "Lo cocinamos" en una entrada (botón en el drawer de la entrada del menú, disponible para el día actual o pasado). Sin contadores denormalizados: `veces planificada`, `veces cocinada` y `última vez` se derivan por query.
   - Query `getRecipeSignals(householdId)` en `src/features/recipes/queries.ts`: por receta guardada → `avgRating`, `timesPlanned`, `timesCooked`, `lastCookedAt`. La usará C3 para el prompt, y `/recetas` para mostrar "Hecha 4 veces · última hace 12 días".
- **Interpretación para el generador (documentar en el código):** apetencia alta = se cocina a menudo y hace poco que no se hace; una receta con rating alto pero cocinada ayer debe descansar unos días; una con rating alto no cocinada en semanas es candidata ideal.

**Pasos**
- [x] Migración `recipe_ratings` + `menu_entries.cooked_at` + RLS + regenerar tipos.
- [x] `rateRecipeAction` + componente de estrellas accesible (radiogroup con labels).
- [x] Botón "Lo cocinamos" en el drawer de entrada del menú (solo fechas ≤ hoy) → `cooked_at = date` de la entrada; permitir desmarcar.
- [x] `getRecipeSignals` + mostrar señales en `/recetas` (media, veces hecha, última vez).

> **Nota de implementación (B2):** migración `supabase/migrations/20260720140000_recipe_ratings.sql`
> (tabla `recipe_ratings` con `rating smallint 1–5`, `unique (recipe_id, user_id)`, RLS
> `is_household_member` + grants; `alter table menu_entries add column cooked_at date` + índice
> parcial `menu_entries_cooked_idx`). Tipos actualizados a mano en `src/lib/supabase/types.ts`
> (tabla `recipe_ratings` + `menu_entries.cooked_at`). En `src/features/recipes/`:
> `ratingSchema` (schemas), `getRecipeRating`/`getRecipeSignals` (queries, con la interpretación
> para C3 documentada en el JSDoc de `getRecipeSignals`), `rateRecipeAction` (upsert, actions),
> `formatRating` (constants) y componente `components/recipe-rating.tsx` (radiogroup accesible con
> roving tabindex + flechas, targets 44px, media optimista). En `src/features/menus/`:
> `toggleEntryCookedAction` (actions, fija `cooked_at` con la fecha de la entrada y valida ≤ hoy;
> permite desmarcar), `MenuEntry.cookedAt` (queries) y botón "Lo cocinamos / Cocinado · deshacer"
> en el drawer de `menu-view.tsx` (solo con entrada guardada y fecha ≤ hoy). `getRecipeSignals`
> se muestra en `/recetas` ("★ 4,5 · N votos" y "Hecha N veces · última vez …"); helper
> `relativeDaysLabel` en `src/lib/dates.ts`. `npx tsc --noEmit` y `npx eslint` limpios.
> **Migración YA APLICADA en remoto** (verificado 2026-07-20 con `npx supabase migration list --linked`:
> `20260720140000` con `local == remote`; se aplicó en el mismo `db push` autorizado de C1).

**Criterios de aceptación**
- Dos miembros pueden valorar la misma receta y se ve la media.
- Marcar "Lo cocinamos" en una entrada de ayer actualiza "última vez" en la receta.
- `getRecipeSignals` devuelve datos coherentes para usarse en C3.

---

## Bloque C — Generador de menús 2.0

### C1 — Varios platos por comida/cena

**Idea original:** permitir más de un plato en comidas y cenas (primero + segundo, plato + guarnición…).

**Contexto actual**
- `menu_entries` tiene `unique (menu_id, date, meal_slot)` → **una fila por hueco**. La UI (`menu-view.tsx`) y `setMenuEntryAction` asumen un solo plato por hueco.
- El schema de IA (`src/lib/ai/menu-schema.ts`) devuelve un plato por slot.

**Diseño propuesto**
- **Migración** `menu_entries_multi`:
  - `alter table menu_entries drop constraint menu_entries_menu_id_date_meal_slot_key;` (verificar el nombre real en la BD antes).
  - `alter table menu_entries add column position int not null default 0;`
  - Nuevo único: `unique (menu_id, date, meal_slot, position)`; la app gestiona posiciones 0..n.
- **Backend:** rehacer `setMenuEntryAction` como acciones por-entrada: `addMenuEntryAction(weekStart, date, slot, texto)`, `updateMenuEntryAction(entryId, texto)`, `removeMenuEntryAction(entryId)`. `addMissingToListAction` no cambia (itera entradas). Queries ordenan por `position`.
- **UI:** la celda del hueco muestra la lista de platos (1 línea por plato) + botón "Añadir plato". El drawer pasa a editar **un plato concreto** (editar texto / quitar), no el hueco entero.
- **IA:** en `menu-schema.ts`, cada meal pasa de plato único a `dishes: []` (máx. 2) con los mismos campos; el prompt indica que la comida puede llevar dos platos (primero ligero + segundo) cuando tenga sentido y la cena normalmente uno. El bucle de inserción de `generateMenuAction` crea una `menu_entry` por plato con `position` incremental.

**Pasos**
- [x] Migración (quitar único, añadir `position`, nuevo único) + regenerar tipos.
- [x] Acciones por-entrada + queries con orden.
- [x] UI de hueco multi-plato + drawer por plato.
- [x] Schema y prompt de IA con `dishes[]`; bucle de inserción actualizado.

> **Nota de implementación (C1):** migración `supabase/migrations/20260720160000_menu_entries_multi.sql`.
> En vez de fiarse del nombre autogenerado del único, un bloque `DO` localiza el constraint único por su
> conjunto exacto de columnas `{date, meal_slot, menu_id}` y lo elimina (robusto ante el nombre real);
> luego `add column position int not null default 0` y nuevo único
> `menu_entries_menu_id_date_meal_slot_position_key (menu_id, date, meal_slot, position)`. Idempotente.
> Tipos actualizados a mano en `src/lib/supabase/types.ts` (`menu_entries.position`). En
> `src/features/menus/`: `setMenuEntryAction` se sustituye por `addMenuEntryAction` (calcula la
> siguiente `position` del hueco) / `updateMenuEntryAction` (edita texto y desvincula receta; texto
> vacío ⇒ quita) / `removeMenuEntryAction`; `generateMenuAction` itera `meal.dishes` (máx. 2) creando
> una `menu_entry` por plato con `position` incremental; `addMissingToListAction` sin cambios.
> `getMenuEntries` trae `position` y ordena por `date, meal_slot, position`; `MenuEntry` gana `position`.
> IA: `menu-schema.ts` cambia `recipe_name/description/ingredients` por plato único a `dishes: [].min(1).max(2)`;
> `menu-prompt.ts` explica que la comida puede llevar 2 platos y la cena normalmente 1. UI
> (`menu-view.tsx`): cada hueco lista sus platos (1 botón por plato) + botón "Añadir plato"; el drawer
> edita/añade UN plato (indicador ✔ de cocinado en la celda; se conservan "Lo cocinamos" por entrada y
> "Guardar en mi recetario"). `npx tsc --noEmit` y `npx eslint .` limpios.
> **YA APLICADA en remoto** (autorizada por el usuario 2026-07-20 y verificada con
> `npx supabase migration list --linked`: `20260720160000` con `local == remote`). Nota: hizo falta
> castear `att.attname::text` en el bloque `DO` (comparación `name[] = text[]` no tiene operador).
> Verificación de criterios limitada: `/menus` compila y carga (redirige al login de Clerk, sin
> error de esquema); el flujo interactivo con sesión iniciada no es verificable en modo headless.

**Criterios de aceptación**
- Añadir manualmente 2 platos a la comida del martes y quitar solo uno funciona.
- Generar menú produce comidas con 1–2 platos sin filas duplicadas ni errores de constraint.
- "Añadir a la lista lo que falte" sigue funcionando con menús multi-plato.

---

### C2 — Reglas del menú

**Idea original:** reglas internas tipo "quiero que esta comida esté al menos una vez por semana".

**Contexto actual**
- No existe nada parecido. Tras B1 hay recetas guardadas que referenciar.

**Diseño propuesto**
- **Migración** `menu_rules`:
  - `create table menu_rules (id uuid pk, household_id uuid refs households on delete cascade, kind text not null check (kind in ('recipe_min_week','recipe_max_week','free_text')), recipe_id uuid refs recipes on delete cascade, value int check (value between 1 and 7), text_rule text, active boolean not null default true, created_at);`
  - Check de coherencia: (`kind` like `recipe_%` → `recipe_id` y `value` no nulos) / (`free_text` → `text_rule` no nulo). RLS por hogar.
- **UI:** sección "Reglas del menú" en `/menus` (colapsable o bajo el calendario): lista de reglas activas con toggle activar/desactivar y borrar. Alta en drawer con dos modos:
  - *Frecuencia de receta:* selector de receta guardada + "al menos / como mucho" + "X veces por semana".
  - *Regla libre:* texto ("los viernes cena de picoteo", "sin pescado los lunes") que se inyecta tal cual al prompt.
- **Aplicación (se completa en C3):**
  - Todas las reglas activas se listan en el prompt como restricciones obligatorias.
  - Validación post-generación **determinista de las `recipe_min_week`**: si tras generar falta una receta requerida, sustituir una entrada de un hueco compatible con sus `meal_types` (elegido al azar entre los que no rompan otra regla) por esa receta. Para `recipe_max_week`, si la IA se excede, reemplazar el exceso por la alternativa que proponga el propio menú o dejar el hueco en texto libre "(elegir plato)". Las `free_text` no se validan (solo prompt).

**Pasos**
- [x] Migración + RLS + regenerar tipos.
- [x] Feature: queries + acciones (`createRuleAction`, `toggleRuleAction`, `deleteRuleAction`).
- [x] UI de reglas en `/menus` (lista + drawer de alta con los dos modos).
- [x] Dejar preparada `validateAndPatchRules(menu, rules)` (pura, testeable) para C3.

> **Nota de implementación (C2):** migración `supabase/migrations/20260720170000_menu_rules.sql`
> (tabla `menu_rules` con `kind` check, `recipe_id` refs recipes `on delete cascade`, `value int 1..7`,
> `text_rule`, `active bool default true`, `created_at`; CHECK de coherencia `menu_rules_shape`
> —recipe_% ⇒ recipe_id+value no nulos y text_rule null; free_text ⇒ text_rule no nulo y recipe_id/value
> null—; índices por hogar y receta; RLS `is_household_member` + grants). Tipos añadidos a mano en
> `src/lib/supabase/types.ts` (`menu_rules`). En `src/features/menus/`:
> `rules.ts` (módulo PURO, sin I/O: tipos `MenuRuleKind`/`MenuStructure`/`MenuDish`/`ValidatableRule` +
> `validateAndPatchRules`, con `MAX_DISHES_PER_SLOT`=2 y `PLACEHOLDER_DISH_TEXT`="(elegir plato)");
> `schemas.ts` (`menuRuleInputSchema`, unión discriminada por `kind`); `queries.ts` gana
> `getMenuRules()` (activas e inactivas, con nombre de receta, orden activas→antigüedad); `actions.ts`
> gana `createRuleAction`/`toggleRuleAction`/`deleteRuleAction`; `components/menu-rules.tsx` (sección
> colapsable con lista + Switch activar/desactivar + borrar, y Drawer de alta con dos modos: frecuencia
> de receta [Select + "al menos/como mucho" + veces 1–7] y regla libre [texto]). `menus/page.tsx` carga
> reglas + recetas guardadas en paralelo y renderiza `<MenuRules>` bajo `<MenuView>`.
>
> `validateAndPatchRules(menu, rules)` (para C3): aplica primero los máximos (recorta excesos a
> marcadores "(elegir plato)") y luego los mínimos (añade la receta en huecos compatibles con sus
> `meal_types`; si no hay sitio libre <2 platos, sustituye un plato reemplazable —marcador, inventado,
> o receta guardada no protegida por su propio mínimo—; nunca duplica en el mismo hueco). Determinista
> (sin `Math.random`) y no muta la entrada. `free_text` no se valida (solo prompt). Los platos llevan
> `savedRecipeId`/`name`/`placeholder?`/`payload?` para que C3 sepa insertar: receta guardada ⇒
> `menu_entries.recipe_id` directo; marcador ⇒ `free_text`; inventado ⇒ receta efímera desde `payload`.
>
> **Migración YA APLICADA en remoto** (autorizada por el usuario 2026-07-20 y verificada con
> `npx supabase migration list --linked`: `20260720170000` con `local == remote`). `npx tsc --noEmit`
> y `npx eslint .` limpios. Verificación de preview limitada: el dev server propio no se mantiene por
> conflicto de `.next` con otro dev server activo en la carpeta (mismo límite headless/Clerk que C1);
> criterios de UI no verificados interactivamente.

**Criterios de aceptación**
- Crear "Lentejas al menos 1 vez por semana" y verla activa en `/menus`.
- Desactivar una regla hace que deje de aplicarse en la siguiente generación (C3).
- Las reglas pertenecen al hogar (las ve/edita cualquier miembro).

---

### C3 — Generador de menús 2.0 (integración total)

**Idea original (síntesis):** que la generación con IA tenga en cuenta el recetario y sus tipos de comida, el stock real, los gustos/apetencia, la temporada y las reglas.

**Contexto actual (tras A3, B1, B2, C1, C2)**
- `generateMenuAction` (`src/features/menus/actions.ts`) solo pasa inventario al prompt y **crea una receta nueva por cada plato generado** (contamina la tabla).
- Ya existen: recetario con `meal_types`/`seasons`, señales (`getRecipeSignals`), reglas (`menu_rules`), inventario con `use_soon`, entradas multi-plato.

**Diseño propuesto**
- **Entradas del prompt** (`buildMenuPrompt` reescrito con un objeto de contexto):
  1. Inventario con cantidades, caducidades y marca "(consumir pronto)".
  2. Recetario guardado **filtrado por temporada actual** (`seasons` contiene `all` o la temporada de `getCurrentSeason(hoy)`) con: id, nombre, tipos de comida, rating medio, veces cocinada, última vez, e ingredientes con marca de "en stock" (vía `product_id` + inventario).
  3. Reglas activas (las de frecuencia expresadas en lenguaje claro + las libres tal cual).
  4. Fecha/temporada actual, para que los platos nuevos que invente también sean de temporada.
- **Instrucciones al modelo:** preferir recetas del recetario (sobre todo las de rating alto que hace tiempo que no se cocinan), respetar `meal_types` (una receta solo-cena no va a comida), no repetir receta en la semana salvo que una regla lo pida, completar con platos nuevos si el recetario no da para 7 días, y priorizar stock/caducidades como hasta ahora.
- **Schema:** cada plato añade `saved_recipe_id: string | null` (el id del recetario si se usa una guardada). Fallback defensivo: si viene `null` pero `normalized_name` del plato coincide con una receta guardada, vincular igualmente.
- **Inserción sin contaminar:** si el plato referencia receta guardada → `menu_entries.recipe_id` apunta a ella directamente (no crear fila nueva). Solo los platos realmente nuevos crean receta efímera (`is_saved = false`).
- **Validación de reglas:** aplicar `validateAndPatchRules` (C2) tras la generación y antes de insertar.
- **Limpieza (housekeeping):** al regenerar el menú de una semana, borrar las recetas efímeras (`is_saved = false`) que queden huérfanas (sin `menu_entries` que las referencien).

**Pasos**
- [x] Reescribir `buildMenuPrompt` con el objeto de contexto completo (inventario + recetario filtrado + señales + reglas + temporada).
- [x] Añadir `saved_recipe_id` al schema de IA + fallback por nombre normalizado.
- [x] Inserción que vincula recetas guardadas y solo crea efímeras cuando toca.
- [x] Integrar `validateAndPatchRules` post-generación.
- [x] Limpieza de recetas efímeras huérfanas al regenerar.
- [ ] Revisar el resultado con datos reales: temporada correcta, reglas cumplidas, recetas guardadas enlazadas (visible porque "Guardar en mi recetario" no aparece en las ya guardadas). — PENDIENTE de verificación manual (requiere sesión Clerk + llamada a Gemini; no verificable en modo headless).

> **Nota de implementación (C3):** sin migración nueva (reutiliza tablas de A3/B1/B2/C1/C2).
> `src/lib/ai/menu-schema.ts`: cada plato gana `saved_recipe_id: string|null`.
> `src/lib/ai/menu-prompt.ts`: `buildMenuPrompt(context)` reescrito con `MenuPromptContext`
> (today, season, inventory, recipes [ya filtradas por temporada, con id/nombre/tipos/rating/veces
> cocinada/última vez/ingredientes con marca "en casa"], rules [frecuencia en lenguaje claro + libres]).
> `src/features/recipes/queries.ts`: nueva `getSavedRecipesForMenu()` (recetas guardadas con
> ingredientes + `product_id`, sin filtrar por temporada). `src/features/menus/actions.ts`:
> `generateMenuAction` reescrita — reúne inventario + recetario + `getRecipeSignals` + `getMenuRules`
> en paralelo, filtra el recetario por `getCurrentSeason()`, marca ingredientes en stock (por
> `product_id` o nombre normalizado, cantidad>0), construye la `MenuStructure` (cada plato con
> `savedRecipeId` resuelto por id explícito o fallback por nombre normalizado contra TODO el recetario,
> y `payload` con descripción/ingredientes), aplica `validateAndPatchRules` con las reglas activas
> enriquecidas con `{name, mealTypes}` de la receta, e inserta SIN contaminar: receta guardada ⇒
> `menu_entries.recipe_id` directo (misma id, señales siguen acumulando); marcador ⇒ `free_text`
> "(elegir plato)"; plato inventado ⇒ receta efímera `is_saved=false` desde el payload. Housekeeping
> `cleanupOrphanEphemeralRecipes` borra las efímeras sin `menu_entries` que las referencien tras
> regenerar. `npx tsc --noEmit` y `npx eslint .` limpios. `validateAndPatchRules` verificada con un
> arnés (esbuild+node, 12 asserts: mínimos por adición/sustitución, máximos a marcador, protección de
> mínimos ajenos, free_text inerte, no-mutación de la entrada). Verificación en preview no posible por
> conflicto de `.next` con otro dev server activo + login Clerk headless (mismo límite que C1/C2); el
> último paso (revisión con datos reales) queda para el usuario con sesión iniciada.

**Criterios de aceptación**
- Con "Sopa de cocido" marcada como invierno, en julio no aparece en el menú generado.
- Con la regla "Lentejas ≥ 1/semana", todo menú generado contiene lentejas al menos una vez, en un hueco compatible (comida).
- Una receta guardada usada por la IA enlaza a la fila original del recetario (misma id) y sus señales de uso siguen acumulándose.
- Recetas con rating 5 aparecen más que las de rating 2 a lo largo de varias generaciones; ninguna receta solo-cena aparece en comida.
- La tabla `recipes` no crece indefinidamente al regenerar la misma semana varias veces.

> **Prompt para el siguiente agente (C3 — Generador de menús 2.0):**
>
> ```
> Continúa con el proyecto Stash (C:\Users\Jorge\Desktop\Food). Lee primero AGENTS.md
> (sistema de diseño, tokens semánticos, touch targets ≥44px, drawers en móvil, UI en
> español) y las "Instrucciones para el agente" al inicio de TODO.md. A1, A2, A3, B1, B2, C1
> y C2 ya están terminadas y marcadas. C3 es la ÚLTIMA tarea del plan.
>
> Estado de la BD: proyecto enlazado por CLI (supabase/.temp/linked-project.json, ref
> mxnbvgcaedaccpxefqiq). Todas las migraciones hasta 20260720170000_menu_rules están en remoto
> (verifícalo con `npx supabase migration list --linked`, solo lectura). Los tipos en
> src/lib/supabase/types.ts se mantienen a mano. C3 probablemente NO necesita migración nueva;
> si la necesitaras, pide autorización antes de `npx supabase db push`.
>
> Contexto ya disponible:
> * Recetario (B1): recipes con is_saved, meal_types[], seasons[] ('all'|'winter'|'summer'),
>   normalized_name. getSavedRecipes() y getRecipeForEdit() en src/features/recipes/queries.ts;
>   getCurrentSeason(date) en src/lib/dates.ts (invierno oct–abr, verano may–sep).
> * Señales (B2): getRecipeSignals(householdId) → avgRating/ratingCount/timesPlanned/timesCooked/
>   lastCookedAt por receta guardada, con la interpretación para C3 documentada en su JSDoc.
> * Multi-plato (C1): menu_entries admite varios platos por hueco (position); generateMenuAction
>   inserta una menu_entry por plato; menu-schema.ts usa meals[].dishes[] (máx. 2).
> * Reglas (C2): getMenuRules() en src/features/menus/queries.ts (activas e inactivas). El módulo
>   PURO src/features/menus/rules.ts exporta validateAndPatchRules(menu, rules) + los tipos
>   MenuStructure/MenuDay/MenuMeal/MenuDish/ValidatableRule y las constantes MAX_DISHES_PER_SLOT y
>   PLACEHOLDER_DISH_TEXT. Cada MenuDish lleva savedRecipeId/name/placeholder?/payload?: para insertar,
>   savedRecipeId != null ⇒ menu_entries.recipe_id directo (NO crear receta); placeholder ⇒ free_text
>   "(elegir plato)"; savedRecipeId null y no placeholder ⇒ receta efímera (is_saved=false) desde payload.
>
> Implementa ÚNICAMENTE la tarea C3 tal como está en TODO.md (sección "Bloque C → C3"):
> * Reescribe buildMenuPrompt (src/lib/ai/menu-prompt.ts) con un objeto de contexto completo:
>   inventario (cantidades, caducidades, "(consumir pronto)"), recetario FILTRADO por temporada actual
>   (seasons incluye 'all' o getCurrentSeason(hoy)) con id/nombre/meal_types/señales/ingredientes con
>   marca "en stock", reglas activas (frecuencia en lenguaje claro + libres tal cual) y fecha/temporada.
> * Añade saved_recipe_id: string|null a cada plato en menu-schema.ts; fallback: si viene null pero el
>   normalized_name del plato coincide con una receta guardada, vincúlala igual.
> * En generateMenuAction: construir la MenuStructure desde la respuesta (payload = descripción+
>   ingredientes del plato inventado), aplicar validateAndPatchRules(menu, reglasActivas enriquecidas
>   con {name, mealTypes} de cada receta), y luego insertar SIN contaminar: receta guardada ⇒ recipe_id
>   directo; inventada ⇒ receta efímera; marcador ⇒ free_text. Housekeeping: al regenerar, borrar las
>   recetas efímeras (is_saved=false) que queden huérfanas (sin menu_entries que las referencien).
>
> Al terminar: verifica los criterios de aceptación de C3, ejecuta `npx tsc --noEmit` y `npx eslint .`,
> marca las casillas de C3 y del estado global en TODO.md. Con C3, el plan queda completo.
> ```

---

## Notas de alcance (decisiones tomadas)

- **Desayunos:** la BD admite `breakfast` pero la UI de menús solo usa comida/cena; se mantiene así en todas estas tareas.
- **Temporadas:** modelo simple de dos estaciones para España (invierno oct–abr, verano may–sep) + "todo el año". Si algún día hace falta primavera/otoño, `seasons text[]` lo admite sin migración.
- **Valoraciones por miembro** (no por hogar): "cuánto te gusta" es personal; el generador usa la media del hogar.
- **Apetencia** se deriva del uso real (planificada/cocinada/recencia), no se pide al usuario un segundo rating.
- **Reglas MVP:** frecuencia por receta + texto libre. Reglas por categoría ("legumbres 2×/semana") quedan fuera por ahora; el modelo de tabla (`kind`) permite añadirlas luego.
