# Plan de mejoras — honestidad del flujo de tickets, UX móvil y PWA

> **Para el agente ejecutor:** este plan es autocontenido. Lee primero `AGENTS.md` (raíz del repo)
> y la sección [Reglas innegociables](#reglas-innegociables) antes de tocar nada. Ejecuta las fases
> en orden; cada fase es un commit independiente y deja la app funcional. Las referencias a líneas
> son orientativas (código vivo): **verifica cada punto con grep/lectura antes de editar**.

## Contexto y diagnóstico

Auditoría de julio 2026 sobre Fill Good (Next.js 16 App Router + Supabase + Clerk + Serwist).
El estado general es bueno: sistema de diseño cumplido, seguridad por hogar consistente,
formularios con estados correctos. Los problemas encontrados, por gravedad:

1. **Fallos silenciosos en el flujo central.** `confirmReceiptAction`
   (`src/features/receipts/actions.ts`) no comprueba `error` en varias escrituras (insert de
   productos nuevos ~L414, updates de `receipt_items` ~L480, updates/insert de inventario
   ~L599/L610, cierre del ticket ~L664). Un fallo de BD devuelve `{ ok: true, added: 0 }` y el
   usuario ve un toast de éxito creyendo que su compra entró al inventario.
2. **CTAs que se cuelgan.** `confirm()` en `receipt-review.tsx:153` y `save()` en
   `expiry-review.tsx:37` hacen `setPending(true)` y `await` la acción **sin try/catch**: si la
   Server Action lanza (red), `setPending(false)` no se ejecuta y el botón queda en "Guardando…"
   para siempre. `scan-form.tsx:40-51` sí lo hace bien (referencia del patrón).
3. **Tickets huérfanos.** Si el usuario abandona `/escanear/[id]/revisar`, no hay forma de volver
   al ticket (la página `/escanear` no lista pendientes) ni de borrarlo (no existe
   `deleteReceiptAction`). La retención de BD los borra a los 30 días, pero durante ese tiempo son
   inaccesibles salvo por URL.
4. **Push que promete lo que no existe.** `push-card.tsx:27-31` ofrece tres toggles pero solo
   "Avisos de precio" tiene emisor (`notifyPriceRises`). "Caducidades" (resumen diario) y
   "Reposición" guardan la preferencia y jamás envían nada.
5. **UX móvil:** el botón atrás no cierra los bottom sheets (navega fuera); faltan `loading.tsx`
   en 6 rutas; borrado de inventario sin confirmación ni deshacer; `window.confirm` nativo en
   "abandonar hogar"; touch targets de 36px en acciones frecuentes.
6. **PWA floja:** sin prompt de instalación ni guía iOS, manifest sin `id`/`categories`/maskable
   192, página offline sin acción de recuperación.
7. **IA sin timeout ni distinción de rate-limit** (free tier de Gemini): un 429 se presenta igual
   que "foto borrosa".

Este plan NO incluye migraciones de esquema (las preferencias push ya existen en
`push_subscriptions`: `pref_expiry`, `pref_price`, `pref_restock`).

## Reglas innegociables

- **Lee `node_modules/next/dist/docs/`** antes de usar cualquier API de Next (es Next 16 con
  breaking changes): convenciones de `loading.tsx`, Route Handlers, `after`.
- **`src/lib/supabase/types.ts` se mantiene A MANO** — no regenerar con la CLI. Este plan no
  cambia el esquema, así que no debería hacer falta tocarlo.
- **No tocar** `src/components/ui/button.tsx` ni `input.tsx` (touch targets deliberados).
- UI en español; **solo tokens semánticos** (`bg-primary`, `text-warning`…); overlays vía
  `ResponsiveModal`; anchos vía `PageContainer` (`narrow`/`default`/`wide`).
- La única excepción legítima para tocar internamente Drawer/Dialog es
  `src/components/ui/responsive-modal.tsx` (Fase 4.2): es el wrapper oficial.
- Mantener el reintento PGRST303 (`jwt-retry.ts`), el cliente por-request de
  `src/lib/supabase/server.ts` y `dynamic = "force-dynamic"` del layout `(app)`.
- No salir del free tier de Gemini; no añadir dependencias nuevas (todo lo necesario —
  `web-push`, `@supabase/supabase-js` — ya está instalado).
- Verificación: `npm run typecheck`, `npm run lint` (jsx-a11y/strict, `--max-warnings 0`) y
  `npm run build:check` (no subas `BUDGET_KB`). La verificación por navegador está bloqueada en
  este entorno; lo visual lo valida el usuario con la checklist final.
- **Ejecuta el plan completo del tirón**, sin pedir permiso entre fases. Párate solo ante un fallo
  irrecuperable o una ambigüedad real.

---

## Fase 1 — Honestidad del flujo de confirmación (correctitud, impacto mayor)

**Objetivo:** ningún fallo de escritura puede terminar en toast de éxito, y ningún CTA puede
quedarse colgado. El reintento sigue siendo idempotente.

### 1.1 Comprobar errores en `confirmReceiptAction` (src/features/receipts/actions.ts)

Hoy varias escrituras destructuran solo `{ data }`. Cambios, en el orden del código:

1. **Insert de productos nuevos** (~L414): captura `error`; si falla →
   `return { error: "No se pudieron crear los productos nuevos del ticket. Vuelve a intentarlo." }`.
   Es la **primera** escritura de la pasada 2, así que abortar aquí es seguro (nada parcial).
2. **Upsert de aliases** (~L470): best-effort deliberado (los aliases son capa de aprendizaje, no
   datos primarios). Captura `error` y solo `console.error` — deja un comentario que lo justifique.
3. **Updates de `receipt_items`** vía `inChunks` (~L480): haz que `inChunks` devuelva los
   resultados (o usa una variante) y comprueba `error` en cada respuesta. Si alguno falla →
   `return { error: "La confirmación falló a mitad. Vuelve a intentarlo: lo ya añadido no se duplicará." }`.
4. **Updates/insert de `inventory_items`** (~L599 y ~L610): comprueba `error` en ambos. Si falla →
   mismo mensaje de error que el punto 3.
5. **Cierre del ticket** (~L664): comprueba `error`; si falla →
   `return { error: "El inventario se actualizó pero el ticket no quedó cerrado. Vuelve a confirmarlo." }`
   (el reintento es seguro: las líneas ya marcadas `added_to_inventory` se saltan).

**Limitación conocida y asumida (documéntala en un comentario junto al punto 3):** las escrituras
no son transaccionales; un fallo entre el marcado de `receipt_items` y las escrituras de inventario
puede dejar líneas marcadas sin stock sumado. Ese hueco ya existía en el código por-línea original.
La solución completa sería una RPC transaccional mecánica (valores precomputados en TS) — **fuera
del alcance de este plan**; lo que corrige esta fase es que el fallo se COMUNIQUE en vez de
presentarse como éxito. No reordenes el flujo de escrituras: cualquier orden alternativo tiene un
modo de fallo parcial simétrico y perderías la idempotencia actual.

### 1.2 `try/catch/finally` en los clientes que hacen `setPending(true)`

Patrón de referencia: `scan-form.tsx:40-51`. Aplica el mismo criterio en:

- `src/features/receipts/components/receipt-review.tsx` → `confirm()` (~L153): envuelve desde la
  llamada a `confirmReceiptAction` en `try { … } catch { toast.error("No se pudo confirmar el ticket. Comprueba tu conexión e inténtalo de nuevo."); } finally { setPending(false); }`
  (elimina el `setPending(false)` suelto de ~L170).
- `src/features/inventory/components/expiry-review.tsx` → `save()` (~L37): ídem con
  `"No se pudieron guardar las caducidades. Inténtalo de nuevo."`.
- `src/features/shopping-list/components/shopping-list-view.tsx` → `addItem` (~L180): revisa si un
  throw de la acción deja el ítem optimista huérfano; si es así, envuelve en try/catch que revierta
  el optimista y muestre toast.

Haz un grep general por el antipatrón para no dejarte ninguno:
`grep -rn "setPending(true)" src/features` y verifica que cada uno tiene try/catch/finally o
`useTransition` con manejo de error.

### 1.3 `scanReceiptAction`: no dejar tickets sin líneas (~L162)

El insert de `receipt_items` no comprueba error. Si falla, borra el ticket recién creado
(`supabase.from("receipts").delete().eq("id", receipt.id)`) y devuelve
`{ error: "No se pudieron guardar las líneas del ticket. Vuelve a intentarlo." }`. Así no quedan
tickets "Productos (0 de 0)" imposibles de usar.

### 1.4 Empty state en la revisión sin productos

En `receipt-review.tsx`, cuando `items.length === 0` (la IA no detectó nada): renderiza el
componente `EmptyState` (`src/components/layout/empty-state.tsx`, mira usos existentes en
`src/app/(app)/recetas/page.tsx`) con un mensaje tipo "No se detectaron productos en el ticket.
Prueba con una foto más nítida y mejor iluminada." y un botón (asChild + Link) a `/escanear`.
El botón "Descartar ticket" llega en la Fase 2 — aquí basta el mensaje + volver.

**Criterio de aceptación Fase 1:** no existe ninguna ruta de código en la que una escritura fallida
de `confirmReceiptAction`/`scanReceiptAction` devuelva `ok: true`; ningún `setPending(true)` queda
sin `finally`; typecheck/lint/build en verde.

---

## Fase 2 — Tickets pendientes: reanudar, descartar, volver

**Objetivo:** un ticket escaneado nunca queda inaccesible; la página de revisión tiene salida clara.

### 2.1 Query de pendientes (src/features/receipts/queries.ts)

Nueva `getPendingReceipts()`: tickets del hogar con `status = "needs_review"`, ordenados por
`created_at desc`, con `id, store_name, purchased_at, created_at, total_amount` y el count de
líneas embebido (`receipt_items(count)`). Sigue el patrón de las queries existentes del archivo
(cliente por-request + hogar actual).

### 2.2 Listado en `/escanear` (src/app/(app)/escanear/page.tsx)

La página ya es Server Component. Debajo de `ScanForm`, si hay pendientes, añade una sección
"Pendientes de revisar" con una tarjeta por ticket (tienda o "Ticket sin tienda", fecha relativa,
nº de líneas) que enlaza a `/escanear/[id]/revisar`, y un botón secundario de descartar (2.3).
Respeta tokens y `rounded-xl` en tarjetas. Si no hay pendientes, no renderices nada (la página
actual queda igual).

### 2.3 `deleteReceiptAction` (src/features/receipts/actions.ts)

Nueva Server Action: valida hogar (`getCurrentHousehold`), borra el ticket **solo si**
`status != "confirmed"` (filtro `.neq("status", "confirmed")` además del `.eq` de id y hogar; el
FK de `receipt_items` es `on delete cascade`). Comprueba `error`. `revalidatePath("/escanear")`.
Úsala en:

- La tarjeta de pendientes de 2.2 (icono papelera con `aria-label="Descartar ticket"`).
- La página de revisión: botón "Descartar ticket" (variant ghost/destructive) junto a las acciones,
  y también como acción del empty state de la Fase 1.4.

La confirmación previa al borrado usa `ResponsiveModal` (nunca `window.confirm`): "¿Descartar este
ticket? Se perderá lo extraído por la IA." + botones "Descartar" (destructive) / "Cancelar".

### 2.4 Affordance de "volver" unificado en `PageHeader`

`src/components/layout/page-header.tsx` solo acepta `title/description/action`. Añade props
opcionales `backHref?: string` y `backLabel?: string` que rendericen, encima del título, un
`Link` con `ArrowLeft` (patrón visual ya existente a mano en
`src/app/(app)/inventario/historial/page.tsx` y `recetas/[id]` — cópialo de ahí y luego migra esas
páginas a la prop para no duplicar). Aplícalo en:

- `/escanear/[receiptId]/revisar` → `backHref="/escanear"`, `backLabel="Añadir ticket"`.
- `/inventario/historial`, `/recetas/nueva`, `/recetas/[id]`, `/ajustes/orden-tienda` → migra sus
  breadcrumbs artesanales a la prop.

El touch target del enlace debe ser ≥44px de alto efectivo (padding vertical o `min-h`).

### 2.5 Detalle: variant del loading de revisar — HECHO

Resuelto de raíz: `PageContainer` tiene un único ancho para toda la app (`app`, por defecto), así
que ninguna página ni su `loading.tsx` puede desajustarse. Ya no se pasa `variant` en la app.

**Criterio de aceptación Fase 2:** un ticket abandonado aparece en `/escanear` y se puede reanudar
o descartar; descartar pide confirmación con `ResponsiveModal`; la página de revisión tiene volver
y descartar; no queda ningún breadcrumb artesanal duplicando la nueva prop.

---

## Fase 3 — Push honesto: resumen de caducidades real y ocultar "Reposición"

**Objetivo:** los toggles de Ajustes solo prometen lo que existe. "Caducidades" pasa a funcionar de
verdad; "Reposición" se oculta hasta que se diseñe.

### 3.1 Route Handler del resumen diario

Nuevo `src/app/api/push/caducidades/route.ts` (GET). Lee antes la doc de Route Handlers en
`node_modules/next/dist/docs/`. Comportamiento:

1. **Auth de cron:** exige cabecera `Authorization: Bearer ${process.env.CRON_SECRET}`; si no
   coincide → 401. (Vercel Cron añade esa cabecera automáticamente cuando la env `CRON_SECRET`
   existe en el proyecto.)
2. **Cliente service-role:** este endpoint corre sin sesión de usuario; crea un cliente
   `@supabase/supabase-js` con la clave service-role desde env, **replicando cómo lo hace**
   `scripts/backfill-price-insights.mjs` (mismo nombre de env var; no la hardcodees ni la
   commitees). No uses `createServerSupabaseClient` (ese exige JWT de Clerk).
3. **Datos:** suscripciones con `pref_expiry = true` agrupadas por `household_id`; para cada hogar
   con suscriptores, `inventory_items` con `expiry_date` no nula, `quantity > 0` y
   `expiry_date <= hoy + 3 días`, con el nombre del producto embebido.
4. **Envío:** por hogar, un único push a todos sus targets vía `sendPush`
   (`src/lib/push/send.ts`): título `"Caducidades"`, tag `"expiry-digest"`, url `"/inventario"`.
   Body: 1 producto → `"{nombre} caduca {hoy|mañana|en N días}"`; varios →
   `"{n} productos caducan en los próximos 3 días"`. Borra los endpoints `gone` devueltos
   (obligatorio: ver el comentario de `sendPush` y el patrón de `notify.ts:55-57`).
5. **Respuesta:** JSON con contadores (hogares procesados, pushes enviados) para depurar.
6. Si `isPushConfigured()` es false, responde 200 con `{ sent: 0 }` (inerte sin claves VAPID,
   mismo criterio que el resto del push).

### 3.2 Programación

Crea `vercel.json` en la raíz con:

```json
{ "crons": [{ "path": "/api/push/caducidades", "schedule": "30 7 * * *" }] }
```

Documenta en un comentario del route handler: (a) que hay que definir `CRON_SECRET` en `.env.local`
y en el dashboard de Vercel (tarea del usuario, no puedes hacerla tú); (b) la alternativa
equivalente con `pg_cron` + `pg_net` llamando a la URL de producción con la cabecera, por si el
despliegue no está en Vercel (el proyecto ya usa `pg_cron`: ver
`supabase/migrations/20260723160000_data_retention.sql`). No la implementes: `vercel.json` es la
vía primaria.

### 3.3 Ocultar "Reposición"

En `src/features/push/components/push-card.tsx`, elimina la entrada `restock` de `PREF_LABELS`
con un comentario: la preferencia se conserva en BD (`pref_restock`) y en `DEFAULT_PREFS` para no
tocar el contrato de las actions, pero no se ofrece en UI hasta que exista un emisor. NO borres la
columna ni toques `src/features/push/actions.ts`.

**Criterio de aceptación Fase 3:** `curl -H "Authorization: Bearer $CRON_SECRET" /api/push/caducidades`
responde 200 con contadores; sin la cabecera responde 401; la card de Ajustes muestra solo
"Caducidades" y "Avisos de precio"; typecheck/lint/build en verde.

---

## Fase 4 — Estados de carga y botón atrás en móvil

### 4.1 `loading.tsx` para las 6 rutas que no tienen

Tienen: `ajustes`, `escanear/[id]/revisar`, `inventario`, `inventario/revision`, `lista`, `menus`,
`precios`, `precios/[productId]`. **Faltan:**

- `recetas` (fetch pesado: costes de todas las recetas)
- `recetas/nueva`
- `recetas/[id]`
- `lista/compra` (modo compra, bucle habitual)
- `inventario/historial`
- `ajustes/orden-tienda`

Patrón de referencia: `src/app/(app)/inventario/loading.tsx` (PageContainer + `LoadingStatus` +
`PageHeader` real + skeletons `aria-hidden`). Para cada ruta: **usa el mismo `variant` de
`PageContainer` y el mismo título/descripción que su `page.tsx`** (léelos antes; p. ej. `recetas`
es `wide`, `lista/compra` es `default`, `inventario/historial` es `narrow`) para que no haya salto
de layout al hidratar.

### 4.2 El botón atrás cierra los bottom sheets (solo rama móvil)

En `src/components/ui/responsive-modal.tsx` (el sitio legítimo para tocar Drawer): integra el
historial del navegador en la rama `Drawer` (< md). Diseño:

- Hook interno `useHistoryDismiss(open, onOpenChange)`: cuando `open` pasa a true →
  `history.pushState({ fgSheet: true }, "")`; listener de `popstate` → si el estado saliente era
  del sheet, `onOpenChange(false)`. Cuando el sheet se cierra por otra vía (botón, swipe, overlay)
  y la entrada del sheet sigue en el historial → `history.back()` consumiéndola (con un flag ref
  para no reentrar en el listener).
- Aplícalo SOLO en la rama móvil (`isDesktop === false`) y solo para modales **controlados** (con
  `open`/`onOpenChange`); los no controlados (trigger declarativo) pueden quedar fuera si complica
  — documenta la decisión. La rama Dialog de escritorio no se toca (Radix ya cierra con Escape).
- Cuidado con: dobles pushState si `open` rebota, navegación real con el sheet abierto (el
  popstate del router de Next no debe romperse: prueba navegar desde bottom nav con sheet abierto),
  y varios modales anidados (p. ej. confirmación dentro de un drawer — que cada instancia gestione
  su propia entrada).
- Esto NO es trivial en App Router. Si tras implementarlo detectas interferencia con el router de
  Next (URLs desincronizadas, back que salta dos páginas), **revierte este punto 4.2** y déjalo
  documentado como intento en el commit; el resto de la fase se mantiene.

**Criterio de aceptación Fase 4:** todas las rutas de `(app)` con fetch tienen `loading.tsx`
coherente en ancho y título; en móvil, atrás con un sheet abierto lo cierra y un segundo atrás
navega; en escritorio nada cambia.

---

## Fase 5 — Destructivos coherentes, touch targets y pulido

### 5.1 Borrado de inventario con red de seguridad

`src/features/inventory/components/edit-item-drawer.tsx` (~L622): "Eliminar del inventario" borra
a la primera. No añadas un modal sobre modal: usa **confirmación en dos toques** en el propio
botón — primer toque cambia a "¿Seguro? Eliminar" (mismo variant destructive, `aria-live` ya hay
en el contexto) y un segundo toque en <5 s ejecuta; pasado el tiempo o al cerrar, vuelve al estado
inicial. La rama que ya pregunta "¿qué ha pasado con lo que quedaba?" (~L595) se queda como está.

### 5.2 "Abandonar hogar" sin `window.confirm`

`src/features/household/components/household-card.tsx:72-81`: sustituye `window.confirm` por un
`ResponsiveModal` de confirmación (título "¿Abandonar este hogar?", descripción actual, botón
destructive "Abandonar" + "Cancelar"). Referencia de patrón: `delete-household-drawer.tsx` en la
misma carpeta (sin exigir escribir el nombre: abandonar es recuperable re-uniéndose con el código).

### 5.3 Fallback de error de `/lista` digno

`src/app/(app)/lista/page.tsx:24-33`: sustituye el `<p>` plano por `EmptyState` con icono, mensaje
("No se pudo cargar la lista") y un botón de reintento. En Server Component el reintento más
simple es un `<Link href="/lista">Reintentar</Link>` como botón (asChild); no montes client
component solo para `location.reload()`.

### 5.4 Touch targets en acciones frecuentes

- `src/features/menus/components/menu-view.tsx` ~L1231 y ~L1237: "Ver receta" y "Añadir a hoy"
  pasan de `size="sm"` a `size="default"`.
- `src/features/shopping-list/components/shopping-list-view.tsx` ~L771: chips de "Habituales"
  `size="sm"` → mismo tratamiento que los chips de "Sugerencias" (~L729: `h-auto` + padding que
  los deja ≥44px) o `size="default"`.
- Los botones "Reordenar"/"Agrupar" (~L316-333) pueden quedarse en `sm` (toolbar densa) — decisión
  consciente, no los toques.

Verifica después con grep que no queda ningún `size="xs"` en features y que los `size="sm"`
restantes son toolbars/contextos densos.

### 5.5 `/styleguide` solo en desarrollo

`src/app/styleguide/page.tsx`: al principio del componente,
`if (process.env.NODE_ENV === "production") notFound();` (import de `next/navigation`). En
`src/app/(app)/ajustes/page.tsx` (~L95, enlace "(desarrollo)"): renderiza el enlace solo si
`process.env.NODE_ENV !== "production"`.

**Criterio de aceptación Fase 5:** ninguna acción destructiva ejecuta a la primera sin
confirmación o deshacer; cero `window.confirm` en `src/`; lint en verde (los cambios de touch
target no rompen jsx-a11y).

---

## Fase 6 — PWA: instalación, manifest y offline

### 6.1 Manifest (src/app/manifest.ts)

- Añade `id: "/"` (identidad estable de la PWA entre despliegues).
- Añade `categories: ["food", "shopping", "lifestyle"]`.
- Icono maskable de 192: genera `public/icons/icon-maskable-192.png` reescalando el
  `icon-maskable-512.png` existente (one-off con PowerShell/System.Drawing o similar; el resultado
  se commitea, el script no) y añádelo al array `icons`.
- NO añadas `orientation` (bloquearía landscape en tablet/escritorio sin beneficio).
- `screenshots` requiere capturas reales → déjalo fuera y anótalo en la checklist final para el
  usuario.

### 6.2 Card de instalación en Ajustes

Nuevo `src/features/push/components/install-card.tsx` (o en `src/components/` si prefieres; es
transversal): client component que:

- Captura `beforeinstallprompt` (guarda el evento, `preventDefault()`), y muestra una Card
  ("Instala Fill Good", "Acceso directo, pantalla completa y notificaciones más fiables") con
  botón "Instalar app" que llama a `prompt()`. Tras `appinstalled` o si
  `matchMedia("(display-mode: standalone)")` ya es standalone → no renderizar nada.
- En iOS (detección por user agent + `!("onbeforeinstallprompt" in window)`): misma Card con
  instrucciones estáticas "En Safari: Compartir → Añadir a pantalla de inicio".
- Colócala en `src/app/(app)/ajustes/page.tsx` encima de la card de notificaciones (las push en
  iOS requieren la app instalada: el orden cuenta la historia correcta).

### 6.3 Página offline con recuperación

`src/app/offline/page.tsx`: conviértela en (o añádele) un client component con un botón
"Reintentar" (`location.reload()`) y un listener del evento `online` que recargue automáticamente
al volver la conexión. Mantén textos y estética actuales (tokens, `bg-muted`…).

### 6.4 Empujón al escaneo en el arranque

El onboarding aterriza en `/inventario` (StarterPicker "¿Qué tienes ya en casa?"). Sin cambiar esa
redirección: añade en el empty state / StarterPicker de `/inventario`
(`src/app/(app)/inventario/page.tsx` ~L81-90) un CTA secundario "O escanea tu primer ticket"
(Link a `/escanear`, variant outline) con una línea que venda el valor ("la IA añade los productos
y sus precios por ti"). Es la feature diferencial y hoy queda oculta tras la bottom nav.

**Criterio de aceptación Fase 6:** manifest con `id`, `categories` y maskable 192; card de
instalación visible en Ajustes (en dev se puede verificar el render, no el prompt); offline con
reintento; CTA de escaneo visible con inventario vacío; `npm run build:check` en verde (la card es
pequeña; no debería mover el presupuesto).

---

## Fase 7 — IA robusta y defensas menores

### 7.1 Timeout y rate-limit en las llamadas a Gemini

En `src/features/receipts/actions.ts` (~L86) y `src/features/menus/actions.ts` (~L272, y
cualquier otro `generateObject`/`streamObject` — grep `generateObject\|streamText\|streamObject`):

- Añade `abortSignal: AbortSignal.timeout(60_000)` a la llamada (verifica el nombre exacto del
  parámetro en los tipos del paquete `ai` instalado).
- En el `catch`, distingue: error 429/rate-limit (inspecciona con las clases del AI SDK —
  `APICallError.isInstance(err)` y `statusCode`, teniendo en cuenta que tras reintentos puede
  venir envuelto en `RetryError`; confirma las clases exactas en los tipos de `ai`) → mensaje
  `"El servicio de IA está saturado ahora mismo. Espera un minuto y vuelve a intentarlo."`;
  timeout/abort → `"La lectura del ticket tardó demasiado. Vuelve a intentarlo."`; resto → el
  mensaje genérico actual. Mantén el `console.error` con el error completo.

### 7.2 Check defensivo de hogar en las acciones de alias

`getProductAliasesAction` y `deleteAliasAction` (`src/features/receipts/actions.ts` ~L175-202)
confían solo en RLS. Alinéalas con el patrón del resto: `getCurrentHousehold()` + filtro
`.eq("household_id", household.id)` en la query/delete. Conserva el comentario sobre RLS,
actualizándolo (defensa en profundidad, no sustitución).

### 7.3 Limpieza de repo

`PLAN-RENDIMIENTO.md` está sin trackear pero su plan ya se ejecutó (commits #5 y #6). Commitealo
junto a este archivo (`PLAN-MEJORAS-UX.md`) en el primer commit del plan, igual que se hizo con
`PLAN-LIMPIEZA-DATOS.md` (documentación de decisiones).

**Criterio de aceptación Fase 7:** un 429 simulado (o forzado bajando el timeout a 1 ms en local)
produce el mensaje específico, no el genérico; las acciones de alias filtran por hogar; repo sin
archivos sin trackear.

---

## Verificación final (todas las fases)

1. `npm run typecheck` — sin errores.
2. `npm run lint` — sin warnings (jsx-a11y/strict, `--max-warnings 0`).
3. `npm run build:check` — build + presupuesto de bundle en verde sin tocar `BUDGET_KB`.
4. Grep de regresiones: `window.confirm` (0 en src), `setPending(true)` sin finally (0),
   `size="xs"` en features (0), `Drawer`/`Dialog` importados fuera de `ui/` (0).
5. No hay verificación por navegador en este entorno. Checklist manual para el usuario:
   - Confirmar un ticket con la red cortada a mitad: debe salir un toast de error, no "0 productos
     añadidos", y el botón debe recuperarse.
   - Escanear, abandonar la revisión, volver a `/escanear`: el ticket aparece en "Pendientes" y se
     puede reanudar y descartar (con confirmación).
   - Móvil: abrir cualquier bottom sheet y pulsar atrás → se cierra el sheet, no cambia de página.
   - Navegar a `/recetas` y `/lista/compra` con datos: aparece skeleton, no pantalla congelada.
   - Ajustes: solo dos toggles de push; con `CRON_SECRET` configurado en Vercel, el resumen de
     caducidades llega a las ~09:30 (hora peninsular) si hay algo que caduca en ≤3 días.
   - Instalar la PWA desde la card de Ajustes (Android/desktop) y comprobar la guía en iOS.
   - Pendiente usuario: capturas reales para `screenshots` del manifest; definir `CRON_SECRET` en
     Vercel y `.env.local`.

## Qué NO hacer

- No regenerar `src/lib/supabase/types.ts` (se edita a mano; este plan no debería tocarlo).
- No tocar `button.tsx`/`input.tsx` ni "resetear" sus touch targets.
- No usar `Drawer`/`Dialog` directos en features (la Fase 4.2 se hace DENTRO de
  `responsive-modal.tsx`).
- No añadir dependencias nuevas ni salir del free tier de Gemini.
- No introducir migraciones de esquema: este plan no las necesita.
- No reordenar las escrituras de `confirmReceiptAction` ni intentar la RPC transaccional (fuera de
  alcance; solo se añade comprobación y comunicación de errores).
- No quitar `dynamic = "force-dynamic"`, ni el reintento PGRST303, ni el cliente por-request.
- No pararte a pedir permiso entre fases; el plan se ejecuta entero.

## Orden de commits sugerido

1. `fix(tickets): errores de escritura visibles + CTAs con try/catch/finally` (Fase 1 + 7.3).
2. `feat(tickets): pendientes de revisar, descartar ticket y volver unificado` (Fase 2).
3. `feat(push): resumen diario de caducidades + ocultar reposición` (Fase 3).
4. `feat(ux): loading.tsx en rutas restantes + atrás cierra bottom sheets` (Fase 4).
5. `fix(ux): confirmaciones destructivas coherentes y touch targets` (Fase 5).
6. `feat(pwa): instalación, manifest completo y offline con reintento` (Fase 6).
7. `fix(ia): timeout y mensaje de saturación en Gemini + defensa en alias` (Fase 7.1–7.2).
