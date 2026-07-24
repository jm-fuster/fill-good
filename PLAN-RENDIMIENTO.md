# Plan de rendimiento — navegación entre pestañas y confirmación de tickets

> **Para el agente ejecutor:** este plan es autocontenido. Lee primero `AGENTS.md` (raíz del repo)
> y la sección [Reglas innegociables](#reglas-innegociables) antes de tocar nada. Ejecuta las fases
> en orden; cada fase es un commit (o PR) independiente y deja la app funcional.

## Contexto y diagnóstico

Fill Good (Next.js 16 App Router + Supabase vía PostgREST + Clerk) es lenta en dos puntos:

### Problema A — Confirmar un ticket ("añadir a inventario") tarda 10–20 s

`confirmReceiptAction` en `src/features/receipts/actions.ts` hace, dentro del bucle
`for (const dec of payload.items)`, **~5 llamadas HTTP secuenciales a Supabase por línea de ticket**:

1. upsert en `product_aliases`
2. update de `receipt_items`
3. update o insert de `inventory_items`
4. insert en `inventory_events` (vía `recordStockEvent`)
5. RPC `bump_product_purchase` (una por línea)
6. (+ insert en `products` si la línea crea producto nuevo)

Un ticket de 30 líneas ≈ 150+ round-trips secuenciales (~50–200 ms cada uno). Además,
`notifyPriceRises` (que internamente re-escanea todo `receipt_items` vía `getPriceAlerts`) se
espera con `await` **antes** de responder al cliente. La lectura previa ya está batcheada (E10);
el problema son solo las **escrituras**.

`scanReceiptAction` (mismo archivo) también inserta las líneas en `receipt_items` una a una.

### Problema B — Cambiar de pestaña es lento y empeora con el uso

1. **Escaneos completos del histórico en cada render.** `getInferredChains()` y
   `getChainSavingsTips()` (`src/features/prices/queries.ts`) descargan **todas** las filas de
   `receipt_items` del hogar y agregan en Node. Se ejecutan en cada render de `/inventario`
   (vía `getInventory`) y de `/lista` (vía `getListItems`). En `/lista`, el mismo histórico se
   descarga 3–4 veces por render (`getChainSavingsTips` recomputa internamente lo mismo que
   `getInferredChains`, y `getSuggestions` vuelve a bajar `receipt_items`). El coste crece
   linealmente con cada ticket confirmado.
2. **Cero caché de navegación.** `src/app/(app)/layout.tsx` fuerza `dynamic = "force-dynamic"` y no
   hay `staleTimes` configurado: cada toque en la bottom nav re-renderiza la página completa en el
   servidor. No hay `React.cache()` en ninguna query (`getCurrentHousehold` se repite en layout y
   queries dentro del mismo request).
3. **Waterfalls.** `/lista` espera `getActiveList()` antes del `Promise.all`; `/menus` encadena
   hasta 5 tandas secuenciales; el badge del shell (`getActiveListBadge`) son 2 queries secuenciales.

## Reglas innegociables

- **Lee `node_modules/next/dist/docs/`** antes de usar cualquier API de Next (es Next 16 con
  breaking changes respecto a tu entrenamiento). En concreto para este plan:
  `01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md` y la doc de `after`
  (`grep -rl "after" node_modules/next/dist/docs/01-app/03-api-reference/04-functions/`).
- **`src/lib/supabase/types.ts` se mantiene A MANO.** NO regenerar con la CLI de Supabase
  (romperías los alias `UnitType`/`LocationType` importados por todo el repo). Tras cada migración,
  edita a mano las tablas/funciones afectadas.
- **Migraciones** en `supabase/migrations/` con nombre `YYYYMMDDHHMMSS_snake_case.sql` (mira las
  existentes). Ejecuta el plan de principio a fin sin pausas: crea la migración y aplícala con
  `supabase db push` directamente (el proyecto ya está enlazado por la CLI). No pares a pedir
  confirmación.
- **Embeds de `receipt_items` → `products`:** hay DOS FKs. Nombra siempre la relación
  (`products!receipt_items_product_id_fkey`) o PostgREST devuelve PGRST201.
- **No reimplementar en SQL** `normalizeName` ni la política de unidades (E3): viven en TS, en un
  único sitio, a propósito. Las RPCs nuevas de este plan son mecánicas (contadores), sin lógica de
  negocio.
- No tocar `src/components/ui/button.tsx` ni `input.tsx`; UI en español; solo tokens semánticos;
  overlays vía `ResponsiveModal`; anchos vía `PageContainer`.
- La verificación por navegador está bloqueada en este entorno (un dev server por carpeta + login
  Clerk): verifica con `npm run typecheck`, `npm run lint` y `npm run build:check`; lo visual y las
  mediciones de tiempo las hace el usuario después.
- **Ejecuta el plan completo del tirón**, sin detenerte a pedir permiso en ningún paso (migraciones,
  `db push`, backfill incluidos). Solo párate si algo falla de forma irrecuperable o si el enunciado
  de una fase es genuinamente ambiguo.
- Mantener el reintento PGRST303 (`jwt-retry.ts`) y el cliente por-request de
  `src/lib/supabase/server.ts` tal cual.

---

## Fase 1 — Confirmación de ticket por lotes (impacto mayor)

**Objetivo:** `confirmReceiptAction` debe hacer un número de llamadas a Supabase **independiente
del nº de líneas** (~8 llamadas en total), y responder al cliente sin esperar a los push.

### 1.1 Migración: RPC de contadores por lote

Nueva migración `supabase/migrations/<timestamp>_bump_product_purchases_batch.sql`:

```sql
-- Versión por lote de bump_product_purchase (una llamada por ticket en vez de
-- una por línea). Acepta duplicados: un producto comprado en 2 líneas suma +2.
create or replace function public.bump_product_purchases(pids uuid[])
returns void
language sql
as $$
  update public.products p
  set purchase_count = p.purchase_count + c.cnt,
      last_purchased_at = now()
  from (
    -- agregamos duplicados: un producto comprado en 2 líneas suma +2
    select id, count(*) as cnt
    from unnest(pids) as id
    group by id
  ) c
  where p.id = c.id;
$$;
```

> Contrato: **acepta duplicados y suma una unidad por aparición**, igual que hoy hace una llamada
> por línea. Añade
> `grant execute on function public.bump_product_purchases(uuid[]) to authenticated;`.
> Referencia de estilo: `supabase/migrations/20260720073534_products_habits.sql`.

Actualiza a mano `src/lib/supabase/types.ts` (sección `Functions`) con la nueva RPC.
**No borres** `bump_product_purchase` (singular): la usan otros flujos.

### 1.2 Reescritura de `confirmReceiptAction` (src/features/receipts/actions.ts)

La estructura actual: lecturas batcheadas (mantener tal cual) → bucle con escrituras por línea
(sustituir). Nueva estructura en dos pasadas:

**Pasada 1 — resolución en memoria (sin ningún `await`):**
- Recorre `payload.items` reutilizando los mapas ya cargados (`itemById`, `productByNorm`,
  `productById`, `packByProduct`, `invByKey`).
- Resuelve por línea: skip / ya procesada (idempotencia `added_to_inventory`) / producto enlazado /
  producto existente por nombre normalizado / **producto nuevo** (acumula en una lista
  `newProducts`, deduplicada por `normalized_name` dentro del propio ticket).
- Simula el inventario en memoria con `invByKey` **exactamente igual que el bucle actual**: misma
  política de unidades (si la unidad difiere de la fila existente → warning y NO se suma), misma
  conversión de pack (F4: `invQty = quantity × pack_size` solo si la compra es en `ud`), mismo
  contador `added` y mismas `warnings`. Esto ya existe en el código: solo estás quitando los
  `await` de dentro del bucle, no cambiando semántica.

**Pasada 2 — escrituras por lotes, en este orden (que replica el orden por-línea actual):**
1. **Productos nuevos:** un único `.insert([...]).select("id, normalized_name, default_location, pack_size")`
   con todos los `newProducts`. Vuelca los ids devueltos a los mapas (por `normalized_name`) y
   re-resuelve las líneas que dependían de ellos.
2. **Aliases:** un único `.upsert([...], { onConflict: "household_id,alias_normalized", ignoreDuplicates: true })`
   con todas las filas (deduplicadas por `alias_normalized` en TS antes de enviar).
3. **Líneas de ticket:** los updates de `receipt_items` tienen valores distintos por fila, y
   PostgREST no tiene update masivo. Usa `Promise.all` **por chunks de ~10** de los updates
   individuales actuales (pasan de N secuenciales a ~N/10 tandas paralelas). Alternativa válida si
   prefieres 1 llamada: una RPC mecánica `update ... from jsonb_to_recordset(...)` (sin lógica de
   negocio; los valores vienen calculados de TS).
4. **Inventario:** separa lo simulado en `invByKey` en (a) filas existentes con cantidad final
   distinta → `Promise.all` chunked de updates `{ quantity, updated_by }`; (b) filas nuevas → un
   único `.insert([...]).select("id, product_id, location")`. Reconstruye `inventoryItemIds` en el
   orden de las líneas del payload (mapeando por `product_id + location`), que es el orden que
   espera `/inventario/revision`. Deduplicar ids repetidos es aceptable (mejora el
   comportamiento actual).
5. **Historial:** un único `.insert([...])` en `inventory_events` con todos los eventos
   `restocked` (envuelto en try/catch best-effort, mismo criterio que `recordStockEvent`; aquí no
   se usa `fold`). No modifiques `src/features/inventory/events.ts` (lo usan los steppers).
6. **Habitualidad:** una llamada a la nueva RPC `bump_product_purchases` con el array de
   `productId` **una entrada por línea** (con duplicados), replicando el conteo actual.
7. **Cierre del ticket:** el update final de `receipts` a `confirmed` queda igual.

**Invariantes que deben sobrevivir (verifícalos releyendo el código actual antes de reescribir):**
- Idempotencia: líneas con `added_to_inventory = true` se saltan y cuentan en `added`.
- Conflicto de unidades (E3): warning con el texto actual, sin sumar stock, sin evento.
- Pack (F4): el inventario recibe cantidad × pack; la línea del ticket conserva la cantidad de compra.
- Descuentos (M1): `discountTotal` desde `raw_extraction`, igual que hoy.
- Dedup intra-ticket: dos líneas con el mismo nombre nuevo crean UN producto.
- `match_status`: `manual` / `new_product` / `skipped` como hoy.
- Los tres `revalidatePath` se mantienen.

### 1.3 `notifyPriceRises` fuera del camino crítico

Sustituye el `await notifyPriceRises(...)` por el `after()` de Next (importado de `next/server`;
**lee antes su doc en `node_modules/next/dist/docs`** para confirmar nombre e importación exactos
en Next 16.2). El cliente recibe la respuesta al cerrar el ticket; los push salen después.

### 1.4 `scanReceiptAction`: insert de líneas por lote

En el mismo archivo, el bucle `for (const item of products)` con un insert por línea pasa a
construir el array completo (el matching exacto ya es síncrono en memoria) y hacer **un único**
`.insert([...])` en `receipt_items`. `position` se asigna con el índice del array.

**Criterio de aceptación Fase 1:** confirmar un ticket de N líneas ejecuta ≤ 8 llamadas a Supabase
más ~N/10 tandas paralelas de updates (nunca N×5 secuenciales), y la respuesta no espera a los push.

---

## Fase 2 — Materializar señales de precios + dedupe por request

**Objetivo:** que ningún render de pestaña descargue el histórico completo de `receipt_items`.
Las cadenas inferidas y los avisos de ahorro **solo cambian cuando cambia el histórico** (confirmar
ticket, fusionar productos, cambiar tienda preferida), así que se calculan ahí y se persisten.

### 2.1 Migración: columnas materializadas en `products`

Nueva migración `<timestamp>_product_price_insights.sql`:

```sql
alter table public.products
  add column inferred_chain text,
  add column savings_tip jsonb;

comment on column public.products.inferred_chain is
  'Cadena habitual inferida del histórico de tickets (L15 f2). Materializada al confirmar ticket / fusionar / cambiar preferencia. null = sin señal.';
comment on column public.products.savings_tip is
  'Aviso de ahorro {currentChain, cheaperChain, savingsPct} (L15 f3). Materializado junto a inferred_chain. null = sin aviso.';
```

Sin cambios de RLS (`products` ya está restringida por hogar). Actualiza `types.ts` a mano
(Row/Insert/Update de `products`).

### 2.2 Módulo de materialización

Nuevo `src/features/prices/materialize.ts` con
`refreshPriceInsights(supabase, householdId, productIds: string[])`:

1. Si `productIds` está vacío, return.
2. Dos lecturas en `Promise.all`, **filtradas por esos productos** (no todo el histórico):
   `receipt_items` (`product_id, total_price, quantity, store_chain` con `.in("product_id", ids)`
   y los mismos `not is null` que usa hoy `getChainSavingsTips`) y `products`
   (`id, preferred_chain` con `.in("id", ids)`).
3. Reutiliza **las funciones existentes** `computeInferredChains` (`infer-chain.ts`) y
   `computeChainSavings` (`chain-savings.ts`) — no dupliques su lógica. La cadena efectiva es
   `manual ?? inferida`, igual que hoy en `getChainSavingsTips`.
4. `Promise.all` de updates por producto (`inferred_chain`, `savings_tip`); son pocos productos por
   invocación. Best-effort: un fallo aquí no debe romper la acción llamante (try/catch + console.error).

**Puntos de llamada** (búscalos y confírmalos con grep antes de editar):
- `confirmReceiptAction`: dentro del `after()` de la Fase 1, con `affectedProductIds`, ANTES de
  `notifyPriceRises`.
- `mergeProductsAction` (`src/features/inventory/actions.ts`, RPC `merge_products`): refrescar el
  producto destino tras la fusión.
- La acción de editar producto en `src/features/inventory/actions.ts` que escribe
  `preferred_chain` (~línea 294): si `preferred_chain` cambia, refrescar ese producto (el aviso de
  ahorro depende de la cadena efectiva).
- Haz `grep -rn "receipt_items" src/features --include=actions.ts` por si existe algún otro sitio
  que mute el histórico (p. ej. borrado de tickets) y añádelo.

### 2.3 Lecturas: quitar los escaneos de los renders

- `getInventory` (`src/features/inventory/queries.ts`): elimina `getInferredChains()` y
  `getChainSavingsTips()` del `Promise.all`; añade `inferred_chain, savings_tip` al embed de
  `products` que ya hace, y mapea `inferredChain`/`savings` desde ahí (castea `savings_tip` al tipo
  `ChainSavingsTip`).
- `getListItems` (`src/features/shopping-list/queries.ts`): ídem.
- `getShoppingModeItems`: sustituye `getInferredChains()` por el embed. `getLatestUnitPrices()` se
  queda (solo corre en `/lista/compra`, no en las pestañas; materializarlo es mejora opcional futura).
- Las páginas de `/precios` siguen calculando en vivo desde el histórico: es su función y son
  páginas secundarias. No las toques.
- Verifica que tras esto **nadie más** importa `getInferredChains`/`getChainSavingsTips` en
  renders de pestañas (`grep -rn "getInferredChains\|getChainSavingsTips" src/`). Consérvalas
  exportadas si `/precios` u otros las usan.

### 2.4 Backfill (script, NO migración)

La lógica de inferencia vive en TS y no debe duplicarse en SQL ni siquiera para el backfill.
Crea `scripts/backfill-price-insights.mjs` (o `.mts`): usa `@supabase/supabase-js` con
`SUPABASE_SERVICE_ROLE_KEY` desde env (nunca hardcodeada, nunca commiteada), recorre los hogares,
y para cada uno ejecuta la misma lógica de `refreshPriceInsights` sobre todos sus productos con
histórico. **Ejecútalo tú** una vez creado (`SUPABASE_SERVICE_ROLE_KEY` está en `.env.local`;
cárgala e invoca el script con node), para que las columnas materializadas queden pobladas desde el
primer despliegue. Documenta igualmente en el propio script cómo relanzarlo. Si por lo que sea no
puedes ejecutarlo, las columnas quedan `null` (= sin pista, el mismo comportamiento que un producto
sin señal hoy: degradación aceptable, no un bug) y reaparecen al confirmar el siguiente ticket.

### 2.5 `React.cache()` para dedupe por request

Envuelve en `cache()` (de `react`):
- `getCurrentHousehold` (`src/features/household/queries.ts`) — hoy se ejecuta en el layout y
  otra vez dentro de varias queries en el mismo request.
- `getLatestUnitPrices`, `getInferredChains`, `getChainSavingsTips` (`src/features/prices/queries.ts`)
  — siguen existiendo para `/precios` y el modo compra; el cache elimina recomputaciones dobles
  dentro de un mismo render.

Patrón: `export const getCurrentHousehold = cache(async (): Promise<...> => { ... });`
(mismo nombre exportado; no cambies las firmas).

**Criterio de aceptación Fase 2:** los renders de `/inventario` y `/lista` no ejecutan ninguna
query sin filtro sobre `receipt_items`; el nº de peticiones a Supabase de `/lista` baja de ~9 a ~5.

---

## Fase 3 — Navegación: caché de router y waterfalls

### 3.1 `staleTimes` para el Router Cache

En `next.config.ts`, dentro de `experimental` (junto al `serverActions` existente):

```ts
staleTimes: { dynamic: 30 },
```

**Lee antes** `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md`
para confirmar sintaxis/semántica en 16.2. Efecto: volver a una pestaña visitada hace < 30 s es
instantáneo (sirve el payload cacheado del cliente). Las mutaciones propias siguen refrescando vía
`revalidatePath` en las Server Actions, y `/lista` tiene Realtime. Trade-off asumido y documentado:
un cambio hecho por OTRO miembro del hogar puede tardar hasta 30 s en verse al alternar pestañas.
Deja un comentario en el config explicando esto.

### 3.2 Aplanar `/menus` (src/app/(app)/menus/page.tsx)

Hoy: `getWeekMenu(actual)` → `Promise.all(entradas, reglas, recetas, prefs)` → si vacío
`getWeekMenu(anterior)` → `getMenuEntries(anterior)` → `getRecipeCostsForIds` (hasta 5 tandas).
Objetivo (~2–3 tandas):
- Amplía `src/features/menus/queries.ts` con una query que traiga **las dos semanas de una vez**
  (`.in("week_start", [actual, anterior])`) y las entradas de ambos menús en una sola query
  (`.in("menu_id", [...])`), o una función `getWeekMenusWithEntries(weeks)` equivalente.
- `canCopyPrevious` se decide en memoria con lo ya cargado.
- `getRecipeCostsForIds` sigue necesitando las entradas: queda como segunda tanda.

### 3.3 Badge del shell en una query (src/features/shopping-list/queries.ts)

`getActiveListBadge` hace 2 queries secuenciales (lista → count). Únelas en una sola con count
embebido y filtrado:

```ts
supabase
  .from("shopping_lists")
  .select("id, shopping_list_items(count)")
  .eq("status", "active")
  .eq("shopping_list_items.is_checked", false)
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();
```

Verifica el shape de la respuesta del count embebido de supabase-js v2 con un typecheck (es
`[{ count: number }]`). Si el filtro sobre el embed diera problemas, el fallback es mantener las 2
queries pero es dependiente (necesita el id), así que el embed es la vía.

### 3.4 Primera tanda de `/lista` (src/app/(app)/lista/page.tsx)

`getProductCatalog()` no depende de `list.id`: muévela a un `Promise.all` junto a
`getActiveList()`. El resto (`getListItems`, `getSuggestions`, `getHabitualProducts`) sí dependen y
quedan en la segunda tanda.

### 3.5 Opcional (solo si todo lo demás está verde)

Streaming con `<Suspense>`: renderizar `PageHeader` estático de inmediato y suspender solo la
zona de datos en `/inventario` y `/lista`. Mejora percepción, no tiempos totales. No lo hagas si
implica reestructurar componentes compartidos.

**Criterio de aceptación Fase 3:** `npm run build:check` en verde (no subas `BUDGET_KB`);
alternar entre pestañas ya visitadas no dispara render de servidor dentro de la ventana de 30 s.

---

## Verificación final (todas las fases)

1. `npm run typecheck` — sin errores.
2. `npm run lint` — sin warnings (preset jsx-a11y/strict con `--max-warnings 0`).
3. `npm run build:check` — build + presupuesto de bundle en verde sin tocar `BUDGET_KB`.
4. Migraciones: créalas en `supabase/migrations/` y **aplícalas tú con `supabase db push`** (sin
   pedir permiso; el proyecto ya está enlazado). Tras aplicarlas, `types.ts` ya debe estar editado a
   mano (paso de cada fase). Ejecuta también el script de backfill (Fase 2.4).
5. No hay verificación por navegador en este entorno. Entrega al usuario esta checklist manual:
   - Confirmar un ticket de 20+ líneas: debe tardar 1–3 s, no 10–20 s, y el toast salir al momento.
   - Reintento de idempotencia: confirmar, recargar `/escanear/<id>/revisar` a mitad y reconfirmar
     no debe duplicar stock.
   - `/inventario` y `/lista` deben cargar igual de rápido con muchos tickets en el histórico.
   - Alternar Inventario ↔ Lista ↔ Menús: la segunda visita dentro de 30 s es instantánea.
   - Los avisos de ahorro y la cadena inferida reaparecen tras confirmar el siguiente ticket (o
     tras ejecutar el script de backfill).
   - Medir en build de producción (`npm run build && npm start`), no en `next dev`.

## Qué NO hacer

- No regenerar `src/lib/supabase/types.ts` con la CLI (se edita a mano).
- No reimplementar `normalizeName` ni la política de unidades E3 en SQL.
- No cambiar el proveedor de IA ni salir del free tier de Gemini.
- No quitar `dynamic = "force-dynamic"` del layout `(app)` (depende de sesión por request).
- No introducir `useIsMobile` en el shell, ni `Drawer`/`Dialog` directos, ni colores inline.
- No tocar `button.tsx`/`input.tsx` (touch targets deliberados).
- No eliminar el reintento PGRST303 (`jwt-retry.ts`).
- No pararte a pedir permiso a mitad de ejecución: el plan se ejecuta entero (migraciones,
  `db push` y backfill incluidos). Para solo ante un fallo irrecuperable o una ambigüedad real.

## Orden de commits sugerido

1. `perf(tickets): confirmación de ticket por lotes + notificaciones en after()` (Fase 1 completa).
2. `perf(precios): materializa cadena inferida y aviso de ahorro en products` (Fase 2.1–2.4).
3. `perf(queries): dedupe por request con React.cache` (Fase 2.5).
4. `perf(nav): staleTimes de router cache + waterfalls de menús/lista/badge` (Fase 3).
