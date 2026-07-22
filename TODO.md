# TO-DO — Mejoras de Fill Good

Documento de trabajo para implementar las próximas mejoras **progresivamente con agentes de IA**.
Cada tarea es autocontenida: incluye contexto, diseño propuesto, pasos y criterios de aceptación.
Ejecutar las tareas **en orden dentro de cada bloque**; los bloques A, B y C son secuenciales
(A = mejoras rápidas independientes, B = recetario, C = generador de menús 2.0, que depende de B).
El bloque D (revisión de producto del 2026-07-21) contiene tareas **independientes entre sí**,
ordenadas por prioridad; pueden hacerse en cualquier orden, pero D1 y D2 primero.
El bloque E (análisis crítico del 2026-07-21: inventario + matching de tickets) está ordenado
por prioridad: E1–E5 son independientes entre sí (E1 primero: protege el historial de precios,
el activo central de la app); E6, E7 y E9 se apoyan en la UI de E1 y conviene hacerlas después.
El bloque F (feedback de usuarios del 2026-07-22) está ordenado por impacto/esfuerzo:
F1–F3 son independientes entre sí; F4 y F5 tocan los mismos puntos de escritura (ticket,
checkout, stepper) y, si se hacen ambas, F4 va primero (F5 registra cantidades ya convertidas).

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
- [x] D5 — Compartir el menú semanal (imagen + Web Share, print CSS)
- [x] D6 — Hint de escaneo: sugerir PDF escaneado con la app nativa
- [x] D7 — Hint de caducidad: "la fecha del que caduque antes"
- [x] E1 — Revisión de tickets: combobox buscable + estado del match visible
- [x] E2 — Guardarraíl antiduplicados al crear producto desde el ticket
- [x] E3 — BUG: unidades distintas al sumar cantidades al confirmar ticket
- [x] E4 — Inventario: buscador + chips de filtro por estado
- [x] E5 — "Mis habituales": pin de productos por usuario
- [x] E6 — Matching difuso (candidatos con un toque) en el escaneo
- [x] E7 — Sugerencia de producto por IA en la extracción (coste cero)
- [x] E8 — Gestión de aliases aprendidos
- [x] E9 — Fusionar productos duplicados
- [x] E10 — Robustez transaccional de la confirmación del ticket (menor)
- [x] F1 — Nombres de producto legibles en las tarjetas (2 líneas en vez de recorte)
- [ ] F2 — Chips de caducidad aditivos (cada toque suma tiempo)
- [ ] F3 — Ingredientes de receta vinculados al catálogo con stock visible
- [ ] F4 — Pack de compra: "1 caja = N unidades" al entrar al inventario
- [ ] F5 — Historial de movimientos de stock (consumido / tirado / repuesto)

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
- [x] Route handler de imagen con `ImageResponse` + validación de sesión/hogar.
- [x] Botón "Compartir" con Web Share API + fallback de descarga.
- [x] Estilos `@media print` + opción de imprimir.
- [x] Verificar: imagen correcta (renderizada con datos de ejemplo vía arnés), 401/404 por diseño; print limpio por código. Flujo interactivo (Web Share/print con sesión) limitado por Clerk headless.

> **Nota de implementación (D5):** sin migración. Primer route handler del proyecto:
> `src/app/api/menus/[menuId]/imagen/route.tsx` (`runtime = "nodejs"`) renderiza la semana con
> `ImageResponse` de `next/og` (1080×1600, retrato para compartir). Solo flexbox (Satori no admite
> grid): cabecera (nombre del hogar en verde de marca + "Menú de la semana" + rango de fechas) y una
> columna de 7 días, cada uno con dos columnas Comida/Cena que listan los platos (o "—" si vacío) y un
> pie "Fill Good · Compra lo justo, ahorra más". Colores FIJOS claros (una imagen no puede leer las CSS
> vars del tema). **Autorización:** `auth()` (sin `userId` → 401) + cliente Supabase con RLS (un
> `menuId` de otro hogar no devuelve fila → 404); además el `proxy.ts` (middleware) ya protege `/api/*`,
> así que sin sesión se bloquea antes de llegar. En `menu-view.tsx`: botones "Compartir" (fetch de la
> ruta → `blob` → `navigator.share({files})` si `navigator.canShare` lo admite; fallback a descarga en
> escritorio; ignora `AbortError` al cancelar) e "Imprimir" (`window.print()`), visibles cuando el menú
> tiene entradas. **Print CSS:** los controles llevan `print:hidden` (nav de semana, generar, añadir a
> la lista, compartir/imprimir, "Añadir plato"; en `menus/page.tsx` el conmutador y las reglas), y un
> bloque `@media print` en `globals.css` oculta la bottom nav (`nav[aria-label="Navegación principal"]`),
> quita el `padding-bottom` del `main` y fuerza fondo/tinta claros. Verificación: la imagen se renderizó
> con datos de ejemplo mediante un arnés (esbuild→CJS + `next/og`) produciendo un PNG válido de ~107 KB
> con el layout correcto (inspeccionado visualmente); Satori aceptó todo el flexbox. `npx tsc --noEmit`
> y `npx eslint .` limpios. El flujo interactivo (hoja de compartir nativa / print) con sesión queda
> para verificación manual (límite headless/Clerk del bloque D).

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
- [x] Añadir el hint en `scan-form.tsx` sin romper el layout móvil.

> **Nota de implementación (D6):** sin migración. En
> `src/features/receipts/components/scan-form.tsx`, un `<p className="text-sm text-muted-foreground">`
> bajo los dos botones ("Hacer foto al ticket" / "Subir imagen o PDF") con el texto sugerido. Al estar
> dentro del bloque de botones (no del estado `pending`, que devuelve otro layout antes), no afecta al
> spinner de análisis. Sin OpenCV.js ni wrappers nativos (fuera de alcance). `tsc`/`eslint` limpios.

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
- [x] Hint en `edit-item-drawer.tsx`, `add-product-drawer.tsx` y `expiry-review.tsx` (una línea general sobre la lista en este último, que tiene fecha por fila).

> **Nota de implementación (D7):** sin migración ni cambios de esquema (sin tabla de lotes, fuera de
> alcance). `<p className="text-sm text-muted-foreground">` con el texto "Si tienes varios, pon la fecha
> del que caduque antes." bajo el campo de fecha en `edit-item-drawer.tsx` y `add-product-drawer.tsx`
> (dentro del mismo bloque que el `<Label>`, que sigue siendo visible — no placeholder-only). En
> `expiry-review.tsx`, al haber una fecha por fila, una única línea general ("Si tienes varios de un
> producto, pon la fecha del que caduque antes.") sobre la lista. Solo tokens semánticos. `tsc`/`eslint`
> limpios.

**Criterios de aceptación**
- El hint aparece junto al campo de fecha en los tres puntos, con estilos de token y sin romper el layout del drawer.

---

## Bloque E — Inventario y matching de tickets (análisis crítico 2026-07-21)

Tareas surgidas de un análisis crítico de dos áreas: (1) el flujo de asociación
ticket ↔ catálogo, cuyo punto débil real es que el matching exacto + el default
"Crear producto nuevo" produce **duplicados de catálogo que fragmentan el historial
de precios** (el mayor riesgo de calidad de datos de la app); y (2) el inventario,
que sin buscador ni filtros escala mal a partir de ~50 productos. Orden recomendado:
E1 → E2 → E3 → E4 → E5, y después E6–E10.

**Decisión de alcance ya tomada (no reabrir):** NO implementar reordenación manual
drag & drop del inventario — ver "Notas de alcance".

### E1 — Revisión de tickets: combobox buscable + estado del match visible

**Idea original:** al escanear un ticket, los nombres pueden diferir mucho de los del
inventario; ¿habría que hacer el trabajo de asociarlos la primera vez? (Respuesta: la
asociación ya existe —`product_aliases` se aprende al confirmar y la 2ª compra matchea
sola—, pero la UI de revisión no ayuda a hacer bien esa primera asociación.)

**Contexto actual**
- `src/features/receipts/components/receipt-review.tsx` (~línea 203): el producto de cada
  línea se elige con un `Select` de shadcn que lista TODO el catálogo **sin búsqueda**;
  con 100+ productos es inutilizable en móvil. Las líneas sin match quedan por defecto en
  "➕ Crear producto nuevo" — el usuario confirma tickets de 40 líneas sin revisar cada
  desplegable y cada confirmación ciega crea un duplicado.
- `receipt_items.match_status` (`auto` | `manual` | `new_product` | `skipped`) ya se guarda
  y llega a la UI vía `getReceiptItems()` (`src/features/receipts/queries.ts`), pero **no se
  muestra**: una línea asociada automáticamente y una que necesita decisión se ven casi igual.
- Ya existe el componente exacto que hace falta: `ProductAutocomplete`
  (`src/features/shopping-list/components/product-autocomplete.tsx`, de A2) — combobox
  accesible que filtra con `normalizeName()` y ordena por habitualidad.

**Diseño propuesto**
- Sustituir el `Select` por línea por un **combobox buscable**: extraer `ProductAutocomplete`
  (o una variante) a `src/components/` como componente compartido y usarlo aquí. Debe permitir
  también la opción "Crear producto nuevo" y mostrar el producto asociado actual.
- Hacer visible el estado por línea con badges de tokens semánticos: `success` "✓ Asociado"
  (match `auto`, mostrando el nombre del producto), `warning` "Elegir producto" (`new_product`).
- **Priorizar la atención**: ordenar o agrupar las líneas `new_product` arriba ("Necesitan
  decisión") y las asociadas debajo, para que lo que exige decisión no quede enterrado.

**Pasos**
- [x] Extraer el combobox a `src/components/` (mantener la a11y: roles combobox/listbox,
      `aria-activedescendant`, targets ≥ 44px) sin romper su uso en `/lista`.
- [x] Integrarlo en `receipt-review.tsx` sustituyendo el `Select`.
- [x] Badges de estado por línea + agrupación/orden "necesitan decisión primero".
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (E1):** sin migración. Componente compartido nuevo
> `src/components/product-combobox.tsx` (`ProductCombobox`): combobox buscable de **selección**
> (valor = id de producto o `null`) construido sobre `Command` (cmdk) + `Popover` de shadcn.
> Filtra con `normalizeName` (ignora acentos/mayúsculas), ordena por `purchaseCount` y ofrece
> opcionalmente "➕ Crear producto nuevo". cmdk aporta los roles combobox/listbox,
> `aria-activedescendant` y navegación por teclado; opciones con `min-h-11` (44px); ancho del
> popover atado al trigger con `--radix-popover-trigger-width`. **Decisión de diseño:** NO se
> mueve `ProductAutocomplete` de `/lista` — sigue otro modelo de interacción (texto libre con
> autocompletado, imprescindible para añadir ítems fuera de catálogo) y se deja intacto (su uso
> en `/lista` no cambia). El `ProductCombobox` es la pieza reutilizable para los flujos de
> "elegir un producto existente" (E1 y, más adelante, E9). En
> `src/features/receipts/components/receipt-review.tsx`: se sustituye el `Select` sin búsqueda por
> `<ProductCombobox allowCreateNew>`; cada línea muestra un badge de estado en vivo —`success`
> "Asociado automáticamente"/"Asociado" cuando hay `productId`, `warning` "Elegir producto" cuando
> no—; las filas se **agrupan y ordenan** con "Necesitan decisión" (match `new_product`/`skipped`)
> arriba y "Asociados" (`auto`/`manual`) debajo, con orden fijado al montar (sort estable por
> `initialStatus`, no salta al asignar). La página `revisar/page.tsx` pasa ahora `getProductCatalog()`
> (id, nombre, `normalizedName`, ubicación, `purchaseCount`) en vez de `getProducts()` mapeado, para
> que el combobox filtre y muestre ubicación. `npx tsc --noEmit` y `npx eslint .` limpios.
> Verificación interactiva limitada: la ruta es autenticada (sesión Clerk + ticket real), no
> verificable en headless (límite conocido de los bloques B–D).

**Criterios de aceptación**
- En la revisión de un ticket puedo escribir "lec" y elegir "Leche" en ≤ 2 interacciones.
- De un vistazo distingo qué líneas matchearon solas y cuáles no; las dudosas van primero.
- El autocompletado de `/lista` sigue funcionando igual tras la extracción del componente.

---

### E2 — Guardarraíl antiduplicados al crear producto desde el ticket

**Idea original:** evitar que confirmar tickets sin revisar llene el catálogo de duplicados
("Leche", "Leche Entera", "Leche Entera 6x1L") que fragmentan el historial de precios.

**Contexto actual**
- `confirmReceiptAction` (`src/features/receipts/actions.ts`, ~línea 184) solo reutiliza un
  producto existente si el `normalized_name` es **idéntico**; cualquier variante crea producto
  nuevo. Agravante: el nombre propuesto viene de la limpieza de la IA, que varía entre tickets
  para el mismo artículo, y `normalizeName()` solo neutraliza mayúsculas/acentos.
- Ya existe una función de similitud en TS: `trigramSimilarity` dentro de
  `src/features/menus/missing.ts` (D3, aproxima a `pg_trgm.similarity`).

**Diseño propuesto**
- Extraer `trigramSimilarity` (y el umbral) de `missing.ts` a un módulo compartido
  (p. ej. `src/lib/similarity.ts`) sin cambiar su comportamiento; `missing.ts` la reimporta.
- En la revisión del ticket (sobre la UI de E1): cuando una línea queda en "Crear producto
  nuevo" y existe un producto del catálogo con similitud por encima del umbral (~0.4, calibrar
  con datos reales), mostrar aviso inline: *"Ya tienes «Leche», ¿es el mismo producto?"* con
  acción de un toque para asociarla. **Umbral conservador**: mejor no avisar que avisar mal.
- Aplicar el mismo aviso en el alta manual (`src/features/inventory/components/add-product-drawer.tsx`)
  solo si sale barato; si no, dejarlo fuera.

**Pasos**
- [x] Extraer `trigramSimilarity` a `src/lib/similarity.ts` (reimportar desde `missing.ts`).
- [x] Aviso inline + asociación de un toque en la revisión del ticket.
- [~] (Opcional) mismo aviso en `add-product-drawer.tsx` — **dejado fuera** a propósito (ver nota).
- [x] `npx tsc --noEmit` y `npx eslint .` limpios; la lógica de `missing.ts` no cambia (solo
      reimporta), así que el arnés de D3 sigue pasando conceptualmente.

> **Nota de implementación (E2):** sin migración. `trigramSimilarity`, `trigrams` (privada) y las
> constantes `DEFAULT_FUZZY_THRESHOLD`/`MIN_FUZZY_LENGTH` se mueven de `src/features/menus/missing.ts`
> a un módulo compartido nuevo `src/lib/similarity.ts` sin cambiar comportamiento; `missing.ts` las
> reimporta y **reexporta** `DEFAULT_FUZZY_THRESHOLD`/`trigramSimilarity` para no romper importadores.
> En `src/features/receipts/components/receipt-review.tsx` (sobre la UI de E1): helper PURO
> `findDuplicateCandidate(description, catalog)` que, para las líneas que quedarían como producto
> nuevo (`productId === null`, incluidas), busca el mejor candidato del catálogo por (a) **contención
> de tokens en cualquier dirección** (un nombre es subconjunto de tokens del otro: "leche" ⊆ "leche
> entera hacendado" ✓; "leche" vs "lechuga" ✗, tokens distintos) o (b) **trigramas ≥ 0,5**
> (`WARN_TRIGRAM_THRESHOLD`, más alto que el 0,4 de faltantes: aquí conviene NO avisar a avisar mal).
> Los candidatos se calculan en un `useMemo` por línea; se muestra un aviso inline en `bg-warning/10
> text-warning` — "Ya tienes «Leche», ¿es el mismo producto?" — con un botón "Asociar" que fija el
> `productId` con un toque (al confirmar, el alias se aprende como siempre). **La parte opcional del
> alta manual (`add-product-drawer.tsx`) se deja fuera**: ese flujo solo recibe `productNames:
> string[]`, crea por nombre y el servidor ya fusiona el nombre exacto; no hay una acción limpia de
> "asociar" y el riesgo real de duplicados (confirmación de tickets) queda cubierto aquí. Lógica del
> guardarraíl verificada con un arnés (node): "Leche Entera Hacendado"→sugiere "Leche"; NO confunde
> con "Lechuga" (sim 0,33 < 0,5); "Gazpacho Hacend" (errata) casa por trigramas; "Chorizo" no avisa.
> `npx tsc --noEmit` y `npx eslint .` limpios. Verificación interactiva limitada por Clerk (headless).

**Criterios de aceptación**
- Con "Leche" en el catálogo, una línea "Leche Entera Hacendado" dejada en "nuevo" muestra el
  aviso y se asocia a "Leche" con un toque (y al confirmar se aprende el alias, como siempre).
- Productos genuinamente distintos (p. ej. "Leche" vs "Lechuga") NO disparan el aviso.

---

### E3 — BUG: unidades distintas al sumar cantidades al confirmar ticket

**Idea original:** ninguna — bug detectado durante el análisis. Cuanto mejor matchee el
sistema (E1, E2, E6, E7), más líneas irán a productos existentes y más veces se pisará.

**Contexto actual**
- `confirmReceiptAction` (`src/features/receipts/actions.ts`, ~líneas 248–264): si ya existe
  fila de inventario para (producto, ubicación), hace `quantity: inv.quantity + dec.quantity`
  y además **sobrescribe `unit` con la del ticket**. Con "Leche: 2 ud" en inventario y "1.5 L"
  en el ticket, el resultado es "3.5 L": suma magnitudes de unidades distintas en silencio.

**Diseño propuesto**
- Definir una política explícita y documentarla en el código. Propuesta mínima (sin tabla de
  conversiones): si `inv.unit !== dec.unit`, **no sumar a ciegas** — conservar la unidad
  existente del inventario y o bien pedir decisión en la revisión (badge de aviso en la línea),
  o bien no tocar la cantidad y devolver un aviso visible (toast/warning) para ajuste manual.
  Elegir UNA de las dos y aplicarla de forma consistente.
- No implementar conversión automática de unidades (ud↔kg↔L no es convertible sin densidad);
  fuera de alcance.

**Pasos**
- [x] Implementar la política elegida en `confirmReceiptAction` + comentario explicando la regla.
- [x] Aviso visible al usuario cuando se dé el caso (nunca silencioso).
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (E3):** sin migración. **Política elegida (opción b):** al confirmar, si
> ya existe fila de inventario para (producto, ubicación) y `inv.unit !== dec.unit`, **no se suma**
> (magnitudes incompatibles como ud + l) — se conserva la unidad y cantidad del inventario **sin
> tocar nada** y se acumula un aviso; sin conversión automática (fuera de alcance). En
> `src/features/receipts/actions.ts` (`confirmReceiptAction`): el bloque de fusión de inventario
> distingue tres casos —(1) sin fila existente ⇒ insertar (como antes); (2) fila existente y unidad
> **igual** ⇒ sumar cantidad (se eliminó el `unit: dec.unit` que la sobrescribía, ahora innecesario
> y peligroso); (3) fila existente y unidad **distinta** ⇒ no tocar + `warnings.push(...)` con el
> texto «"Producto": compraste X u pero en tu inventario está en Y. No se sumó automáticamente;
> ajústalo a mano.»—. `added` solo cuenta las líneas que realmente crearon/actualizaron inventario
> (`addedToInventory`), así el toast de éxito es honesto; `bump_product_purchase` se sigue llamando
> (la compra ocurrió). La acción devuelve `warnings?: string[]`; `receipt-review.tsx` los muestra con
> `toast.warning` (duración 8 s; el Toaster global sobrevive a la navegación). Coordinado con E9: la
> misma política de "no sumar unidades distintas" se replicará en el RPC `merge_products`.
> `formatQuantity`/`UNIT_LABELS` reutilizados de `@/lib/units`. `npx tsc --noEmit` y `npx eslint .`
> limpios. Verificación interactiva limitada por Clerk (headless).

**Criterios de aceptación**
- Confirmar un ticket cuya línea tiene unidad distinta a la del stock existente nunca produce
  una cantidad sin sentido en silencio; el usuario recibe un aviso accionable.
- El caso unidad-igual sigue sumando como hasta ahora.

---

### E4 — Inventario: buscador + chips de filtro por estado

**Idea original:** añadir buscador y posibilidad de filtrar en el inventario.

**Contexto actual**
- `src/app/(app)/inventario/page.tsx` carga TODO el inventario (sin paginación) vía
  `getInventory()`, lo agrupa por ubicación (`LOCATION_ORDER`) y ordena por urgencia
  (`urgencyRank`, ~línea 27: caducado → caduca pronto/consumir pronto → resto → agotado)
  + alfabético. No hay búsqueda ni filtros. El listado se renderiza en el Server Component.
- Los estados ya están calculados: `getExpiryStatus` (`src/lib/dates.ts`), `useSoon`,
  `belowMin` (en `inventory-item-card.tsx`), `quantity === 0`.

**Diseño propuesto**
- **Filtrado 100% en cliente** (los datos ya están todos cargados): extraer el listado a un
  componente cliente (p. ej. `src/features/inventory/components/inventory-list.tsx`) que reciba
  `entries`, `categories` y los ids en lista (`onListProductIds` como array serializable, no
  `Set`) desde el Server Component. Las lecturas siguen en el servidor.
- **Buscador**: filtra con `normalizeName()` sobre nombre de producto **y** nombre de categoría
  ("limpieza" debe encontrar el lavavajillas). Sin debounce (es memoria). Al filtrar, conservar
  las cabeceras de ubicación y ocultar grupos vacíos; mantener el orden por urgencia.
- **Chips de estado** con contador sobre la lista: **Caducan pronto** (incluye `useSoon`),
  **Caducados**, **Agotados**, **Quedan pocas**. Un chip activo a la vez; combinable con la
  búsqueda. Tokens: `warning` caduca pronto, `destructive` caducado (misma semántica que los
  badges de la tarjeta). Extraer la lógica de estado a helpers compartidos si hace falta —
  **no duplicarla** entre página, tarjeta y chips.
- **Layout móvil**: no robar viewport de forma permanente (lupa que expande o barra sticky que
  colapsa al hacer scroll); respetar bottom nav y `pb-safe`; input con label accesible (nunca
  placeholder-only), targets ≥ 44px.
- **Estado en URL sin navegación de servidor** (`history.replaceState` o equivalente de Next 16
  — consultar `node_modules/next/dist/docs/`), para que el filtro sobreviva al back/forward
  tras editar un producto.

**Pasos**
- [x] Extraer listado a componente cliente conservando el render actual como caso base.
- [x] Buscador (producto + categoría) con grupos de ubicación preservados.
- [x] Chips de estado con contadores, un activo a la vez, helpers de estado compartidos.
- [x] Persistencia del filtro en URL sin recarga de servidor.
- [x] `npx tsc --noEmit` y `npx eslint .` limpios; contraste AA de los chips en ambos temas.

> **Nota de implementación (E4):** sin migración. Módulo PURO nuevo `src/features/inventory/status.ts`
> como fuente ÚNICA de la clasificación de estado —`getInventoryStatus({quantity, expiryDate, useSoon,
> minQuantity})` → flags `{expired, soon, out, low}` (soon incluye "consumir pronto"; low excluye
> agotado y exige stock>0); `urgencyRank(flags)` (caducado 0 → caduca pronto 1 → resto 2 → agotado 3);
> `STATUS_FILTERS`—, usado por la tarjeta (badges, con la cantidad EN VIVO del stepper), la página y
> los chips, sin duplicar la lógica. La tarjeta (`inventory-item-card.tsx`) pasa a derivar `emptied`/
> "Quedan pocas" del helper. El listado se extrae a un Client Component
> `src/features/inventory/components/inventory-list.tsx` (los datos siguen leyéndose en el servidor y
> se le pasan; `onListProductIds` como array serializable). **Buscador** con `normalizeName` sobre
> nombre de producto **y** de categoría ("lácteos" encuentra Leche/Yogur), sin debounce, conservando
> cabeceras de ubicación, ocultando grupos vacíos y el orden por urgencia; input con `<Label>` visible
> + icono lupa + botón de borrar. **Chips** (Caducan pronto / Caducados / Agotados / Quedan pocas) con
> contador sobre el conjunto ya buscado, uno activo a la vez (toggle), `aria-pressed`, deshabilitados a
> 0 (salvo el activo), tokens semánticos al activarse (`destructive` caducados, `warning` el resto —
> misma semántica que la tarjeta), `h-11` (44px), fila con scroll horizontal (`no-scrollbar`, utilidad
> añadida a `globals.css`). **Persistencia en URL** con `window.history.replaceState` (patrón
> documentado de Next 16, sin navegación de servidor): `?q=…&estado=…`; la página lee `searchParams`
> (Promise en Next 16) y pasa los valores iniciales, así el filtro sobrevive a back/forward y a
> `router.refresh()` tras editar. **Sin filtro por categoría** (fuera de alcance): solo el buscador
> matchea categorías. Lógica de estado + búsqueda verificada con un arnés (node, 10 asserts).
> `npx tsc --noEmit` y `npx eslint .` limpios. Verificación interactiva del preview limitada por Clerk
> (headless): `/inventario` es ruta autenticada.

**Criterios de aceptación**
- Escribir "toma" filtra a "Tomate frito"/"Tomates" manteniendo su sección de ubicación;
  borrar la búsqueda restaura la vista completa.
- Tocar "Caducan pronto" muestra solo esos ítems con contador correcto; tocar de nuevo lo quita.
- Volver atrás desde editar un producto conserva búsqueda y chip activos.
- El filtro por categoría NO se implementa (ver "Notas de alcance").

---

### E5 — "Mis habituales": pin de productos por usuario

**Idea original:** poder ordenar el inventario por usuario, porque no todos los miembros del
hogar usan los mismos insumos. (Decisión: se resuelve con pines por usuario, NO con
reordenación manual drag & drop — ver "Notas de alcance".)

**Contexto actual**
- La app no sabe qué consume cada usuario: `products.purchase_count` es por hogar y
  `inventory_items.updated_by` solo registra quién tocó el stepper. El pin explícito es la
  única señal fiable de "esto es mío".
- Sería la **primera tabla per-user** del proyecto (todo lo demás es por hogar). El helper
  `public.clerk_user_id()` existe desde la migración init y ya se usa en RLS de
  `household_members`.

**Diseño propuesto**
- **Migración** `user_pinned_products`:
  - `create table user_pinned_products (user_id text not null, household_id uuid not null references households on delete cascade, product_id uuid not null references products on delete cascade, created_at timestamptz not null default now(), primary key (user_id, product_id));`
  - RLS: `user_id = public.clerk_user_id() and is_household_member(household_id)` en
    using/with check (patrón de las migraciones existentes) + grants a `authenticated`.
  - Actualizar tipos a mano en `src/lib/supabase/types.ts` (se mantienen a mano).
- **Server Action** `togglePinAction(productId)` en `src/features/inventory/actions.ts`
  + `revalidatePath("/inventario")`; query de pines del usuario actual en `queries.ts`.
- **UI**: toggle de pin en `edit-item-drawer.tsx` (la tarjeta ya tiene el área principal como
  botón de editar y el stepper a la derecha — no añadir targets < 44px ni solapar gestos; si
  cabe una estrella con target completo en la tarjeta, mejor, pero el drawer es el mínimo).
  Sección "⭐ Mis habituales" **arriba del todo** en `/inventario` con los ítems anclados del
  usuario actual (dentro, mismo orden por urgencia); el resto de secciones no cambia. Debe
  convivir con el buscador/chips de E4 (los pines también se filtran).

**Pasos**
- [x] Migración + RLS (autorizada por el usuario y aplicada al remoto) + tipos a mano.
- [x] `togglePinAction` + query de pines por usuario.
- [x] Toggle en el drawer de edición + sección "Mis habituales" en `/inventario`.
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (E5):** migración `supabase/migrations/20260721140000_user_pinned_products.sql`
> — **primera tabla per-user del proyecto**: `user_pinned_products (user_id text, household_id uuid refs
> households on delete cascade, product_id uuid refs products on delete cascade, created_at, primary key
> (user_id, product_id))` + índice `(user_id, household_id)`. **RLS estricta per-user**: `for all to
> authenticated using/with check (user_id = public.clerk_user_id() and is_household_member(household_id))`
> + grants a `authenticated` (patrón de la init). **Aplicada al remoto** (autorizada por el usuario 2026-07-21
> y verificada con `npx supabase migration list --linked`: `20260721140000` con `local == remote`). Tipos
> añadidos a mano en `src/lib/supabase/types.ts`. En `src/features/inventory/`: `togglePinAction(productId)`
> (actions, toggle idempotente insert/delete filtrando por `user_id` + `product_id`; devuelve `{ok, pinned}`)
> y `getPinnedProductIds()` (queries, `Set<string>`; la RLS ya restringe a los pines del propio usuario).
> UI: toggle "⭐ Mis habituales" (Switch con `Star`) en `edit-item-drawer.tsx` (optimista + `router.refresh()`);
> `InventoryItemCard` gana prop `pinned` que pasa al drawer. En `inventory-list.tsx` (E4), los anclados se
> **promueven** a una sección "⭐ Mis habituales" arriba (ordenada por urgencia) y se **excluyen** de sus
> ubicaciones para que cada ítem aparezca una sola vez (evita doble estado del stepper); convive con
> buscador/chips (los pines también se filtran). La página carga `getPinnedProductIds()` en paralelo y lo
> pasa como array serializable. **Decisión:** sin estrella en la tarjeta (layout denso con stepper); el
> drawer es el punto de anclaje, como permite el plan. `npx tsc --noEmit` y `npx eslint .` limpios.
> Verificación interactiva y de RLS per-user (dos usuarios) limitada por Clerk (headless); la RLS está
> garantizada por la política SQL aplicada.

**Criterios de aceptación**
- Dos usuarios del mismo hogar ven secciones "Mis habituales" distintas.
- Anclar/desanclar es un toque con feedback inmediato; icon buttons con `aria-label`.
- Un `member` no puede leer/escribir pines de otro usuario ni por API directa (RLS).

---

### E6 — Matching difuso (candidatos con un toque) en el escaneo

**Idea original:** que la 2ª y siguientes compras del mismo artículo no vuelvan a preguntar
aunque el texto del ticket varíe ligeramente.

**Contexto actual**
- `matchProduct()` (`src/lib/matching.ts`) es solo-exacto: alias aprendido idéntico →
  `normalized_name` idéntico → `new_product`. Un punto de más ("GAZPACHO HACEND." vs
  "GAZPACHO HACEND"), un gramaje distinto o un OCR ligeramente diferente y el alias no dispara.
- `pg_trgm` está habilitada desde la migración init (verificado), pero D3 sentó el precedente
  de hacer la similitud **en TS** (catálogo por hogar pequeño, evita migración): reutilizar
  `trigramSimilarity` extraída en E2.

**Diseño propuesto**
- Ampliar `matchProduct()`: si no hay match exacto, calcular candidatos por similitud
  (`trigramSimilarity` de E2) del texto de la línea contra `products.normalized_name` **y**
  `product_aliases.alias_normalized` del hogar; devolver top-1..3 con score (umbral orientativo
  0.35–0.45, calibrar con tickets reales). Cargar catálogo + aliases una sola vez por ticket,
  no por línea (hoy `matchProduct` hace 2 queries por línea).
- **NUNCA auto-asociar por fuzzy**: los candidatos se proponen en la revisión (UI de E1) como
  sugerencia preseleccionable de un toque ("¿Es *Leche*? ✓"); la confirmación del usuario
  aprende el alias como hasta ahora (ese flywheel es correcto y se conserva).
- Precedencia: **alias aprendido > nombre exacto > candidato fuzzy** (el alias es verdad
  confirmada; el fuzzy, una conjetura).
- Guardar la sugerencia en `receipt_items` (p. ej. `match_status` sigue `new_product` pero la
  UI recibe el candidato) — decidir si hace falta columna nueva (`suggested_product_id`) o si
  basta con calcularlo al cargar la revisión; preferir **sin migración** si el coste de
  recalcular es trivial.

**Pasos**
- [x] Refactor de `matchProduct` a candidatos con score, con catálogo/aliases cargados por ticket.
- [x] UI de sugerencia de un toque en la revisión (sobre E1).
- [~] Calibrar umbral con 2–3 tickets reales de Mercadona — umbral inicial 0,4 (compartido con D3/E2);
      calibración con tickets reales pendiente del usuario (no verificable en headless).
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (E6):** sin migración (la sugerencia se recomputa al cargar la revisión;
> trivial). `src/lib/matching.ts` reescrito: `matchProduct` (async, 2 queries por línea) se sustituye por
> funciones puras sobre datos precargados —`loadHouseholdMatchData(supabase, householdId)` carga catálogo
> + aliases UNA vez por ticket; `matchLineExact(data, rawText, description)` hace SOLO el match exacto
> (alias idéntico → nombre normalizado idéntico → `new_product`, precedencia fija) para asociar en el
> escaneo; `suggestCandidates(data, rawText, description, {threshold, topN})` calcula candidatos fuzzy por
> `trigramSimilarity` (de `@/lib/similarity`) comparando texto crudo y descripción contra los nombres
> normalizados **y los aliases** del hogar, top-N por mejor score por producto, umbral `SUGGEST_THRESHOLD`
> (=0,4)—. `scanReceiptAction` precarga `loadHouseholdMatchData` y usa `matchLineExact` (adiós a las 2
> queries por línea). `receipts/queries.ts` gana `getReceiptSuggestions(items)` (top-1 candidato por línea
> `new_product` sin producto) que se calcula en la página de revisión y se pasa a `ReceiptReview` como
> `suggestions`. En el componente, el candidato de una línea sin producto sigue la precedencia **(E6)
> sugerencia del servidor (trigram sobre catálogo+aliases) → (E2) guardarraíl cliente por contención de
> tokens**, reutilizando el mismo aviso de un toque "¿es el mismo?" (aceptar fija `product_id`; al
> confirmar el ticket se aprende el alias, flywheel intacto). **NUNCA auto-asocia por fuzzy**: `match_status`
> sigue `new_product` hasta que el usuario confirma. Precedencia global: alias aprendido > nombre exacto >
> candidato fuzzy/IA > nuevo (se mantiene). Lógica verificada con un arnés (esbuild+node, 7 asserts:
> exacto→auto, alias exacto gana, punto extra→new_product+candidato vía alias, errata OCR→candidato vía
> nombre, distinto→sin candidato). Nota: la contención "Leche" ⊆ "Leche Entera Hacendado" (sin alias) la
> cubre el fallback de tokens de E2, complementario al trigram de E6. `npx tsc --noEmit` y `npx eslint .`
> limpios. Calibración del umbral con tickets reales y verificación interactiva limitadas por Clerk (headless).

**Criterios de aceptación**
- Una línea "Leche Entera Hacendado" sin alias propone "Leche" como candidato; aceptarlo con un
  toque crea el alias y la siguiente compra matchea sola (`auto`).
- "GAZPACHO HACEND." matchea (vía candidato) aunque el alias aprendido fuera "GAZPACHO HACEND".
- Ningún producto se asocia automáticamente solo por fuzzy sin confirmación del usuario.

---

### E7 — Sugerencia de producto por IA en la extracción (coste cero)

**Idea original:** usar IA para asociar nombres del ticket con el catálogo, sin añadir gasto.

**Contexto actual**
- La extracción ya es UNA llamada a Gemini: `generateObject` en `scanReceiptAction`
  (`src/features/receipts/actions.ts`) con `getModel("receipts")`, prompt en
  `src/lib/ai/receipt-prompt.ts`, schema en `src/lib/ai/receipt-schema.ts`. El catálogo por
  hogar (cientos de productos como mucho) cabe de sobra en el contexto de esa misma llamada.
- Restricción del proyecto: **cero gasto extra en IA** (Gemini free tier, siempre vía
  `getModel()` — nunca instanciar un provider en la feature).

**Diseño propuesto**
- Incluir en el prompt de extracción el catálogo del hogar (lista `id — nombre`) y ampliar
  `receiptSchema` con, por línea: `suggested_product_id: string | null` y
  `match_confidence: 'high' | 'low'` (o score). **Sin llamadas adicionales.**
- **Validación en servidor obligatoria**: la IA alucina ids — descartar toda sugerencia cuyo id
  no exista o no pertenezca al hogar (comprobación contra el catálogo ya cargado).
- Precedencia: la sugerencia IA solo se usa si NO hay alias aprendido ni match exacto
  (la IA nunca ve la tabla de aliases: no puede pisarla). Combinable con E6: mostrar como
  candidato preseleccionado en la revisión; el usuario confirma y se aprende el alias.
- Vigilar el tamaño del prompt si el catálogo crece (>500 productos: truncar a los más
  habituales por `purchase_count` y dejar el resto a E6).

**Pasos**
- [x] Ampliar `receipt-schema.ts` y `receipt-prompt.ts` (catálogo + instrucciones de sugerencia).
- [x] Pasar el catálogo a la llamada en `scanReceiptAction` + validación server-side del id.
- [x] Integrar con la precedencia de matching (alias > exacto > IA/fuzzy) y la UI de revisión.
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (E7):** migración `supabase/migrations/20260721150000_receipt_items_suggestion.sql`
> (`alter table receipt_items add column suggested_product_id uuid references products(id) on delete set null`)
> — aplicada al remoto (autorizada por el usuario 2026-07-21, `local == remote`). Tipos a mano. **Coste cero:
> misma llamada a Gemini.** `receipt-schema.ts`: cada línea gana `suggested_product_id: string|null` +
> `match_confidence: 'high'|'low'|null`. `receipt-prompt.ts`: `RECEIPT_PROMPT` pasa a `buildReceiptPrompt(catalog)`
> que embebe el catálogo del hogar (`id — nombre`) con instrucciones de sugerir el id exacto o null (no inventar
> ids). `scanReceiptAction`: carga el catálogo (id+nombre) ordenado por `purchase_count` y capado a
> `MAX_CATALOG_FOR_PROMPT`=300 (el resto lo cubre el fuzzy de E6), construye el prompt con él, y **valida
> server-side** cada `suggested_product_id` contra el conjunto de ids mostrados —se persiste **solo** si el id
> existe Y la línea NO tiene ya match exacto (`match_status === 'new_product'`), respetando la precedencia alias
> > exacto > IA. Nunca auto-asocia: `product_id` sigue null hasta que el usuario confirma. `getReceiptItems`
> devuelve `suggestedProductId`; `getReceiptSuggestions` (E6) prioriza la sugerencia IA persistida (si sigue
> siendo producto válido del hogar) sobre el top-1 fuzzy. La IA **nunca ve la tabla de aliases** (solo el
> catálogo id—nombre). `npx tsc --noEmit` y `npx eslint .` limpios. Verificación con imagen real + Gemini y
> precisión de la sugerencia: pendiente del usuario (requiere sesión + llamada IA; no verificable en headless).

**Criterios de aceptación**
- Sin llamadas de IA adicionales, las líneas sin alias llegan a la revisión con sugerencia
  preseleccionada correcta la mayoría de veces.
- Nunca llega a la UI (ni a la BD) un `product_id` inexistente o de otro hogar.
- Un alias aprendido gana siempre a la sugerencia de la IA.

---

### E8 — Gestión de aliases aprendidos

**Idea original:** ninguna directa — hueco detectado en el análisis: un alias mal aprendido
envenena silenciosamente todos los escaneos futuros (matchea `auto` para siempre) y hoy no
hay forma de verlo ni corregirlo salvo SQL a mano.

**Contexto actual**
- `product_aliases` (migración `20260719134500_receipts.sql`): unique por
  `(household_id, alias_normalized)`, RLS por hogar ya existente. Se aprende en
  `confirmReceiptAction` (upsert con `ignoreDuplicates`); no existe ninguna UI de lectura/borrado.

**Diseño propuesto**
- Gestión **mínima**, no CRUD completo: en el drawer de edición del producto
  (`src/features/inventory/components/edit-item-drawer.tsx`) o en una sección propia, listar
  los aliases que apuntan a ese producto ("Nombres en tickets: GAZPACHO HACEND. ×") con opción
  de borrar cada uno. Server Action `deleteAliasAction(aliasId)` + `revalidatePath`.
- Borrar un alias no toca historial de precios ni inventario: solo hace que el siguiente
  escaneo de esa línea vuelva a pedir decisión.

**Pasos**
- [x] Query de aliases por producto + `deleteAliasAction`.
- [x] Listado con borrado en el drawer de edición (targets ≥ 44px, `aria-label` en el botón ×).
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (E8):** sin migración. En `src/features/receipts/actions.ts`:
> `getProductAliasesAction(productId)` (lectura bajo demanda; devuelve `{id, alias}[]`, ordenados por
> antigüedad; la RLS de `product_aliases` restringe al hogar) y `deleteAliasAction(aliasId)` (borra +
> `revalidatePath("/inventario")`; no toca historial de precios ni inventario). En
> `src/features/inventory/components/edit-item-drawer.tsx`: al abrir el drawer se cargan los aliases del
> producto (carga perezosa en `useEffect`, un fetch por apertura; cada tarjeta tiene su propia instancia
> de drawer, así que el `productId` no cambia dentro de una instancia). Sección "Nombres en tickets"
> (solo si hay aliases) con una nota aclaratoria y una lista donde cada alias tiene un botón × (`size="icon"`
> = 44px, `aria-label` "Borrar el nombre «…»") que borra optimista y revierte si el server falla. Gestión
> **mínima** (leer + borrar), no CRUD. `npx tsc --noEmit` y `npx eslint .` limpios. Verificación interactiva
> limitada por Clerk (headless).

**Criterios de aceptación**
- Puedo ver que "GAZPACHO HACEND." apunta a "Gazpacho" y borrar esa asociación.
- El siguiente escaneo de esa línea vuelve a pedir decisión (ya no matchea `auto`).

---

### E9 — Fusionar productos duplicados

**Idea original:** ninguna directa — consecuencia inevitable del análisis: los duplicados ya
creados (antes de E1/E2) fragmentan el historial de precios, y con precios en juego la fusión
es valiosa, no solo limpieza.

**Contexto actual**
- Referencias a `products`: `receipt_items.product_id` (historial de precios),
  `product_aliases.product_id`, `inventory_items.product_id` (unique
  `(household_id, product_id, location)`), `recipe_ingredients.product_id`,
  `shopping_list_items` (verificar su esquema en `20260719131524_shopping_list.sql`),
  `user_pinned_products` si E5 ya está hecha.

**Diseño propuesto**
- **RPC transaccional** en Postgres `merge_products(p_source uuid, p_target uuid)` (mismo
  patrón de guardas y grants que los RPCs de D1): valida que ambos productos son del hogar del
  llamante y son distintos; repunta TODAS las referencias al destino; casos especiales:
  - `inventory_items`: si (target, location) ya existe, fusionar cantidades en la fila destino
    y borrar la origen — si las unidades difieren, conservar la del destino SIN sumar y dejar
    la cantidad del destino (documentar; coherente con la política de E3).
  - `product_aliases`: repuntar con `on conflict (household_id, alias_normalized) do nothing`.
  - Añadir un alias nuevo: el `normalized_name` del producto origen → destino (así los
    tickets futuros que traían el nombre del duplicado matchean solos).
  - `purchase_count`: sumar al destino; `min_quantity`/`default_*`: conservar los del destino.
  - Borrar el producto origen al final.
- **UI mínima**: "Fusionar con…" en el drawer de edición del producto + combobox buscable
  (reutilizar el componente de E1) + confirmación clara ("El historial de precios de ambos se
  unirá; esta acción no se puede deshacer").
- Migración con el RPC: pedir autorización antes de `npx supabase db push`; tipos a mano.

**Pasos**
- [x] Migración con `merge_products` (+ guardas, revoke/grant patrón D1) — aplicada al remoto.
- [x] `mergeProductsAction` + UI en el drawer de edición con confirmación destructiva.
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (E9):** migración `supabase/migrations/20260721160000_merge_products.sql`
> — RPC `merge_products(p_source, p_target)` plpgsql `security definer` (patrón de D1: `clerk_user_id()`
> + `is_household_member`, `revoke … from public, anon` / `grant … to authenticated`). Guardas:
> autenticado, `source <> target`, ambos productos existen, mismo hogar y el llamante es miembro (un
> producto de otro hogar → excepción). Repunta TODAS las referencias al destino en una transacción:
> `receipt_items.product_id` **y** `suggested_product_id` (E7), `recipe_ingredients`, `shopping_list_items`;
> aliases con manejo del unique `(household_id, alias_normalized)` (borra los del origen que colisionarían,
> repunta el resto y añade el `normalized_name` del origen como alias del destino con
> `on conflict do nothing`, para que tickets futuros con el nombre del duplicado matcheen solos);
> inventario respetando el unique `(household_id, product_id, location)` —suma solo si la unidad coincide
> (política de E3: si difieren, conserva la del destino SIN sumar), borra las filas del origen que colisionan
> por ubicación y repunta el resto—; `user_pinned_products` (pk `user_id, product_id`, borra colisiones y
> repunta); suma `purchase_count` y `greatest(last_purchased_at)` al destino conservando sus `min_quantity`/
> `default_*`; borra el producto origen. **Aplicada al remoto** (autorizada por el usuario 2026-07-21,
> `local == remote`). Tipos: `merge_products` añadido a `Functions` en `types.ts`. En
> `src/features/inventory/actions.ts`: `getMergeCandidatesAction(exclude)` (otros productos del hogar para
> el combobox) y `mergeProductsAction(source, target)` (llama al RPC, mapea las excepciones a español).
> UI en `edit-item-drawer.tsx`: sección "Fusionar con otro producto" (candidatos cargados al abrir) con el
> `ProductCombobox` compartido de E1 + botón destructivo "Fusionar «actual» en «destino»" y aviso de que
> une el historial y no se puede deshacer; al fusionar cierra y `router.refresh()`. `npx tsc --noEmit` y
> `npx eslint .` limpios. Verificación funcional de la fusión (datos reales, gráficas de /precios) y de la
> excepción por hogar ajeno: limitada por Clerk (headless); las guardas están garantizadas por el RPC.

**Criterios de aceptación**
- Fusionar "Leche Entera" en "Leche" deja un solo producto cuyo historial de precios (gráficas
  de `/precios`) incluye las líneas de ambos; sin filas huérfanas ni violaciones de unique.
- Tras fusionar, un ticket nuevo con el nombre del producto eliminado matchea al destino.
- Un usuario de otro hogar no puede invocar el RPC sobre estos productos (excepción SQL).

---

### E10 — Robustez transaccional de la confirmación del ticket (menor)

**Idea original:** ninguna directa — detectado en el análisis.

**Contexto actual**
- `confirmReceiptAction` hace ~6–8 queries por línea, en bucle secuencial y sin transacción:
  un ticket de 40 líneas es lento, y un fallo a mitad deja el ticket a medias (algunas líneas
  en inventario, otras no, y el receipt quizá sin marcar `confirmed`).

**Diseño propuesto**
- Opción preferente: mover la confirmación a un **RPC transaccional** de Postgres que reciba el
  payload de decisiones y haga todo el trabajo (aliases, productos nuevos, inventario, precios,
  `bump_product_purchase`, estado del receipt) en una transacción.
- Alternativa mínima si el RPC crece demasiado: batching de queries por fase (todas las
  lecturas juntas, todas las escrituras juntas) + manejo de errores que deje el estado
  reintentable (no marcar `confirmed` hasta que todas las líneas estén procesadas).
- Coordinar con E3 (la política de unidades debe vivir en un solo sitio, sea TS o SQL).

**Pasos**
- [x] Elegir enfoque (RPC vs batching) y documentar el porqué en el código.
- [x] Implementar (sin migración: batching + reintento idempotente en TS).
- [x] `npx tsc --noEmit` y `npx eslint .` limpios.

> **Nota de implementación (E10):** sin migración. **Enfoque elegido: batching de lecturas + reintento
> idempotente en TS** (la alternativa "mínima" del plan), NO el RPC transaccional. Motivo documentado en
> el código: el RPC obligaría a reimplementar `normalizeName` en SQL (NFD + quita diacríticos + colapsa
> espacios), cuya divergencia con la versión TS rompería la unicidad `(household_id, normalized_name)` y el
> matching de aliases — arriesgado para el historial de precios, el activo central que protege el bloque E —
> y a mover la política de unidades de E3 a SQL. El batching mantiene normalización y política de unidades
> en un solo sitio (TS, ya verificado) y cumple los criterios. En `confirmReceiptAction`
> (`src/features/receipts/actions.ts`): las ~3 lecturas por línea (buscar producto enlazado, buscar por
> nombre, buscar fila de inventario, leer raw_text) se sustituyen por **3 lecturas por lote** (catálogo,
> inventario y líneas del ticket del hogar) resueltas en mapas en memoria (`productByNorm`, `productById`,
> `invByKey`, `itemById`), que se mantienen al día al crear productos/inventario dentro del bucle (dedup
> dentro del ticket incluido). Un ticket de 40 líneas pasa de ~1+40×3 = 121 SELECTs a 1+3 = 4.
> **Reintentabilidad sin duplicar:** el ticket solo se marca `confirmed` al final; si falla a mitad sigue
> `needs_review`, y al reintentar se saltan las líneas con `added_to_inventory = true` (procesadas en el
> intento previo) — no re-suma stock ni re-bumpea habitualidad. La política de unidades de E3 se conserva
> intacta (única, en TS). `npx tsc --noEmit` y `npx eslint .` limpios. Verificación funcional (ticket real
> de 40 líneas, fallo simulado a mitad) limitada por Clerk (headless).

**Criterios de aceptación**
- Un fallo a mitad de confirmación no deja estado inconsistente (o queda claramente
  reintentable sin duplicar inventario).
- Confirmar un ticket de 40 líneas tarda un tiempo razonable (sin N×8 round-trips secuenciales).

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
- **Sin reordenación manual drag & drop del inventario** (bloque E): choca con el orden por urgencia (que es una feature deliberada de la app, no un accidente), exige tabla de posiciones per-user + indexación fraccional + drag móvil en lista scrolleable (conflictos con tap-to-edit y stepper), y WCAG 2.2 §2.5.7 obligaría a construir además una alternativa sin arrastre. La necesidad real ("cada miembro usa insumos distintos") la cubren los pines de E5. Reevaluar solo si los pines se quedan cortos tras uso real.
- **Sin filtro por categoría en el inventario** (E4): la agrupación por ubicación + buscador + chips de estado cubren el caso; si tras uso real hiciera falta, iría en un sheet de filtros (vaul), nunca como segunda fila permanente de chips.
- **Precedencia de matching en tickets** (E6/E7): alias aprendido > nombre exacto > sugerencia IA / candidato fuzzy > producto nuevo. Solo los dos primeros asocian automáticamente; IA y fuzzy únicamente **sugieren** y es el usuario quien confirma (y esa confirmación aprende el alias). La IA nunca ve la tabla de aliases y sus ids se validan server-side siempre.
- **Sin conversión automática de unidades** (E3/E9): ud↔kg↔L no es convertible sin datos por producto; la política es no sumar unidades distintas en silencio y avisar al usuario.
- **Presets de caducidad aditivos, no más presets** (F2): la petición "2 semanas, 3 semanas, 1 mes y una semana" se resuelve haciendo que los 3 chips existentes SUMEN sobre la fecha actual, no añadiendo más chips fijos (que no escalan y saturan la fila en móvil).
- **Suficiencia de ingredientes solo dentro de la misma familia de unidades** (F3): comparar "¿tengo bastante?" solo cuando receta e inventario comparten familia (`unitFamily` de `src/lib/units.ts`: g↔kg, ml↔l, ud↔ud); entre familias solo se muestra el stock, sin veredicto. Coherente con E3/E9.
- **`pack_size` NO es conversión de unidades** (F4): es un multiplicador de ENTRADA para productos contables (`ud`) — "1 compra = N unidades". No convierte entre familias ni toca la política de E3; el consumo sigue siendo de 1 en 1.
- **Sin un evento por pulsación del stepper** (F5): los cambios rápidos se pliegan en un solo evento por ventana de tiempo (folding); un historial con 10 filas de "−1 ud" en 20 segundos es ruido, no información.
- **Historial sin lotes ni edición** (F5): los eventos son un registro append-only simplificado (producto, delta, tipo, quién, cuándo); no se editan ni se enlazan a lotes/caducidades (coherente con D7).

---

> **Prompt para el siguiente agente (Bloque E):**
>
> ```
> Continúa con el proyecto Fill Good (C:\Users\Jorge\Desktop\Food). Lee primero AGENTS.md
> (sistema de diseño: solo tokens semánticos, touch targets ≥44px, drawers en móvil, UI en
> español) y las "Instrucciones para el agente" al inicio de TODO.md. Los bloques A, B, C y D
> están terminados; implementa el Bloque E, tarea a tarea y con un commit por tarea, en este
> orden: E1 → E2 → E3 → E4 → E5, y después E6–E10 (E6, E7 y E9 se apoyan en la UI de E1).
>
> Estado de la BD: proyecto Supabase enlazado por CLI (supabase/.temp/linked-project.json).
> Verifica el estado con `npx supabase migration list --linked` (solo lectura). Las
> migraciones nuevas (E5 y E9 seguro; E6/E10 según diseño) requieren AUTORIZACIÓN del usuario
> antes de `npx supabase db push`. Los tipos en src/lib/supabase/types.ts se mantienen a mano.
>
> Cada tarea del Bloque E en TODO.md es autocontenida (contexto con rutas de archivo,
> diseño propuesto, pasos y criterios de aceptación). No amplíes el alcance: lo descartado
> está en "Notas de alcance" (en particular: NADA de drag & drop en inventario, nada de
> conversión de unidades, y la precedencia de matching alias > exacto > IA/fuzzy > nuevo es
> fija). Al terminar cada tarea: `npx tsc --noEmit` y `npx eslint .` limpios, verificar los
> criterios en el preview cuando sea posible (límite conocido: login de Clerk no verificable
> en headless), marcar sus checkboxes y el estado global, y dejar una "Nota de implementación"
> bajo la tarea siguiendo el formato de las de A–D.
> ```

---

## Bloque F — Feedback de usuarios (2026-07-22)

Tareas surgidas de feedback directo de usuarios sobre la app en uso real. Ordenadas
por impacto/esfuerzo: F1 y F2 son mejoras pequeñas de UI, F3 expone infraestructura
que ya existe, F4 y F5 tocan el modelo de datos. F1–F3 son independientes entre sí;
**F4 y F5 comparten puntos de escritura** (confirmación de ticket, checkout, stepper):
si se hacen ambas, implementar F4 primero para que los eventos del historial (F5)
registren cantidades ya convertidas por pack.

### F1 — Nombres de producto legibles en las tarjetas (2 líneas en vez de recorte)

**Idea original:** en la lista de inventario se cortan los nombres y hay que entrar
pulsando en cada producto para leerlo entero.

**Contexto actual**
- `src/features/inventory/components/inventory-item-card.tsx` (~línea 114): el nombre
  lleva `block truncate font-medium` — una sola línea con elipsis. El stepper de la
  derecha (2 botones de 44px + número) es fijo y NO puede encogerse (touch targets
  obligatorios del sistema de diseño), así que a nombres reales de ticket ("Bolsas de
  pimientos tricolor", "Contramuslos de pollo") les quedan pocos caracteres visibles.
- El mismo patrón `truncate` está en `expiry-review.tsx` (~línea 107) y probablemente
  en otras tarjetas de features (lista de la compra, revisión de ticket) — auditar con
  `grep -rn "truncate" src/features/`.

**Diseño propuesto**
- Sustituir `truncate` por **`line-clamp-2 break-words`** en el nombre de producto de
  la tarjeta de inventario y de la revisión de caducidades. El contenedor ya tiene
  `min-w-0 flex-1` (necesario para que el clamp funcione dentro del flex; conservarlo).
- Nombres de una línea se ven exactamente igual que hoy; los largos pasan a dos líneas
  y solo los extremos (> 2 líneas) recortan con elipsis al final de la segunda.
- **No** reducir el stepper, ni el tamaño de fuente, ni añadir tooltips (inútiles en táctil).
- Auditar el resto de `truncate` en `src/features/**` y aplicar el mismo criterio SOLO
  donde el texto recortado sea un nombre de producto/receta que el usuario necesita leer
  (badges y metadatos de una palabra pueden seguir truncando).

**Pasos**
- [x] `line-clamp-2 break-words` en `inventory-item-card.tsx` y `expiry-review.tsx`.
- [x] Auditoría de `truncate` en `src/features/**` y aplicar el criterio donde toque
      (documentar en la nota de implementación qué se cambió y qué se dejó).
- [ ] Verificar en preview móvil (375px) con nombres largos reales del catálogo.
      — PENDIENTE de verificación manual (login de Clerk no verificable en headless).

**Criterios de aceptación**
- "Bolsas de pimientos tricolor" se lee completo en la tarjeta sin entrar a editar.
- Los nombres cortos no cambian de aspecto; el stepper no se mueve ni pierde tamaño.
- La fila de badges (caducidad, "Quedan pocas"…) sigue sin solaparse con el nombre.

> **Nota de implementación (F1):** sin migración (solo clases de Tailwind). Se cambió
> `truncate` por `line-clamp-2 break-words` en el nombre de producto de tres tarjetas donde
> el usuario necesita leer el nombre completo: `inventory-item-card.tsx` (~línea 114, el
> caso principal del feedback), `expiry-review.tsx` (~línea 107, revisión post-compra) y
> `menu-view.tsx` (~línea 818, nombre de producto en el diálogo de descuento de stock del
> menú). El contenedor conserva `min-w-0 flex-1` (necesario para que el clamp funcione dentro
> del flex) y el stepper no cambia de tamaño. **Se dejó `truncate` a propósito** donde una
> sola línea es el patrón correcto y el texto no es un nombre que haya que leer entero:
> `product-autocomplete.tsx:140` (sugerencia de dropdown, UX estándar de una línea),
> `edit-item-drawer.tsx:393` (alias, normalmente una palabra), `menu-view.tsx:859`
> (ingrediente en la lista secundaria "No se descuenta", con su razón a la derecha),
> `receipt-review.tsx:244` (metadato `xs` atenuado), `household-card.tsx:141` (nombre de
> hogar en chip) y `spending-panel.tsx:68,247` (labels/metadatos del panel de gasto).
> `npx tsc --noEmit` y `npx eslint .` limpios.

---

### F2 — Chips de caducidad aditivos (cada toque suma tiempo)

**Idea original:** en la pantalla de caducidades, poder añadir más tiempo con los
botones — 2 semanas, 3 semanas, o 1 mes y una semana.

**Contexto actual**
- `src/features/inventory/components/expiry-review.tsx`: `useExpiryPresets()` (~líneas
  27–47) genera 3 presets **exclusivos** que fijan una fecha absoluta (hoy+3d, hoy+7d,
  hoy+1mes); el render (~líneas 123–139) los pinta como toggles (`aria-pressed`,
  `variant="default"` si la fecha coincide exactamente; repulsar deselecciona).
- **El desajuste de fondo:** la etiqueta "+1 semana" ya sugiere suma; el usuario espera
  que dos toques den 2 semanas y hoy el segundo toque DESELECCIONA. El feedback confirma
  ese modelo mental aditivo.
- El drawer de edición (`edit-item-drawer.tsx`) y el alta (`add-product-drawer.tsx`)
  tienen `<input type="date">` sin presets — mismo campo, sin atajos.

**Diseño propuesto**
- **Semántica aditiva:** cada toque suma sobre la fecha seleccionada actual (o sobre HOY
  si está vacía). "+1 semana" ×2 → hoy+14 días; "+1 mes" y luego "+1 semana" → hoy+1mes+7d.
  Mantener los 3 chips actuales (+3 días · +1 semana · +1 mes); NO añadir más presets
  (ver "Notas de alcance").
- Los chips dejan de ser toggles: quitar `aria-pressed` y el estado seleccionado; son
  **botones de acción** (siempre `variant="outline"`). La fecha resultante ya se ve en el
  `<input type="date">` de debajo (feedback inmediato); editarla a mano sigue funcionando
  y los chips suman sobre lo editado.
- Botón **"Borrar"** (texto, no solo icono) junto a los chips, visible solo cuando hay
  fecha, que resetea a null (la caducidad es opcional y debe poder quitarse fácil).
- Sumar meses con la misma lógica actual (`setMonth`, que ya maneja fin de mes); cap
  defensivo: ignorar toques que dejarían la fecha a más de +5 años.
- **Extraer el grupo** (chips + input + borrar + hint de D7) a un componente compartido
  `src/features/inventory/components/expiry-quick-picker.tsx` y usarlo en los TRES
  puntos: revisión post-compra, `edit-item-drawer.tsx` y `add-product-drawer.tsx`
  (estos dos ganan los atajos que hoy no tienen).

**Pasos**
- [ ] Componente `ExpiryQuickPicker` (chips aditivos + input date + borrar + hint D7).
- [ ] Integrarlo en `expiry-review.tsx` (sustituye a los presets exclusivos).
- [ ] Integrarlo en `edit-item-drawer.tsx` y `add-product-drawer.tsx`.
- [ ] `npx tsc --noEmit` y `npx eslint .` limpios.

**Criterios de aceptación**
- Dos toques a "+1 semana" → fecha = hoy + 14 días, visible en el input.
- "+1 mes" y luego "+1 semana" → hoy + 1 mes + 7 días.
- "Borrar" limpia la fecha; guardar sin fecha sigue siendo válido (es opcional).
- Los mismos atajos aparecen al editar un producto y al darlo de alta.

---

### F3 — Ingredientes de receta vinculados al catálogo con stock visible

**Idea original:** en recetas, que el ingrediente se sincronice con los que ya tienes,
para saber si tienes suficiente o no.

**Contexto actual — la infraestructura ya existe casi entera**
- `recipe_ingredients.product_id` existe desde `20260719143638_menus.sql`; al guardar,
  `src/features/recipes/actions.ts` ya vincula por `normalized_name` exacto (B1), pero
  de forma **silenciosa**: el usuario no ve ni controla el vínculo.
- El campo ingrediente de `src/features/recipes/components/recipe-form.tsx` es un
  `<Input>` de texto libre sin sugerencias.
- Componentes reutilizables: `ProductAutocomplete`
  (`src/features/shopping-list/components/product-autocomplete.tsx`, A2 — texto libre
  con sugerencias) y `ProductCombobox` (`src/components/product-combobox.tsx`, E1 —
  selección pura). Para este caso encaja el patrón **autocomplete** (el ingrediente DEBE
  poder ser texto libre: "perejil fresco" puede no estar en el catálogo).
- Stock: `getInventory()` (`src/features/inventory/queries.ts`); `unitFamily` y
  `baseUnitFactor` en `src/lib/units.ts` permiten comparar g↔kg y ml↔l con exactitud.

**Diseño propuesto**
- **Autocompletado en el campo ingrediente:** al escribir, sugerencias del catálogo del
  hogar (patrón A2: filtro con `normalizeName`, orden por habitualidad). Elegir una
  sugerencia fija `productId` explícito en el estado de la fila (`IngredientRow` gana
  `productId: string | null`); seguir escribiendo texto libre lo deja en null. Adaptar
  `ProductAutocomplete` o crear una variante ligera — decidir al implementar y documentar;
  NO duplicar la lógica de filtrado.
- **Badge de stock por fila** (en vivo, junto al nombre): con `productId` resuelto
  (elegido, o match exacto por nombre normalizado mientras escribe):
  - Sin stock → badge neutro "No lo tienes".
  - Con stock y **misma familia de unidades** que la cantidad pedida → comparar en unidad
    base (`baseUnitFactor`): "Tienes 500 g" en `success` si alcanza, `warning` si no.
  - Con stock y familia distinta (receta en g, inventario en ud) → mostrar SOLO el stock
    ("Tienes 2 ud"), sin veredicto de suficiencia (ver "Notas de alcance").
  - Sin cantidad en la receta → solo presencia ("En casa" / "No lo tienes").
- **Persistencia:** `RecipeInput`/`recipeInputSchema` (`schemas.ts`) ganan `productId`
  opcional por ingrediente; al guardar, el id explícito tiene **prioridad** sobre el
  linkado silencioso por nombre (que queda como fallback para filas de texto libre).
  Validar server-side que el `productId` pertenece al hogar (mismo patrón que E7).
- **Datos:** la página del formulario (Server Component) carga catálogo ligero + stock
  agregado por producto (suma de cantidades de todas las ubicaciones + unidad) y los pasa
  al form. Snapshot al abrir es suficiente; sin realtime.
- **Beneficio lateral:** los ingredientes con `product_id` explícito son el nivel 1 del
  matching de `computeMissingIngredients` (D3) — "añadir a la lista lo que falte" gana
  precisión gratis.

**Pasos**
- [ ] Estado + schema: `productId` por fila de ingrediente, validado server-side.
- [ ] Autocompletado del catálogo en el campo ingrediente (reutilizar/adaptar A2).
- [ ] Badge de stock con las reglas de familia de unidades (helpers de `src/lib/units.ts`).
- [ ] Guardar con prioridad del id explícito sobre el matching por nombre.
- [ ] `npx tsc --noEmit` y `npx eslint .` limpios.

**Criterios de aceptación**
- Escribir "le" sugiere "Leche" con su stock; elegirla vincula el ingrediente y al
  reabrir la receta el vínculo persiste.
- Receta que pide 300 g teniendo 500 g en inventario → "Tienes 500 g" en verde;
  teniendo 100 g → aviso de insuficiente.
- Receta que pide 300 g de algo que el inventario mide en ud → muestra el stock sin
  veredicto (nunca compara familias distintas).
- Un ingrediente de texto libre sin match sigue funcionando exactamente como hoy.
- Tras vincular, "añadir a la lista lo que falte" del menú matchea ese ingrediente por
  nivel 1 (product_id).

---

### F4 — Pack de compra: "1 caja = N unidades" al entrar al inventario

**Idea original:** para productos que vienen en cajas, un medidor de conversión tipo
1 caja = 30 unidades, para que al comprarlo entren 30 sobres al inventario y luego ir
gastándolos de uno en uno.

**Contexto actual**
- `products` solo tiene `default_unit` (`20260719121808_inventory.sql`); no hay noción
  de pack. El ticket dice "1 ud" (la caja) y entra 1 ud al inventario, aunque dentro
  haya 30 sobres que se consumen sueltos con el stepper.
- Puntos de entrada al inventario por compra: `confirmReceiptAction`
  (`src/features/receipts/actions.ts`) y `checkoutAction`
  (`src/features/shopping-list/actions.ts`, ~líneas 255–290). La cantidad de línea ya es
  editable en la revisión del ticket (`receipt-review.tsx`).
- Política E3 vigente: unidades distintas no se suman en silencio. El pack NO la toca
  (ver "Notas de alcance"): es un multiplicador de entrada para contables, no una
  conversión entre familias.

**Diseño propuesto**
- **Migración** `products_pack_size`:
  - `alter table public.products add column pack_size numeric(10, 2) check (pack_size > 0);`
  - `null` = sin pack (comportamiento actual intacto). Semántica: *"cada unidad comprada
    añade `pack_size` unidades al inventario"*. Tipos a mano en `src/lib/supabase/types.ts`.
- **UI de producto:** campo numérico opcional "Unidades por compra" en
  `edit-item-drawer.tsx` y `add-product-drawer.tsx`, con hint:
  *"Si lo compras en cajas (p. ej. 30 sobres), pon cuántas unidades trae cada compra."*
  Solo visible/aplicable cuando la unidad del producto es `ud` (`isCountable`).
- **Aplicar en la entrada:** en `confirmReceiptAction` y `checkoutAction`, si el producto
  tiene `pack_size` y el movimiento es en `ud`, la cantidad que entra al inventario es
  `cantidad × pack_size`. El precio del ticket NO se toca (sigue siendo por línea/caja).
- **Transparencia en la revisión del ticket:** en la línea afectada, mostrar la conversión
  ("1 ud × pack de 30 → entran 30 ud") ANTES de confirmar; si un día se compra suelto,
  el usuario edita la cantidad o el resultado a mano (la cantidad de línea ya es editable).
- **(Opcional, si sale barato)** en `/precios`: mostrar €/unidad junto al precio de compra
  dividiendo por `pack_size` cuando exista (coherente con `unitFamily`: solo contables).
- **Consumo sin cambios:** el stepper sigue gastando de 1 en 1; `min_quantity` y "Quedan
  pocas" operan sobre unidades sueltas, que es lo que el usuario cuenta.

**Pasos**
- [ ] Migración `pack_size` (autorización antes de `npx supabase db push`) + tipos a mano.
- [ ] Campo "Unidades por compra" en los dos drawers (solo `ud`, con hint).
- [ ] Multiplicador en `confirmReceiptAction` y `checkoutAction` + aviso de conversión
      visible en la revisión del ticket.
- [ ] (Opcional) €/unidad en `/precios` cuando hay pack.
- [ ] `npx tsc --noEmit` y `npx eslint .` limpios.

**Criterios de aceptación**
- Con "Croquetas" configurado a pack 30: confirmar un ticket con 1 ud añade 30 ud al
  inventario y la revisión muestra la conversión antes de confirmar.
- Checkout de la lista con 2 ud de ese producto → entran 60 ud.
- Productos sin `pack_size` no cambian en absoluto (null = hoy).
- El historial de precios sigue registrando el precio por línea de ticket (por caja),
  sin duplicar ni dividir importes.

---

### F5 — Historial de movimientos de stock (consumido / tirado / repuesto)

**Idea original:** un historial de movimientos con fecha para revisar qué se ha ido
gastando esta semana o reponiendo.

**Contexto actual**
- `inventory_events` existe desde M8 (`20260721190000_inventory_events.sql`): household,
  producto, cantidad, unidad, `kind ('consumed'|'discarded')`, `created_by`, `created_at`,
  con índice `(household_id, created_at)`. **Pero solo registra bajas por borrado**
  (`deleteInventoryAction`, `src/features/inventory/actions.ts` ~línea 391).
- Los dos flujos principales NO dejan rastro: el stepper +/−
  (`setInventoryQuantityAction`, ~línea 176 — optimista, alta frecuencia, sin
  `revalidatePath`) y las altas por compra (`checkoutAction`, `confirmReceiptAction`).
- La RLS de `inventory_events` solo tiene políticas de select/insert/delete (sin UPDATE)
  — el folding del diseño necesita añadirla.
- `getHouseholdMembers` (D1) ya da los display names para mostrar quién hizo cada movimiento.

**Diseño propuesto**
- **Migración** `inventory_events_history`:
  - `alter type public.inventory_event_kind add value if not exists 'restocked';`
    (ojo Postgres: el valor nuevo NO puede usarse en la misma migración/transacción que
    lo crea — no meter backfills que lo usen en este archivo).
  - Política y grant de **UPDATE** sobre `inventory_events` (miembros del hogar), necesarios
    para el folding.
- **Escrituras** (todas las cantidades ya convertidas por pack si F4 está hecha):
  - `setInventoryQuantityAction`: leer la cantidad previa en la misma acción, calcular el
    delta y registrar `consumed` (delta negativo) o `restocked` (positivo) con `|delta|`.
    **Folding anti-ruido:** si el último evento del mismo (household, product, kind,
    created_by) tiene `created_at` en los últimos ~15 minutos, actualizar su cantidad
    sumando en vez de insertar otro (por eso la política de UPDATE). Documentar la ventana
    como constante.
  - `checkoutAction` y `confirmReceiptAction`: un evento `restocked` por producto realmente
    añadido al inventario (respetando E3: las líneas no sumadas por unidad distinta no
    generan evento).
  - `deleteInventoryAction`: sin cambios (ya registra `consumed`/`discarded`).
  - Los fallos al registrar evento NO deben romper la operación principal (mismo patrón
    best-effort que el insert actual de M8).
- **Lectura/UI:** página `src/app/(app)/inventario/historial/page.tsx` enlazada desde la
  cabecera de `/inventario` (icono reloj con `aria-label`, no robar espacio a E4):
  - Server Component; query de eventos de los últimos 30 días (el índice
    `(household_id, created_at)` ya lo cubre), join con producto y miembros.
  - Lista agrupada por día ("Hoy", "Ayer", fecha) con icono/color por tipo — semántica de
    tokens: `success` repuesto, neutro consumido, `destructive` tirado —, producto,
    `±cantidad unidad` y quién.
  - Resumen de la semana en cabecera: "Esta semana: +X repuestos · −Y consumidos ·
    −Z tirados" (conteo simple de eventos; la valorización en euros del desperdicio ya
    vive en el panel de gasto de M8 — no duplicarla aquí).
- **Fuera de alcance:** editar/borrar eventos desde la UI, retención/purga (>30 días solo
  deja de mostrarse, no se borra), historial por producto individual (si el global se queda
  corto, se añade luego un filtro; no construirlo ahora).

**Pasos**
- [ ] Migración (`restocked` + política/grant de UPDATE) con autorización + tipos a mano.
- [ ] Eventos con folding en `setInventoryQuantityAction` (delta server-side).
- [ ] Eventos `restocked` en `checkoutAction` y `confirmReceiptAction`.
- [ ] Página `/inventario/historial` (30 días, agrupada por día, resumen semanal) + enlace.
- [ ] `npx tsc --noEmit` y `npx eslint .` limpios.

**Criterios de aceptación**
- Bajar 3 ud con el stepper (3 toques seguidos) produce UN evento `consumed` de 3 ud
  (folding), visible en el historial con fecha y autor.
- Confirmar un ticket genera un `restocked` por producto añadido; finalizar compra de la
  lista, también.
- El historial distingue de un vistazo consumido/tirado/repuesto con tokens semánticos y
  agrupa por día; el resumen semanal cuadra con los eventos listados.
- Borrar un item tirándolo sigue apareciendo como `discarded` (M8 intacto) y el panel de
  gasto no cambia.

---

> **Prompt para el siguiente agente (Bloque F):**
>
> ```
> Continúa con el proyecto Fill Good (C:\Users\Jorge\Desktop\Food). Lee primero AGENTS.md
> (sistema de diseño: solo tokens semánticos, touch targets ≥44px, ResponsiveModal para
> overlays, UI en español) y las "Instrucciones para el agente" al inicio de TODO.md.
> Los bloques A–E están terminados; implementa el Bloque F, tarea a tarea y con un commit
> por tarea, en este orden: F1 → F2 → F3 → F4 → F5 (F1–F3 son independientes; F4 antes
> que F5 porque el historial debe registrar cantidades ya convertidas por pack).
>
> Estado de la BD: proyecto Supabase enlazado por CLI (supabase/.temp/linked-project.json).
> Verifica el estado con `npx supabase migration list --linked` (solo lectura). Las
> migraciones nuevas (F4 y F5) requieren AUTORIZACIÓN del usuario antes de
> `npx supabase db push`. Los tipos en src/lib/supabase/types.ts se mantienen a mano
> (NO regenerar con la CLI).
>
> Cada tarea del Bloque F en TODO.md es autocontenida (contexto con rutas de archivo,
> diseño propuesto, pasos y criterios de aceptación). No amplíes el alcance: lo descartado
> está en "Notas de alcance" (en particular: chips de caducidad ADITIVOS en vez de más
> presets; suficiencia de ingredientes solo dentro de la misma familia de unidades;
> pack_size NO es conversión de unidades; folding de eventos del stepper, nunca un evento
> por pulsación; historial append-only sin lotes). Al terminar cada tarea:
> `npx tsc --noEmit` y `npx eslint .` limpios, verificar los criterios en el preview
> cuando sea posible (límite conocido: login de Clerk no verificable en headless), marcar
> sus checkboxes y el estado global, y dejar una "Nota de implementación" bajo la tarea
> siguiendo el formato de las de A–E.
> ```
