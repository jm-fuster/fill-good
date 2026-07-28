# Repaso de cocinado — backlog priorizado (R1–R3)

> **Documento para un agente de IA.** Lee este documento completo antes de tocar código.
> Lee también `AGENTS.md` (raíz del repo) y la guía de Next.js en
> `node_modules/next/dist/docs/` — este proyecto usa Next.js 16 con cambios que
> pueden diferir de tus datos de entrenamiento.
>
> Este documento es un **backlog**: cada mejora (R1…R3) es una tarea
> independiente y demo-able por sí sola. Implementa **una mejora por sesión**,
> en orden (R2 depende de R1 solo levemente; R3 depende de R2). No mezcles
> varias mejoras en un mismo commit.

## Contexto de producto

Fill Good ya sabe hacer todo lo que esta feature necesita: marcar un plato como
cocinado (`cooked_at`), proponer el descuento de ingredientes del inventario con
cantidades editables y FIFO por caducidad (M2), y mover un plato a otro día (N1).
**El problema es que nadie entra al menú a posteriori a pulsarlo.** El usuario
cena, cierra la app y `cooked_at` se queda a null.

Eso degrada en cascada un activo de datos central:

- **Inventario desfasado** → "¿Qué hago hoy?" (M6) recomienda recetas con stock
  que ya no existe.
- **Apetencia mal calibrada** → el generador (C3) penaliza/premia con señales
  incompletas (`lastCookedAt` en `tonight.ts` y en el prompt).
- **Coste semanal irreal** y señales de receta ("hecha N veces") a medias.

La solución tiene dos patas, decididas con el usuario (2026-07-28):

1. **Un repaso proactivo**: la app pregunta por los platos pasados sin resolver
   ("¿Llegaste a cocinar X ayer?") en el momento natural — cuando el usuario ya
   está dentro de la app, en cualquier página. "Lo cocinamos" encadena el
   descuento de ingredientes que ya existe; "No se hizo" deja huella
   (`skipped_at`) para no volver a preguntar y ofrece mover/quitar el plato.
2. **Un menú que enseña su estado**: hoy destacado, cocinado atenuado con ✔,
   pasado-sin-resolver reconocible, y marcar cocinado a un toque desde la celda.

Principio rector (heredado de `mejoras-menus.md` y `mejoras-producto.md`):
**usar el dato que ya se captura antes de capturar dato nuevo**, preferir
soluciones deterministas (cero IA en esta feature), y **nada de automatismos
silenciosos**: toda escritura derivada se propone y el usuario confirma.

## Mapa de prioridad

| # | Mejora | Qué aporta | Impacto | Esfuerzo | Migración | Depende de |
|---|---|---|---|---|---|---|
| R1 | El menú enseña su estado + marcar a un toque | Menos fricción para el que SÍ entra al menú | Alto | Bajo | No | — |
| R2 | Modal "Repaso de platos" + `skipped_at` | La pregunta batch "¿qué tal ayer?" y su persistencia | Muy alto | Medio | Sí (2 columnas) | R1 (afordance) |
| R3 | Tarjeta de check-in en el shell + silencios + toggle | Que la pregunta llegue sin entrar al menú | Muy alto | Medio | No (usa la de R2) | R2 |

**Si solo se hace una: R2.** Es la que captura el dato. R1 es el calentamiento
barato y R3 la distribución (donde está el valor de verdad para usuarios que no
visitan `/menus`).

## Decisiones cerradas (no reabrir sin el usuario)

- **Nada de toasts (sonner) como vehículo de la pregunta.** Un toast es efímero,
  no puede alojar el flujo de descuento y sus acciones no cumplen touch targets
  de 44px. El vehículo es tarjeta descartable + `ResponsiveModal`.
- **La tarjeta de check-in se ve en TODA la app** (shell), no solo en `/menus`.
  Argumento del propio usuario: la gente entra a la lista o a escanear, no al menú.
- **El apagador permanente vive en «Ajustes del menú»** (`MenuSettings`, el
  engranaje junto al botón de generar) **y NO en Ajustes > Notificaciones.**
  Esa página promete "avisos en tus dispositivos sin abrir la app" y sus prefs
  se guardan por endpoint de suscripción push (`push-card.tsx`) — no encajan ni
  la semántica ni el almacenamiento. Si algún día se añade una capa push
  ("¿Cocinasteis X?" a las 21:30), ESA sí irá allí como pref por dispositivo.
- **El apagador también es alcanzable desde el propio modal de repaso**
  ("No volver a preguntar"): nadie harto de una tarjeta va a buscar un ajuste.
- **Alcance del toggle: por HOGAR** (`household_menu_prefs.checkin_enabled`),
  no por usuario. Usa tabla y UI existentes; el caso "un miembro lo quiere y
  otro no" queda mitigado por el snooze diario por dispositivo. Si duele, se
  migra a por-usuario más adelante.
- **`skipped_at` se GUARDA desde el día 1 pero NO alimenta todavía** ni el
  generador ni "¿Qué hago hoy?". Primero acumular dato real; conectarlo al
  prompt es una tarea futura aparte.
- **El descuento de stock nunca es automático.** Se mantiene el patrón M2:
  proponer cantidades, el usuario confirma. Desmarcar cocinado no repone stock.
- **Sin gamificación en v1.** El contador semanal ("5/9 platos cocinados") y el
  enganche con perfil/racha quedan fuera; anotar como iteración futura.
- **Sin push en v1.**

## Estado actual verificado en código (puntos de anclaje)

| Pieza | Dónde | Dato relevante |
|---|---|---|
| Marcar cocinado | `toggleEntryCookedAction` (`src/features/menus/actions.ts:1244`) | Valida fecha ≤ hoy (fecha del SERVIDOR), fija `cooked_at = date` de la entrada, permite desmarcar. Filtra por hogar |
| Proponer descuento | `computeCookedDeductionsAction` (`actions.ts:1300`) | Determinista, sin IA; no escribe nada. Cálculo puro en `src/features/menus/cooked.ts` |
| Confirmar descuento | `confirmCookedDeductionsAction` (`actions.ts:1363`) | FIFO por caducidad, clamp a 0, sin conversión de unidades |
| UI del descuento | `CookedDeductionsDrawer` (`src/features/menus/components/menu-view.tsx:1237`) | Modal PROPIO que se abre tras cerrarse el drawer de edición (secuencial, no anidado) |
| Flujo actual "Lo cocinamos" | `toggleCooked` en `EditEntryDrawer` (`menu-view.tsx:752`) | Solo dentro del drawer de edición; `canMarkCooked` = entrada guardada y fecha ≤ hoy (`menu-view.tsx:644`, con `todayISO()` del CLIENTE, `menu-view.tsx:77`) |
| ✔ de cocinado en la celda | `menu-view.tsx:437` | Icono `Check` `text-success` con `print:hidden`; único indicio visual de estado |
| Celda del plato | `menu-view.tsx:429` | La celda ENTERA es un `<button>` que abre el drawer — cualquier acción rápida debe ser botón HERMANO, nunca anidado (jsx-a11y strict) |
| Mover / quitar | `moveMenuEntryAction` (`actions.ts:641`), `removeMenuEntryAction` (`actions.ts:615`) | El picker de destino es una VISTA interna del mismo `ResponsiveModal` (`menu-view.tsx:852`) — el patrón a imitar |
| Tipo de entrada | `MenuEntry` (`src/features/menus/queries.ts:9`) | `cookedAt` ya viaja a la UI; añadir `skippedAt` aquí |
| Prefs del menú | `household_menu_prefs`, `getMenuPrefs`/`DEFAULT_MENU_PREFS` (`queries.ts:245`/`queries.ts:230`), `saveMenuPrefsAction` (`actions.ts:1803`) | Sin fila → defaults con `configured: false`. Añadir `checkinEnabled` |
| UI de prefs | `PrefsFields` (`src/features/menus/components/menu-prefs.tsx:77`), montada en `MenuSettings` (`components/menu-settings.tsx:95`) | Ya usa `Switch` (p. ej. desayuno); el toggle nuevo va aquí |
| Shell de la app | `AppShell` (`src/components/layout/app-shell.tsx`) | Server Component; `<div id="contenido">` (`app-shell.tsx:77`) envuelve `{children}`. El patrón del badge (`app-shell.tsx:34`) muestra cómo NO bloquear el primer paint: promesa sin await + Suspense |
| Layout de la app | `src/app/(app)/layout.tsx` | `force-dynamic`; toda página de la app pasa por aquí |
| Fecha local en servidor | `todayLocalISO()` (`actions.ts:134`) | Convención existente: fecha del proceso del servidor. NO inventar otro esquema de zonas horarias |
| Helpers de fechas | `src/lib/dates.ts` | `getWeekStart:45`, `getWeekDays:55`, `shiftWeek:65`, `relativeDaysLabel:75` |
| Feedback UX | `src/lib/haptics.ts:6` (`vibrateTick`), `Button loading`, keys con estado | Reutilizar, no inventar (memoria `ux-feedback-patterns`) |
| Columnas de `menu_entries` | `supabase/migrations/20260719143638_menus.sql` + `20260720140000` (cooked_at) + `menu_entries_multi` + N2 (source/pinned) | `cooked_at date` ya existe con índice parcial `menu_entries_cooked_idx` |
| Prefs de push (para NO tocar) | `src/features/push/components/push-card.tsx:35` | Prefs por endpoint de dispositivo; el check-in NO va aquí |

### Gotchas del repo (no descubrirlos de nuevo)

- **La RLS no acota al hogar activo**: toda query a tablas con `household_id`
  lleva `.eq("household_id", …)` de `getActiveHouseholdId()`/`getCurrentHousehold()`.
- `src/lib/supabase/types.ts` se mantiene **a mano** — NO regenerar con la CLI.
- Migraciones vía Supabase CLI; **`npx supabase db push` requiere autorización
  del usuario**. Mientras no esté aplicada, el código degrada en suave
  (supabase-js devuelve `{ data: null, error }`, no lanza).
- **No anidar `ResponsiveModal`**: el cierre por historial cierra el segundo
  solo. Flujos multi-paso = vistas dentro del MISMO modal (como el picker de
  "Mover a…"). `EditEntryDrawer` → `CookedDeductionsDrawer` hoy funciona porque
  es secuencial (uno se cierra y luego abre el otro), no anidado.
- Solo tokens semánticos. **Ojo con la semántica de color**: `success` = cocinado
  vale, pero `warning` significa "caduca pronto" en toda la app — el estado
  "pendiente de repaso" NO debe usar `warning` (usar neutro: `muted-foreground`,
  borde discontinuo…). AA en ambos temas, también en texto atenuado.
- Touch targets ≥ 44px; `aria-pressed` en toggles de dos estados; jsx-a11y
  strict con `--max-warnings 0` (botón dentro de botón = build roto).
- Todo estado de app (✔, pendiente, tarjeta) lleva `print:hidden` — la hoja
  impresa del menú es un menú, no una interfaz (patrón D5 ya establecido).
- Tailwind escanea comentarios: no cites clases en comentarios que no quieras
  generar.
- Zonas horarias: el servidor (Vercel fra1) corre en UTC; entre las 00:00 y las
  ~02:00 hora española "hoy" del servidor puede ser "ayer" del usuario. Es una
  inconsistencia ya aceptada por el código existente (`toggleEntryCookedAction`
  valida con fecha del servidor, la UI con la del cliente). Sé consistente con
  esa convención; no intentes arreglarla aquí.

---

## R1 — El menú enseña su estado + marcar cocinado a un toque

**Objetivo.** Que la semana se lea de un vistazo (qué fue, qué es hoy, qué quedó
sin resolver) y que marcar "cocinado" cueste UN toque desde la celda, sin abrir
el drawer.

**Valor.** Hoy el único indicio de estado es un ✔ de 14px y "hoy" no se
distingue de ningún otro día. Para el usuario que sí entra al menú, el coste de
marcar (celda → drawer → botón → confirmar descuento) es la razón por la que no
lo hace. Cero migraciones.

**Alcance v1:**

- **Hoy destacado**: la tarjeta del día actual (`todayISO()` del cliente, como
  ya hace `canMarkCooked`) se distingue del resto — p. ej. `border-primary` +
  chip "Hoy" junto al nombre del día. `print:hidden` en cualquier acento (o
  variante print neutra): la hoja impresa no cambia.
- **Tres estados visuales por plato** en la celda (`menu-view.tsx:426`):
  - *Cocinado*: ✔ `text-success` (ya existe) + nombre en `text-muted-foreground`.
    Sin tachado (un plato tachado se lee como "eliminado"). Verificar AA del
    texto atenuado en ambos temas.
  - *Pasado sin resolver* (`date < hoy` y `cookedAt == null`): tratamiento
    neutro y sutil (p. ej. borde discontinuo o un punto `muted`), NUNCA `warning`.
  - *Futuro / hoy sin cocinar*: como está.
- **Acción rápida "Lo cocinamos"**: en entradas con `date ≤ hoy` y sin cocinar,
  un botón HERMANO de la celda (círculo-check de ≥44px a la derecha, la celda
  se hace `flex` con dos botones) que ejecuta exactamente el mismo flujo que
  `toggleCooked` del drawer: `toggleEntryCookedAction` → toast → si hay receta,
  `computeCookedDeductionsAction` → abre `CookedDeductionsDrawer` (que ya es un
  modal independiente a nivel de `MenuView`, así que no hay anidado). Extraer la
  lógica compartida a un helper/hook en `menu-view.tsx` para no duplicarla.
  - `aria-label` con el plato: `Marcar como cocinado: ${nombre}`.
  - La acción rápida SOLO marca. Desmarcar sigue viviendo en el drawer (evita
    des-cocinados por toque accidental; el descuento no se revierte).
  - Feedback optimista: `vibrateTick()` + estado visual inmediato (transición
    del icono), `router.refresh()` al confirmar. Reutilizar patrones existentes.

**Decisiones:**

- No tocar el drawer en esta tarea (R2 le añade "No se hizo").
- El estado "pendiente" en R1 es solo visual; el afordance que abre el repaso
  llega con R2. No inventar un flujo intermedio.

**Criterios de aceptación:**

- Al abrir `/menus`, el día de hoy se identifica en <1 segundo; en la semana
  siguiente/anterior no hay ningún día destacado.
- Marcar cocinado un plato con receta desde la celda: 1 toque + revisar
  descuento; el ✔ aparece sin recargar a mano; el coste semanal no cambia.
- Marcar un plato de texto libre no abre el modal de descuento.
- Un plato futuro no muestra la acción rápida; uno cocinado tampoco (solo el ✔).
- `npm run lint` limpio (sin botones anidados); la hoja impresa (Ctrl+P) es
  idéntica a la actual.
- AA en ambos temas para el texto atenuado y el estado pendiente.

---

## R2 — Modal "Repaso de platos" + `skipped_at`

**Objetivo.** La pregunta batch: un `ResponsiveModal` que lista los platos
pasados sin resolver y deja despacharlos uno a uno — "Lo cocinamos" (con su
descuento) o "No se hizo" (con salidas: mover, quitar o dejarlo) — dejando
huella para no volver a preguntar.

**Valor.** Es la pieza que captura el dato. Además `skipped_at` crea una señal
nueva ("planificado pero nunca cocinado") que hoy no existe y que el generador
podrá usar en el futuro.

**Migración** (nueva, editar `types.ts` a mano después; incluye ya la columna
que consumirá R3 para ahorrar un `db push`):

```sql
alter table menu_entries
  add column skipped_at date;

alter table household_menu_prefs
  add column checkin_enabled boolean not null default true;

-- Búsqueda de pendientes del repaso (hogar + rango de fechas, solo sin resolver).
create index menu_entries_pending_checkin_idx
  on menu_entries (household_id, date)
  where cooked_at is null and skipped_at is null;
```

**Semántica de `skipped_at`** (documentarla en el código):

- `skipped_at = date` de la entrada (mismo criterio que `cooked_at`), no el
  timestamp de la respuesta.
- **Mutuamente excluyente con `cooked_at`**: marcar cocinado limpia
  `skipped_at`, y marcar "no se hizo" limpia `cooked_at`. Actualizar
  `toggleEntryCookedAction` para que al cocinar ponga `skipped_at = null`.
- Pendiente de repaso = `date < hoy` (servidor) ∧ `cooked_at is null` ∧
  `skipped_at is null`.

**Alcance v1:**

- **Action nueva** `toggleEntrySkippedAction(entryId, skipped)` en
  `src/features/menus/actions.ts`, espejo de `toggleEntryCookedAction`
  (validación fecha ≤ hoy con la fecha del servidor, filtro por hogar,
  `revalidatePath("/menus")`).
- **Query nueva** `getPendingCheckinEntries()` en `queries.ts`: entradas del
  hogar activo con `date` en `[hoy−7, hoy)` (rango que cruza semanas: el lunes
  el domingo pendiente es de la semana anterior), sin resolver, con nombre de
  receta/texto libre y `recipeId`, ordenadas por fecha y hueco. `MenuEntry`
  gana `skippedAt`.
- **Componente `CookedCheckinModal`** (nuevo, en `src/features/menus/components/`),
  **autocontenido** (recibe las entradas pendientes como props y no depende del
  estado de `MenuView`): R3 lo reutilizará desde el shell.
  - Lista agrupada por día ("Ayer · cena", "Sábado · comida" — `relativeDaysLabel`
    ayuda) con una fila por plato y dos acciones por fila: **"Lo cocinamos"** y
    **"No"** (targets ≥44px).
  - **"Lo cocinamos"** con receta vinculada: la fila se expande inline (dentro
    del scroll del modal) con la revisión de cantidades. Para ello, **extraer el
    contenido interior de `CookedDeductionsDrawer` (lista de descontables +
    informativos + confirmación) a un componente reutilizable**
    (p. ej. `CookedDeductionsFields`) que usan tanto el drawer actual como este
    modal. NUNCA abrir el drawer de descuento encima del repaso (anidado).
    Sin receta: marca y pasa a la siguiente.
  - **"No"** despliega tres salidas en la propia fila: *No se hizo* (marca
    `skipped_at`), *Mover a…* (cambia la vista del MISMO modal al picker de
    día/hueco — **extraer la rejilla del picker de `EditEntryDrawer`
    (`menu-view.tsx:852`) a un componente compartido** en vez de duplicarla) y
    *Quitar del menú* (`removeMenuEntryAction`).
  - Cada respuesta retira la fila (animación con keys, patrón existente); al
    quedar cero, el modal muestra un cierre amable y se cierra.
- **Puntos de entrada en `/menus`**:
  - El estado "pendiente" de R1 se vuelve accionable: tocar su indicador (botón
    hermano, como la acción rápida) abre el repaso.
  - Si hay pendientes, un botón/chip discreto "Repasar días pasados (N)" cerca
    de la cabecera de la semana.
- **El drawer de edición** (`EditEntryDrawer`) gana un `EntryActionTile`
  "No se hizo" en entradas pasadas sin cocinar (paridad con el repaso), y
  muestra el estado si `skippedAt` (p. ej. el tile en `aria-pressed` para
  poder deshacerlo).

**Decisiones:**

- El repaso pregunta solo por `date < hoy`. Por el hueco de HOY no se pregunta
  (la cena aún no ha pasado); para hoy ya está la acción rápida de R1.
- `checkin_enabled` se crea aquí pero **no se consume hasta R3** (el modal
  abierto manualmente desde `/menus` funciona siempre).
- Sin límite de filas en el modal (scroll con `max-h`, como los demás); el tope
  de 7 días ya acota el volumen.
- Degradar en suave mientras la migración no esté aplicada: si la query de
  pendientes devuelve error, `/menus` sigue funcionando sin repaso.

**Criterios de aceptación:**

- Con comida y cena de ayer sin marcar: el chip dice "Repasar días pasados (2)";
  responder "Lo cocinamos" a una (con receta → revisar cantidades inline y
  descontar) y "No se hizo" a la otra vacía el modal; recargar `/menus` ya no
  muestra pendientes ni chip.
- "No se hizo" + regenerar la semana: la entrada saltada NO reaparece como
  pendiente; marcarla luego como cocinada desde el drawer limpia `skipped_at`.
- "Mover a…" desde el repaso conserva `recipe_id` (el coste semanal no cambia)
  y la entrada movida a futuro deja de estar pendiente.
- Todo el flujo (expandir descuento, picker de mover) ocurre dentro del MISMO
  `ResponsiveModal`, en 375px y escritorio, AA en ambos temas.
- `npx tsc --noEmit` y `npm run lint` limpios; `skipped_at` NO aparece en
  `menu-prompt.ts` ni en `tonight.ts` (decisión cerrada).

---

## R3 — Tarjeta de check-in en el shell + silencios + apagador

**Objetivo.** Llevar la pregunta a donde está el usuario: una tarjeta
descartable en el shell (cualquier página) cuando hay platos pendientes, con
snooze diario, silencio semanal y apagador permanente en Ajustes del menú.

**Valor.** El insight original: nadie entra al menú a marcar. La tarjeta
convierte el repaso en un hábito de coste cero aprovechando las visitas que ya
ocurren (lista, escaneo, inventario).

**Anclaje.** `AppShell` (`src/components/layout/app-shell.tsx:77`),
`CookedCheckinModal` y `getPendingCheckinEntries()` (R2), `PrefsFields`
(`menu-prefs.tsx:77`), `saveMenuPrefsAction` (`actions.ts:1803`).

**Alcance v1:**

- **Server Component `CookedCheckinBanner`** (en `src/features/menus/components/`),
  montado en `AppShell` dentro de `<div id="contenido">`, encima de `{children}`,
  envuelto en `<Suspense fallback={null}>` para no bloquear el primer paint
  (mismo espíritu que el badge de la nav, `app-shell.tsx:34`). Si la query
  falla, degrada a null (nunca tumba el shell).
- **Condiciones para renderizar** (todas, evaluadas en servidor):
  1. `checkin_enabled` del hogar activo (default true sin fila de prefs).
  2. Hay entradas pendientes (`getPendingCheckinEntries()`).
  3. Cookie `menu_checkin_snooze` ≠ hoy (fecha del servidor).
  4. Cookie `menu_checkin_silenced_week` ≠ `getWeekStart()` actual.
- **La tarjeta** (client component hijo con los datos ya cargados): compacta,
  `rounded-xl`, icono 🍳/`ChefHat`, texto tipo *"¿Qué tal ayer? Tenías lentejas
  (comida) y salmón (cena)"* — nombres con tope y "…y N más" si hay más de ~3.
  Dos acciones: **"Repasar"** (abre `CookedCheckinModal` con las entradas ya
  cargadas — vive en el propio banner, sin navegar) y **descartar** (X,
  `aria-label="Recordármelo mañana"`) que escribe la cookie de snooze
  (`document.cookie`, caducidad corta, `path=/`) y oculta la tarjeta en local.
  `print:hidden`.
- **Silencio semanal**: dentro del modal de repaso (footer o menú secundario),
  "No preguntar más esta semana" → cookie `menu_checkin_silenced_week = weekStart`.
  Cubre el caso "menú abandonado" sin castigar al usuario cada día.
- **Apagador permanente**:
  - `PrefsFields` gana un `Switch` "Repaso de platos pasados" con helper text
    ("Te preguntamos si llegaste a cocinar lo planificado cuando vuelvas a la
    app"). `MenuPrefs`/`DEFAULT_MENU_PREFS`/`toState`/`toInput` y
    `saveMenuPrefsAction` ganan `checkinEnabled`.
  - En el modal de repaso: acción "No volver a preguntar" que pone
    `checkin_enabled = false` (action ligera dedicada o `saveMenuPrefsAction`)
    con toast "Puedes reactivarlo en Ajustes del menú".
- **Multi-hogar**: pendientes SOLO del hogar activo (cookie `active_household`);
  al cambiar de hogar la tarjeta refleja el nuevo. Multi-miembro: si un miembro
  responde, al resto le desaparece (el dato es del hogar); las cookies de
  snooze/silencio son por dispositivo, y eso es correcto (otro miembro puede
  saber mejor si se cocinó).

**Decisiones:**

- Snooze y silencio en cookies por dispositivo, no en BD: son "molestia
  personal", no dato del hogar. El único estado durable es `checkin_enabled`.
- La tarjeta NO aparece en `/menus`… en realidad SÍ aparece (el shell es único),
  y no pasa nada: es coherente y el chip de R2 y la tarjeta despachan al mismo
  modal. No añadir lógica de ruta para ocultarla.
- Sin auto-silencio por rachas de "no" (magia): el silencio semanal + el
  apagador cubren el caso. Si el feedback real lo pide, se añade después.
- Nada de `Notification`/push aquí. La capa push queda anotada como futura
  (pref nueva en `push-card.tsx` junto a Caducidades/Precios/Resumen, por
  endpoint de dispositivo, con emisor en cron), fuera de este backlog.

**Criterios de aceptación:**

- Con platos de ayer sin resolver, la tarjeta aparece en `/lista`, `/inventario`
  y `/escanear`; responder todo desde ella (sin pasar por `/menus`) descuenta
  stock y la hace desaparecer en el siguiente render.
- La X la oculta hoy en ese dispositivo; vuelve mañana si sigue habiendo
  pendientes. "No preguntar más esta semana" la oculta hasta el lunes siguiente.
- Con el toggle de Ajustes del menú apagado, ni tarjeta ni pregunta en ningún
  dispositivo del hogar; el chip "Repasar días pasados" de `/menus` puede
  seguir visible (repaso manual siempre disponible). "No volver a preguntar"
  desde el modal equivale a apagar el toggle.
- Sin pendientes (o sin menú), cero coste visible: no hay tarjeta ni layout
  shift; el shell no añade esperas perceptibles al primer paint.
- Cambiar de hogar activo cambia (o quita) la tarjeta.
- `npm run build:check` pasa sin subir `BUDGET_KB` (la tarjeta es ligera y el
  modal se comparte con `/menus`).

---

## Orden sugerido de implementación

1. **R1** (estado visible + un toque) — sin migración, valor inmediato,
   introduce los patrones visuales que R2/R3 reutilizan.
2. **R2** (migración + repaso) — pedir autorización para `npx supabase db push`
   (una sola migración con `skipped_at` + `checkin_enabled` + índice), editar
   `types.ts` a mano, extraer los componentes compartidos (descuento y picker)
   ANTES de construir el modal.
3. **R3** (tarjeta + silencios + apagador) — sin migración; cuidado con el
   primer paint del shell.

Iteraciones futuras anotadas (NO hacer ahora): usar `skipped_at` como señal en
`menu-prompt.ts`/`tonight.ts`; contador semanal de cocinados y enganche con la
gamificación de `/perfil`; capa push opcional en Ajustes > Notificaciones.

Cada mejora termina con: `npm run build:check` limpio, `npm run lint` limpio,
prueba en viewport móvil (375px) y escritorio, verificación AA en ambos temas de
cualquier UI nueva, y —si hay migración— `npx supabase db push` **con
autorización previa del usuario** y `src/lib/supabase/types.ts` actualizado a
mano.
