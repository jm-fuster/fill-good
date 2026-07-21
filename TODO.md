# TO-DO — Mejoras de Fill Good

Documento de trabajo para implementar las próximas mejoras **progresivamente con agentes de IA**.
Cada tarea es autocontenida: incluye contexto, diseño propuesto, pasos y criterios de aceptación.
Ejecutar las tareas **en orden dentro de cada bloque**; los bloques A, B y C son secuenciales
(A = mejoras rápidas independientes, B = recetario, C = generador de menús 2.0, que depende de B).
El bloque D (revisión de producto del 2026-07-21) contiene tareas **independientes entre sí**,
ordenadas por prioridad; pueden hacerse en cualquier orden, pero D1 y D2 primero.

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
- [x] D1 — Gobernanza del hogar: transferir propiedad y eliminar hogar
- [x] D2 — Estado "Agotado" visible + añadir a la lista de un toque
- [x] D3 — Mejorar "Añadir a la lista lo que falte" del menú (revisión + matching + stock real)
- [x] D4 — Recetario como pestaña dentro de Menús
- [ ] D5 — Compartir el menú semanal (imagen + Web Share, print CSS)
- [ ] D6 — Hint de escaneo: sugerir PDF escaneado con la app nativa
- [ ] D7 — Hint de caducidad: "la fecha del que caduque antes"

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
> Continúa con el proyecto Fill Good (C:\Users\Jorge\Desktop\Food). Lee primero AGENTS.md
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

## Bloque D — Revisión de producto (2026-07-21)

Tareas surgidas de una revisión de producto sobre la app ya funcional. Independientes
entre sí. D1 y D2 son las de mayor impacto; D6 y D7 son microcopys de una tarde.

### D1 — Gobernanza del hogar: transferir propiedad y eliminar hogar

**Idea original:** ¿puede el propietario de un hogar eliminarlo o pasar la propiedad a otro miembro? (Respuesta: hoy no, y es un hueco real.)

**Contexto actual**
- El enum `member_role` (`'owner' | 'member'`) existe desde `supabase/migrations/20260719113713_init.sql`, pero **ninguna política RLS ni RPC lo usa**: toda la autorización es "member-based".
- No hay RPC de transferir propiedad ni de eliminar hogar, y no existe política de DELETE sobre `households` → un hogar cuyo último miembro se va queda huérfano en la BD para siempre.
- `leaveHouseholdAction` (`src/features/household/actions.ts`, ~línea 88) permite que el owner abandone sin más, dejando el hogar sin propietario. **Bug adicional:** el delete filtra solo por `user_id`, sin `household_id` — si algún día hay multi-hogar, sacaría al usuario de todos sus hogares a la vez.

**Diseño propuesto**
- **Migración** `household_governance`:
  - Helper `is_household_owner(hid uuid)` análogo a `is_household_member` (security definer).
  - RPC `transfer_household_ownership(p_household_id uuid, p_new_owner_user_id text)`: solo el owner actual; valida que el destinatario es miembro; en la misma transacción pone al destinatario como `owner` y al anterior como `member`.
  - RPC `delete_household(p_household_id uuid)`: solo el owner; `delete from households` (los `on delete cascade` existentes limpian el resto).
  - RPC `leave_household(p_household_id uuid)` que encapsula las reglas en SQL (la garantía fuerte debe estar en la BD, no solo en la UI): un `member` sale sin más; el `owner` **no puede salir** si quedan otros miembros (excepción `owner_must_transfer`); si es el último miembro, salir = eliminar el hogar completo.
  - Patrón de permisos de la migración init: `revoke execute … from public, anon; grant execute … to authenticated;`.
- **Server Actions** en `src/features/household/actions.ts`: `transferOwnershipAction`, `deleteHouseholdAction`, y reescribir `leaveHouseholdAction` para llamar al RPC `leave_household` (corrigiendo de paso el filtro por hogar). Mensajes de error en español para `owner_must_transfer`.
- **Queries:** exponer el rol del usuario actual (añadir `role` a lo que devuelve `getCurrentHousehold` o una query nueva en `src/features/household/queries.ts`), y una query de miembros del hogar (id de usuario + display_name) para el selector.
- **UI en Ajustes** (`src/app/(app)/ajustes/page.tsx` / `household-card.tsx`), visible solo para el owner:
  - "Transferir propiedad": drawer con selector de miembro + confirmación.
  - "Eliminar hogar": confirmación destructiva (escribir el nombre del hogar o `AlertDialog` con aviso claro de que borra inventario, listas, recetas y menús de todos); botón `variant="destructive"`.
  - Para un `member`, "Abandonar hogar" sigue como está; para el owner con más miembros, el botón de abandonar explica que antes debe transferir.

**Pasos**
- [x] Migración (`is_household_owner` + 3 RPCs + revoke/grant) — aplicada a la BD remota con autorización (`20260721130000_household_governance.sql`).
- [x] Regenerar/actualizar tipos (`src/lib/supabase/types.ts`, se mantienen a mano).
- [x] Server Actions + rol del usuario y miembros en queries (queries ya exponían `role` y `getHouseholdMembers`).
- [x] UI de Ajustes (transferir + eliminar, solo owner) con confirmaciones.
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

**Criterios de aceptación**
- Un `member` que invoque los RPCs directamente recibe excepción de SQL (no basta con ocultar la UI).
- El owner con más miembros no puede abandonar; tras transferir, sí (y el nuevo owner ve los controles).
- El último miembro que abandona elimina el hogar sin dejar filas huérfanas.
- Eliminar hogar pide confirmación explícita y redirige a `/onboarding`.

> **Nota de implementación (D1):** migración `20260721130000_household_governance.sql`
> (aplicada a remoto, sincronizada). `is_household_owner(hid)` replica el patrón de
> `is_household_member` (SQL, stable, security definer). Tres RPCs plpgsql security definer con
> las mismas guardas y `revoke … from public, anon; grant … to authenticated` de la init:
> `transfer_household_ownership(p_household_id, p_new_owner_user_id)` valida owner + que el
> destinatario sea miembro y hace el swap de roles en una transacción;
> `delete_household(p_household_id)` valida owner y hace `delete from households` (los
> `on delete cascade` de todas las tablas con `household_id` limpian el resto — verificado);
> `leave_household(p_household_id)` mueve las reglas a la BD: último miembro → borra el hogar;
> owner con otros miembros → excepción `owner_must_transfer`; member → sale. En
> `src/features/household/actions.ts`: `transferOwnershipAction`, `deleteHouseholdAction` y
> `leaveHouseholdAction` reescrita sobre `leave_household` (corrige el bug de borrar por solo
> `user_id`, ahora filtra por hogar vía RPC) con mensaje en español para `owner_must_transfer`.
> Las queries ya exponían `role` (`getCurrentHousehold`) y miembros (`getHouseholdMembers`), sin
> cambios. UI en `household-card.tsx`: solo el owner ve `TransferOwnershipDrawer` (Select de otros
> miembros) y `DeleteHouseholdDrawer` (escribir el nombre del hogar para habilitar el borrado
> destructivo); el owner con otros miembros ve una nota de que debe transferir antes de abandonar;
> el member conserva "Abandonar hogar". Tokens semánticos (`destructive`, `muted-foreground`),
> drawers de vaul, touch targets por defecto. `npx tsc --noEmit` y `npx eslint .` limpios. La UI
> autenticada de `/ajustes` queda para verificación manual (login de Clerk no verificable en
> headless).

---

### D2 — Estado "Agotado" visible + añadir a la lista de un toque

**Idea original:** al quedar un artículo a 0, ¿debería ser más visualmente reconocible? (Sí: hoy es casi invisible.)

**Contexto actual**
- En `src/features/inventory/components/inventory-item-card.tsx` (~línea 82), con `qty === 0` solo cambia el texto de cantidad a "Agotado" en `text-muted-foreground` — el mismo gris que una cantidad normal. Comparado con los badges de caducidad o "Quedan pocas", el estado más accionable es el que menos destaca.
- Las sugerencias de la lista (`src/features/shopping-list/queries.ts`, ~línea 100) solo cubren productos **con `min_quantity` definida**; un producto a 0 sin mínimo no se sugiere en ningún sitio.
- Semántica de color del proyecto: `destructive` está reservado a caducado/eliminar; para agotado usar `warning` o un neutro fuerte (decidir mirando `/styleguide`).

**Diseño propuesto**
- Cuando `qty === 0` en la tarjeta de inventario:
  - Badge "Agotado" con el mismo patrón visual que los badges existentes en la tarjeta (p. ej. `bg-warning/15 text-warning` o neutro `bg-muted text-foreground` con borde).
  - Rebajar el énfasis del resto de la tarjeta (p. ej. opacidad en icono y nombre), manteniendo contraste AA en badge y botones.
  - Acción de un toque **"Añadir a la lista"** en la tarjeta: reutilizar la Server Action existente de `src/features/shopping-list/actions.ts` que añade un producto del catálogo a la lista (la usa el autocompletado de A2) — **no duplicar lógica**. Si el producto ya está en la lista activa, mostrar el estado ("En la lista", deshabilitado) en vez del botón; feedback con toast.
- Opcional (solo si no complica el código): ordenar los agotados al final de cada categoría en `src/features/inventory/queries.ts`.

**Pasos**
- [x] Badge "Agotado" + bajada de énfasis en `inventory-item-card.tsx` (tokens semánticos, nada inline).
- [x] Botón/acción "Añadir a la lista" con estado "ya en la lista" (pasar desde el server la info de qué productos están en la lista activa, o exponer una query ligera).
- [x] (Opcional) agotados al final de cada categoría.
- [ ] Verificar en preview móvil: touch target ≥ 44px, contraste en ambos temas. — PENDIENTE de verificación manual (requiere sesión Clerk; no verificable en headless). Garantías a nivel de código: botón "Añadir a la lista" y estado "En la lista" con `h-11` (44px), solo tokens semánticos (`warning`, `success`, `muted-foreground`) ya usados en la tarjeta.

> **Nota de implementación (D2):** sin migración (reutiliza `addProductToListAction` de A2 y las
> columnas existentes). En `src/features/inventory/components/inventory-item-card.tsx`: nueva prop
> `onList?: boolean`; con `qty === 0` la tarjeta muestra un badge "Agotado" (`bg-warning/15 text-warning`,
> mismo patrón que los demás badges), rebaja el énfasis del icono (`opacity-50`) y del nombre
> (`text-muted-foreground`), y añade una fila inferior (`border-t`) con acción de un toque: botón
> "Añadir a la lista" (`variant="outline"`, `h-11`, icono `ShoppingCart`) que llama a
> `addProductToListAction(entry.productId)` con `useTransition` + toast; si el producto ya está en la
> lista (prop `onList` del server) o se acaba de añadir (estado local `addedToList`), se muestra el
> estado "En la lista" (icono `Check`, `text-success`, no interactivo) en vez del botón — evita
> duplicados. En `src/features/shopping-list/queries.ts`: nueva `getActiveListProductIds()` (solo
> lectura, devuelve `Set<string>` de `product_id` en la lista activa; no crea lista como
> `getActiveList`). En `src/app/(app)/inventario/page.tsx`: carga `getActiveListProductIds()` en
> paralelo y pasa `onList={onListProductIds.has(entry.productId)}` a cada tarjeta; `urgencyRank`
> manda los agotados (`quantity === 0`) al final de cada ubicación (rank 3). `npx tsc --noEmit` y
> `npx eslint .` limpios. Dev server arranca sin errores; `/inventario` redirige al login de Clerk
> (límite headless conocido), la UI autenticada queda para verificación manual.

**Criterios de aceptación**
- Un artículo a 0 se distingue de un vistazo en el listado (badge, no solo texto gris).
- "Añadir a la lista" funciona con un toque, aparece en `/lista` vinculado al producto (con su unidad y ubicación por defecto), y no crea duplicados si se pulsa dos veces.
- Sin colores inventados; AA en claro y oscuro.

---

### D3 — Mejorar "Añadir a la lista lo que falte" del menú (revisión + matching + stock real)

**Idea original:** ¿tiene sentido generar la lista de la compra con IA? (Respuesta: no hace falta IA — es aritmética de conjuntos; lo que falta es precisión y control.)

**Contexto actual**
- **Ya existe** `addMissingToListAction` (`src/features/menus/actions.ts`, ~línea 501): recorre las recetas del menú, deduplica ingredientes por nombre normalizado, descarta los que están en inventario o en la lista, e inserta el resto. Carencias concretas:
  1. **Cuenta como "en stock" productos a cantidad 0**: `inStock` se construye con todas las filas de inventario sin mirar `quantity` → un ingrediente que tienes agotado NO se añade a la lista.
  2. **Matching solo por nombre exacto normalizado**: "tomate frito" (receta) no casa con "Tomate frito Orlando" (catálogo) → se añade como duplicado conceptual. Ignora además el `product_id` que `recipe_ingredients` ya tiene (B1 lo vincula al guardar).
  3. **Inserta sin paso de revisión**: el usuario no puede desmarcar nada.
  4. **Inserta sin vincular al catálogo** (solo `name` + `unit`): el checkout no puede enviar el producto a su ubicación por defecto.
- La extensión `pg_trgm` está habilitada desde la migración init; `products.normalized_name` existe.

**Diseño propuesto**
- **Matching en tres niveles** al calcular faltantes: (1) `recipe_ingredients.product_id` si existe → comparar contra el stock real de ese producto (`quantity > 0`); (2) nombre normalizado exacto contra `products.normalized_name`; (3) fuzzy con `pg_trgm` vía un RPC `match_product(p_household_id, p_name text)` (o función SQL equivalente) usando `similarity()` sobre `normalized_name`, umbral orientativo 0.4 — ajustar probando. Sin IA; si el trigram no basta, dejar un `TODO` en el código proponiendo Gemini vía `getModel`, pero **no implementarlo** (restricción: cero gasto en IA).
- **Corregir el bug de stock**: "en stock" = suma de `quantity` de las filas de inventario del producto `> 0`.
- **Paso de revisión** antes de insertar (mismo patrón que `receipt-review.tsx`): lista con checkboxes (todo marcado por defecto), mostrando por fila el ingrediente, el producto del catálogo al que ha casado (si hay) y si viene sin match (texto libre). El usuario desmarca lo que no quiere y confirma. Puede ser un drawer sobre `/menus` o una página de revisión.
- **Insertar vinculado**: cuando hay match, insertar el ítem de lista con la referencia al producto (verificar el esquema de `shopping_list_items` en `supabase/migrations/20260719131524_shopping_list.sql`; reutilizar la acción de A2 que añade producto del catálogo si encaja).

**Pasos**
- [x] Matching en servidor (TS puro, sin migración): decidido cargar el catálogo ligero y usar similitud de trigramas en TS. Documentado el porqué (catálogo pequeño por hogar, evita el round-trip de `db push`) y dejado un `TODO` proponiendo RPC `pg_trgm`/Gemini como fallback futuro, sin implementarlo.
- [x] Refactor de `addMissingToListAction` en dos fases: `computeMissingIngredients` (puro, testeable, en `missing.ts`) + `computeMissingForMenuAction` (I/O) + `confirmMissingToListAction` (recibe la selección).
- [x] UI de revisión con checkboxes (drawer sobre `/menus`, patrón `receipt-review`).
- [x] Corregir el filtro de stock (`quantity > 0`) y vincular ítems insertados al catálogo (`product_id`).
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (D3):** sin migración (decisión de diseño: matching en TS).
> Módulo PURO nuevo `src/features/menus/missing.ts`: `computeMissingIngredients(input)` con
> matching en tres niveles —(1) `recipe_ingredients.product_id`, (2) `normalized_name` exacto,
> (3) fuzzy por `trigramSimilarity` (índice de Jaccard sobre trigramas con relleno de espacios,
> aproxima a `pg_trgm.similarity`, umbral `DEFAULT_FUZZY_THRESHOLD = 0.4`)— que descarta lo que ya
> está en stock (por `product_id` o nombre) o en la lista, y deduplica por producto emparejado o por
> nombre. Corrige el bug de stock: "en stock" = suma de cantidades del producto **> 0** (antes contaba
> los productos a 0 como disponibles). En `src/features/menus/actions.ts`: se sustituye
> `addMissingToListAction` por `computeMissingForMenuAction(menuId)` (reúne ingredientes del menú +
> `getInventory` + `getProductCatalog` + lista activa y llama al módulo puro; devuelve candidatos, no
> inserta) y `confirmMissingToListAction(menuId, includedKeys)` (RECALCULA en el servidor y solo usa
> `includedKeys` para filtrar —nunca confía en los datos de producto del cliente—; inserta vinculando
> `product_id` y usando `product.default_unit`/nombre del catálogo cuando hay match, o texto libre si
> no). UI en `menu-view.tsx`: el botón "Añadir a la lista lo que falte" ahora calcula y abre
> `MissingReviewDrawer` (checkboxes marcados por defecto, badge del producto emparejado o "Texto libre",
> nota "coincidencia aproximada" en los fuzzy; `Label htmlFor` para target táctil amplio; botón
> "Añadir N a la lista"). `npx tsc --noEmit` y `npx eslint .` limpios. Lógica pura verificada con un
> arnés (esbuild+node, 20 asserts: leche a 0 → falta; leche con stock → no; fuzzy tomate frito ↔
> "Tomate frito Orlando" con y sin stock; ya en lista; texto libre; dedup a un producto; exacto
> ignorando mayúsculas; red de seguridad por nombre; sanity de `trigramSimilarity`). Preview: `/menus`
> compila y sirve (redirige al login de Clerk, sin 500 ni error de esquema); el flujo interactivo del
> drawer queda para verificación manual con sesión iniciada (límite headless/Clerk conocido del bloque D).

**Criterios de aceptación**
- Con "Leche" a 0 en inventario y una receta con leche, el ingrediente SÍ aparece como faltante.
- "Tomate frito" de una receta casa con "Tomate frito Orlando" del catálogo (no se crea duplicado).
- El usuario puede desmarcar ingredientes antes de insertar; los sin match aparecen señalados como texto libre.
- No se duplican ítems ya presentes en la lista; los vinculados van a su ubicación por defecto al finalizar la compra.

---

### D4 — Recetario como pestaña dentro de Menús

**Idea original:** ¿tiene sentido que las recetas se encuentren en Menú? (Sí: son el *input* de los menús y la bottom nav está completa.)

**Contexto actual**
- La bottom nav tiene 5 pestañas (`src/components/layout/bottom-nav.tsx`) sin hueco para Recetas. B1 añadió un enlace "Mis recetas" en la cabecera de `/menus`, pero es poco descubrible.
- Navegando por `/recetas*`, **ninguna pestaña aparece activa** (la lógica es `pathname === href || pathname.startsWith(href + "/")` y `/recetas` no cuelga de `/menus`).

**Diseño propuesto**
- Conmutador segmentado en la cabecera de `/menus`: **"Semana" | "Recetario"** (usar `Tabs` de shadcn o un segmented control accesible; targets ≥ 44px). "Semana" = vista actual; "Recetario" navega a `/recetas` (no hace falta mover rutas; lo importante es el punto de entrada). En `/recetas`, mostrar el mismo conmutador con "Recetario" activo para volver a "Semana" con un toque.
- En `bottom-nav.tsx`, hacer que la pestaña Menús quede activa también en rutas `/recetas*` (p. ej. añadiendo `matchPrefixes?: string[]` a la definición de tab).
- Retirar el enlace suelto "Mis recetas" si queda redundante; comprobar que no quedan enlaces rotos a `/recetas` desde otras vistas.

**Pasos**
- [x] Conmutador Semana/Recetario en `/menus` y `/recetas` (componente compartido `MenuSectionTabs`).
- [x] Estado activo de la pestaña Menús en `/recetas*` (nuevo `matchPrefixes` en la bottom nav).
- [x] Limpieza de enlaces redundantes (retirado el botón "Mis recetas" del header de `/menus`); verificación en preview limitada por Clerk (headless).

> **Nota de implementación (D4):** sin migración. Componente compartido nuevo
> `src/components/layout/menu-section-tabs.tsx` (`MenuSectionTabs`, Server Component): conmutador
> segmentado de dos enlaces —"Semana" → `/menus`, "Recetario" → `/recetas`— estilado como segmented
> control (contenedor `bg-muted` + segmento activo `bg-background shadow-sm`), con `aria-current="page"`
> en el activo y targets `min-h-11` (44px). No usa `role="tab"` a propósito: son enlaces que navegan
> entre páginas, no tabs ARIA con panel compartido. En `src/app/(app)/menus/page.tsx`: retirado el botón
> suelto "Mis recetas" del header y añadido `<MenuSectionTabs active="semana" />` sobre `<MenuView>`.
> En `src/app/(app)/recetas/page.tsx`: `<MenuSectionTabs active="recetario" />` bajo el header (se
> conserva el botón "+" de nueva receta). En `src/components/layout/bottom-nav.tsx`: la definición de
> la pestaña Menús gana `matchPrefixes: ["/recetas"]` y el cálculo de `isActive` la considera activa en
> `/recetas`, `/recetas/nueva` y `/recetas/[id]` (guardado con `"matchPrefixes" in tab`). Los back-links
> "Mis recetas" (flecha) de `/recetas/nueva` y `/recetas/[id]` se conservan (navegación "hacia arriba"
> dentro de la sección). `npx tsc --noEmit` y `npx eslint .` limpios. Verificación interactiva del
> preview limitada por el login de Clerk (headless), como el resto del bloque D.

**Criterios de aceptación**
- Desde la pestaña Menús se llega al recetario en un toque y se vuelve igual de rápido.
- La pestaña Menús de la bottom nav aparece activa navegando por `/recetas`, `/recetas/nueva` y `/recetas/[id]`.

---

### D5 — Compartir el menú semanal (imagen + Web Share, print CSS)

**Idea original:** cuando se haga un menú semanal, ¿debería poderse compartir vía PDF/imagen? (Sí: es el típico artefacto que se manda al grupo familiar.)

**Contexto actual**
- No existe ninguna vía de exportar/compartir el menú. La vista vive en `src/features/menus/components/menu-view.tsx` (página `/menus`).

**Diseño propuesto**
- **Imagen (vía principal, mobile-first):** route handler dedicado (p. ej. `src/app/api/menus/[menuId]/imagen/route.tsx`) que renderice la semana con `ImageResponse` de `next/og`: días, comidas/cenas con sus platos, nombre del hogar y logo. Estilo coherente con la marca (colores fijos claros están bien para una imagen compartida; consultar la guía de Next 16 en `node_modules/next/dist/docs/` para `ImageResponse` en route handlers).
  - **Autorización obligatoria:** validar sesión de Clerk y pertenencia al hogar antes de renderizar (patrón de `src/lib/supabase/server.ts`). Nada de URLs públicas adivinables.
- Botón "Compartir" en `/menus`: `fetch` de esa ruta → `blob` → `navigator.share({ files: [File] })` si `navigator.canShare` lo admite; fallback a descarga directa (desktop).
- **PDF (barato):** hoja `@media print` para la vista del menú (ocultar bottom nav, FABs, botones y drawers; tipografía legible en A4, una semana por página) + opción "Imprimir o guardar PDF" que llame a `window.print()`.

**Pasos**
- [ ] Route handler de imagen con `ImageResponse` + validación de sesión/hogar.
- [ ] Botón "Compartir" con Web Share API + fallback de descarga.
- [ ] Estilos `@media print` + opción de imprimir.
- [ ] Verificar en preview: imagen correcta, 401/404 sin sesión, print limpio.

**Criterios de aceptación**
- En móvil, "Compartir" abre la hoja nativa con la imagen del menú de la semana visible.
- Un usuario de otro hogar (o sin sesión) recibe 401/404 al pedir la imagen por URL.
- `window.print()` produce una página limpia, sin navegación ni controles.

---

### D6 — Hint de escaneo: sugerir PDF escaneado con la app nativa

**Idea original:** ¿el escaneo de tickets podría usar el modo "escanear documento" del teléfono? (No directamente: es API nativa —ML Kit/VisionKit— no expuesta a una PWA; pero el flujo de subir PDF ya existe y lo aprovecha.)

**Contexto actual**
- `src/features/receipts/components/scan-form.tsx`: el botón de cámara usa `<input capture="environment">` (cámara normal); el segundo botón ya acepta `application/pdf`.

**Diseño propuesto**
- Bajo los dos botones de `/escanear`, texto de ayuda breve en `text-muted-foreground`:
  *"¿Ticket largo o arrugado? Escanéalo con la app de tu móvil (Notas, Google Drive…) y súbelo como PDF: la lectura será más precisa."*
- **Nada más.** No añadir OpenCV.js ni librerías de rectificación de imagen; no plantear wrapper nativo/TWA.

**Pasos**
- [ ] Añadir el hint en `scan-form.tsx` sin romper el layout móvil.

**Criterios de aceptación**
- El hint es visible, discreto, en español, y no afecta al estado `pending` del formulario.

---

### D7 — Hint de caducidad: "la fecha del que caduque antes"

**Idea original:** las fechas de caducidad van asociadas al artículo, pero puedo tener varios bricks de leche con fechas distintas. (Decisión: NO se hace seguimiento por lotes — ver comentario en `supabase/migrations/20260719121808_inventory.sql` líneas 6–9; la convención es registrar la fecha del envase que caduque antes y actualizarla al consumirlo.)

**Contexto actual**
- El campo de caducidad se edita en `src/features/inventory/components/edit-item-drawer.tsx`, en el alta (`add-product-drawer.tsx`) y en la revisión post-compra (`src/features/inventory/components/expiry-review.tsx`). Ninguno explica qué fecha poner cuando hay varios envases.

**Diseño propuesto**
- Texto de ayuda bajo el campo de fecha en los tres formularios:
  *"Si tienes varios, pon la fecha del que caduque antes."*
  (patrón de hint: texto pequeño `text-muted-foreground` bajo el input, label visible siempre — nunca placeholder-only).
- **No** implementar tabla de lotes ni tocar el esquema.

**Pasos**
- [ ] Hint en `edit-item-drawer.tsx`, `add-product-drawer.tsx` y `expiry-review.tsx` (si este último tiene campo de fecha por fila, basta una línea general sobre la lista).

**Criterios de aceptación**
- El hint aparece junto al campo de fecha en los tres puntos, con estilos de token y sin romper el layout del drawer.

---

## Notas de alcance (decisiones tomadas)

- **Desayunos:** la BD admite `breakfast` pero la UI de menús solo usa comida/cena; se mantiene así en todas estas tareas.
- **Temporadas:** modelo simple de dos estaciones para España (invierno oct–abr, verano may–sep) + "todo el año". Si algún día hace falta primavera/otoño, `seasons text[]` lo admite sin migración.
- **Valoraciones por miembro** (no por hogar): "cuánto te gusta" es personal; el generador usa la media del hogar.
- **Apetencia** se deriva del uso real (planificada/cocinada/recencia), no se pide al usuario un segundo rating.
- **Reglas MVP:** frecuencia por receta + texto libre. Reglas por categoría ("legumbres 2×/semana") quedan fuera por ahora; el modelo de tabla (`kind`) permite añadirlas luego.
- **Sin IA para la lista de la compra** (D3): el cálculo determinista + matching trigram cubre el caso; Gemini solo como fallback futuro y únicamente si el usuario lo pide (cero gasto en IA).
- **Sin seguimiento de caducidad por lotes** (D7): una `expiry_date` por (producto, ubicación); la convención es "la fecha del que caduque antes". Reevaluar solo si el usuario lo pide (ampliación natural: tabla hija `inventory_lots` con FIFO).
- **Sin rectificación de imagen en cliente ni wrapper nativo** para el escaneo (D6): el modo "escanear documento" del teléfono no es accesible desde una PWA; el flujo de subir PDF nativo lo cubre y Gemini Vision es robusto con fotos sin rectificar.

---

> **Prompt para el siguiente agente (Bloque D):**
>
> ```
> Continúa con el proyecto Fill Good (C:\Users\Jorge\Desktop\Food). Lee primero AGENTS.md
> (sistema de diseño: solo tokens semánticos, touch targets ≥44px, drawers en móvil, UI en
> español) y las "Instrucciones para el agente" al inicio de TODO.md. Los bloques A, B y C
> están terminados; implementa el Bloque D, tarea a tarea y con un commit por tarea,
> empezando por D1 y D2 (el resto en cualquier orden).
>
> Estado de la BD: proyecto Supabase enlazado por CLI (supabase/.temp/linked-project.json).
> Verifica el estado con `npx supabase migration list --linked` (solo lectura). Las
> migraciones nuevas (D1 seguro; D3 según diseño) requieren AUTORIZACIÓN del usuario antes
> de `npx supabase db push`. Los tipos en src/lib/supabase/types.ts se mantienen a mano.
>
> Cada tarea del Bloque D en TODO.md es autocontenida (contexto con rutas de archivo,
> diseño propuesto, pasos y criterios de aceptación). No amplíes el alcance: lo descartado
> está en "Notas de alcance". Al terminar cada tarea: `npx tsc --noEmit` y `npx eslint .`
> limpios, verificar los criterios en el preview cuando sea posible (hay límite conocido:
> login de Clerk no verificable en headless), marcar sus checkboxes y el estado global, y
> dejar una "Nota de implementación" bajo la tarea siguiendo el formato de las de A–C.
> ```
