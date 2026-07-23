# Mejoras de producto — backlog priorizado (M1–M10)

> **Documento para un agente de IA.** Lee este documento completo antes de tocar código.
> Lee también `AGENTS.md` (raíz del repo) y la guía de Next.js en
> `node_modules/next/dist/docs/` — este proyecto usa Next.js 16 con cambios que
> pueden diferir de tus datos de entrenamiento.
>
> Este documento es un **backlog**: cada mejora (M1…M10) es una tarea
> independiente y demo-able por sí sola. Implementa **una mejora por sesión**,
> en el orden de prioridad salvo que el usuario pida otra. No mezcles varias
> mejoras en un mismo commit.

## Contexto de producto

Fill Good promete **ahorrar tiempo y dinero** en la gestión del hogar
(eslogan: *"Compra lo justo, ahorra más"*). El bucle
**planificar → comprar → escanear → inventario** ya está bien resuelto:
inventario por lotes con caducidades, lista compartida realtime con habituales,
escaneo de tickets con matching que aprende aliases, historial de precios por
cadena, recetario con gustos/temporada/reglas y generador IA de menús.

El diagnóstico de esta revisión de producto es que el bucle se rompe en dos
puntos:

1. **El consumo no descuenta.** "Lo cocinamos" solo alimenta la señal de
   apetencia; no toca el inventario. A las pocas semanas el stock miente
   (la "deriva de inventario" que el plan original ya señalaba como riesgo).
2. **El ahorro es pasivo.** La app captura precios, descuentos y totales, pero
   el usuario tiene que ir a buscarlos a una gráfica. No hay ninguna cifra
   proactiva ("este mes llevas X €", "esto ha subido un 12%").

Las mejoras M1–M10 atacan esos dos huecos. Principio rector: **usar el dato que
ya se captura antes de capturar dato nuevo**, y preferir soluciones
deterministas (SQL/TS) sobre llamadas de IA (cuota Gemini free tier).

## Mapa de prioridad

| # | Mejora | Eje | Impacto | Esfuerzo | Depende de |
|---|---|---|---|---|---|
| M1 | Panel de gasto mensual | Dinero | Muy alto | Medio | — |
| M2 | "Lo cocinamos" descuenta ingredientes | Confianza en el dato | Muy alto | Medio | — |
| M3 | Avisos de precio sobre habituales | Dinero | Alto | Bajo | — |
| M4 | Modo compra en tienda | Tiempo | Alto | Medio | — |
| M5 | Predicción de reposición | Tiempo | Alto | Bajo | — |
| M6 | "¿Qué hago hoy?" | Tiempo | Medio | Bajo | — |
| M7 | Coste por receta y por menú | Dinero | Alto | Medio | — |
| M8 | Desperdicio visible en euros | Dinero | Medio | Medio | M1 (para el panel) |
| M9 | "Dónde te sale más barato" | Dinero | Medio | Bajo | — |
| M10 | Push + share target + shortcuts | Habilitador | Alto | Alto | mejor tras M3/M5/M8 |

**Si solo se hace una: M1.** Es la que convierte el eslogan en algo medible y
crea el lugar donde después viven M3, M8 y M9.

## Qué NO hacer (decisiones de producto, no reabrir)

- **No scraping ni catálogos externos de precios de supermercados**: frágil y
  legalmente gris. La ventaja competitiva es el dato real del ticket del propio
  hogar.
- **No planificación nutricional/macros**: es otro producto.
- **No UI multi-hogar**: el esquema lo permite, pero sin demanda real es
  complejidad gratis.
- **Nada de automatismos silenciosos sobre datos del hogar**: toda escritura
  derivada (descontar stock, añadir a lista) se propone y el usuario confirma
  con un toque. Es el patrón ya establecido (revisión de ticket obligatoria,
  faltantes con revisión).

## Estado actual verificado en código (puntos de anclaje)

| Pieza | Dónde | Dato relevante para estas mejoras |
|---|---|---|
| Historial de precios | `receipt_items` (migración `20260719134500_receipts.sql`) | `product_id`, `quantity`, `unit`, `total_price`, `unit_price`, `price_per_kg`, `purchased_at` y `store_chain` **denormalizados** al confirmar. Índice `(product_id, purchased_at)` |
| Totales por compra | `receipts` | `total_amount`, `purchased_at`, `store_chain`, `status='confirmed'`, `raw_extraction` jsonb |
| ⚠️ Descuentos | `src/features/receipts/actions.ts:110` | Las líneas de descuento se **filtran** (`!it.is_discount`) y NO se persisten en `receipt_items`; solo sobreviven dentro de `receipts.raw_extraction` |
| ⚠️ Embed ambiguo | `receipt_items` tiene 2 FKs a `products` | En embeds PostgREST usar siempre `products!receipt_items_product_id_fkey` (si no, error PGRST201) |
| Queries de precios | `src/features/prices/queries.ts` | `getPriceOverview()` (top gasto) y `getProductPriceHistory(productId)`; etiquetas de cadena en `src/features/prices/chains.ts` |
| "Lo cocinamos" | `src/features/menus/actions.ts:463` (`toggleEntryCookedAction`) | Marca `cooked` en `menu_entries`; **no descuenta inventario** |
| Faltantes → lista | `src/features/menus/missing.ts` (`computeMissingIngredients`) + `computeMissingForMenuAction` / `confirmMissingToListAction` en `menus/actions.ts` | Matching ingrediente↔producto y diff contra stock real ya resueltos; es la pieza a reutilizar en M2 y M7 |
| Estados de inventario | `src/features/inventory/status.ts` | `getInventoryStatus` deriva caduca-pronto/agotado/quedan-pocas; filtros en chips |
| Sugerencias de lista | `src/features/shopping-list/queries.ts:122` (`getSuggestions`) | Hoy solo por `min_quantity`; punto de extensión de M5 |
| Finalizar compra | `src/features/shopping-list/actions.ts:192` (`checkoutAction`) | Vuelca marcados a inventario; después redirige a revisión de caducidades (`/inventario/revision`) |
| Habitualidad | `products.purchase_count` (migración `20260720073534_products_habits.sql`) | Proxy de "producto habitual" para M3/M5/M9 |
| Señales de recetas | `src/features/recipes/queries.ts:235` (`getRecipeSignals`) | rating, `timesCooked`, `lastCookedAt` — reutilizables en M6 |
| Unidades | `src/lib/units.ts` | Normalización a g/ml; **no hay conversión ud↔peso** — cuando las unidades no cuadren, no adivinar |
| PWA | `src/app/sw.ts` (Serwist), `src/app/manifest.ts` | `navigationPreload` desactivado a propósito (redirects de Clerk); no hay push ni share target |

### Gotchas del repo (no descubrirlos de nuevo)

- `src/lib/supabase/types.ts` se mantiene **a mano** — NO regenerar con la CLI
  (romperías los alias `UnitType`/`LocationType` importados por todo el repo).
  Tras cada migración, añade los tipos nuevos editando el archivo.
- Migraciones vía Supabase CLI (`supabase db push`, proyecto ya enlazado);
  pide autorización al usuario antes de ejecutar el push.
- `shadcn add` sobrescribe `button.tsx`/`input.tsx` (tienen ajustes deliberados
  de touch target); si añades componentes shadcn, responde "no" a sobrescribir
  o restaura con git.
- IA **siempre** vía `getModel('receipts' | 'menus')` de `src/lib/ai/models.ts`;
  el usuario no quiere gasto en IA: Gemini free tier, y preferir lógica
  determinista cuando dé el mismo resultado.
- Reglas de diseño de `AGENTS.md` son obligatorias: solo tokens semánticos,
  overlays vía `ResponsiveModal`, anchos vía `PageContainer`, targets ≥44px,
  UI en español, AA en ambos temas. Para gráficas nuevas, usar la skill
  `dataviz` y los tokens `chart-1..5`.

---

## M1 — Panel de gasto mensual (presupuesto ligero)

**Objetivo.** Que el usuario vea sin esfuerzo cuánto lleva gastado este mes,
en qué, dónde, y cómo compara con el mes anterior. Opcionalmente contra un
objetivo mensual.

**Valor.** Es la función que hace tangible la promesa de ahorro. Todo el dato
ya existe en `receipts`/`receipt_items`; es casi solo lectura.

**Alcance v1:**

- Bloque "Resumen del mes" como cabecera de `/precios` (o pestaña "Gasto" si
  la página se satura): total del mes en curso, delta vs mes anterior,
  nº de compras/tickets.
- Desglose por **categoría** (barras horizontales, tokens `chart-*`): join
  `receipt_items → products!receipt_items_product_id_fkey → categories`.
- Desglose por **cadena** (`receipts.store_chain` + `CHAIN_LABELS`).
- **Objetivo mensual opcional**: columna `monthly_budget numeric` en
  `households` (nullable), editable desde `/ajustes`; si existe, barra de
  progreso (token `success` en verde por debajo, `warning` cerca del límite,
  `destructive` superado).
- Navegación por meses anteriores (mes a mes basta; sin rangos arbitrarios).

**Decisión pendiente (proponer al usuario antes de implementar): descuentos.**
"Ahorrado en descuentos este mes" es una métrica potente, pero las líneas de
descuento hoy no se persisten (ver tabla de anclaje). Dos opciones:
(a) columna `discount_total numeric` en `receipts` calculada al confirmar
(suma de líneas `is_discount` de la extracción) — recomendada, barata;
(b) recalcular desde `raw_extraction` en lectura — sin migración pero frágil.
Los tickets ya confirmados no tendrán el dato con la opción (a); aceptable
(backfill opcional desde `raw_extraction`).

**Fuera de alcance:** exportar CSV, presupuestos por categoría, proyección de
fin de mes.

**Criterios de aceptación:**

- Con ≥2 tickets confirmados en meses distintos, el panel muestra totales
  correctos por mes y el delta coincide con la suma de `total_amount`.
- Producto sin categoría o ítem sin `product_id` no rompe el desglose
  (agrupar en "Otros").
- Hogar sin tickets → empty state con CTA a escanear.
- AA en ambos temas; gráficas con skill `dataviz`.

---

## M2 — "Lo cocinamos" descuenta ingredientes

**Objetivo.** Al marcar una entrada del menú como cocinada, proponer el
descuento de sus ingredientes del inventario en un solo gesto. Mantiene el
inventario honesto, que es la base de sugerencias, menús por stock y
caducidades.

**Anclaje.** `toggleEntryCookedAction` (`src/features/menus/actions.ts:463`).
Reutilizar el matching ingrediente↔producto de
`computeMissingIngredients` (`src/features/menus/missing.ts`) — es el mismo
problema que faltantes, con el diff en dirección contraria.

**Flujo v1:**

1. Usuario marca "Lo cocinamos" en una entrada con `recipe_id` (las de
   `free_text` no aplican: marcar cocinado sin más, como hoy).
2. Se abre un `ResponsiveModal` con los ingredientes de la receta:
   - **Con match y stock**: cantidad a descontar prellenada (editable),
     nombre del producto y stock actual.
   - **Sin match o sin stock o unidades incompatibles** (ud vs peso): listados
     como "no se descuenta", sin bloquear.
3. Confirmar ejecuta el descuento en una Server Action única:
   - Consumir por lotes **FIFO por caducidad** (el lote que caduca antes,
     primero), en cascada si un lote no cubre la cantidad.
   - Nunca stock negativo: clamp a 0 y el lote a 0 se elimina o marca agotado
     según el patrón existente de `setInventoryQuantityAction`.
4. Toast de resumen ("Descontados 4 ingredientes").

**Decisiones:**

- El modal es **opt-out por gesto** (botón "No descontar"), no una preferencia
  de ajustes; si el usuario cancela, la entrada queda cocinada igualmente
  (no acoplar los dos estados).
- Sin "deshacer" transaccional en v1: las cantidades son editables antes de
  confirmar y el inventario se corrige a mano si hace falta.
- No usar IA: matching determinista existente.

**Criterios de aceptación:**

- Receta con 5 ingredientes, 3 con match y stock → el modal muestra 3
  descontables + 2 informativos; confirmar actualiza los lotes correctos
  (FIFO por `expiry_date`, nulls al final) y revalida `/inventario` y `/menus`.
- Cantidad editada a 0 → ese ingrediente no se toca.
- Ingrediente en "g" contra producto en "ud" → aparece como no descontable,
  jamás se convierte.
- Desmarcar "cocinado" no repone stock (documentado en el propio modal).

---

## M3 — Avisos de precio sobre habituales

**Objetivo.** Dos señales proactivas calculadas solo con los tickets del hogar:
"ha subido" y "buen momento para comprar".

**Reglas v1 (constantes en un módulo nuevo `src/features/prices/alerts.ts`):**

- Universo: productos con ≥3 compras (`products.purchase_count` como filtro
  rápido; el cálculo fino sobre `receipt_items`).
- **Subida**: último `unit_price` ≥ +10% sobre la mediana de las 3–5 compras
  anteriores → aviso "La leche ha subido un 15% desde tu última compra".
- **Buen precio**: último `unit_price` conocido ≤ percentil 25 histórico del
  producto → "El aceite está por debajo de tu precio habitual".
- Comparar siempre `unit_price` (o `price_per_kg` en pesados), nunca
  `total_price`.

**Superficie v1:** sección "Avisos" arriba de `/precios` (lista de filas con
icono + texto + enlace a `/precios/[productId]`). Sin push todavía (eso es
M10); el aviso también puede mostrarse como nota en la revisión del ticket
recién confirmado ("2 productos de este ticket han subido").

**Semántica de color:** subida → token `warning`; buen precio → `success`.
No usar `destructive` (reservado a caducado/eliminar). Documentar la elección
en `/styleguide` si se añade un componente de aviso reutilizable.

**Criterios de aceptación:**

- Producto con histórico plano → sin avisos (sin falsos positivos por
  redondeos: umbral del 10% estricto).
- Producto con <3 compras → nunca genera aviso.
- Cálculo en Server Component (sin tabla nueva, sin cron).

---

## M4 — Modo compra en tienda

**Objetivo.** Vista de la lista optimizada para el momento súper: menos tiempo
en tienda y total estimado antes de llegar a caja.

**Alcance v1:**

- Botón "Modo compra" en `/lista` (visible cuando hay ítems sin marcar) que
  abre una vista a pantalla completa (ruta propia `/lista/compra` para que
  sobreviva a recargas):
  - Agrupada por **categoría en orden de pasillo** (constante fija v1 con el
    orden típico: fruta/verdura → panadería → despensa → refrigerados →
    congelados → bebidas → limpieza/higiene). Aprender orden por cadena =
    fuera de alcance.
  - Tipografía y checks grandes (más que el default), sin chrome innecesario;
    la bottom nav puede ocultarse en esta ruta.
  - **Total estimado del carro**: suma de último `unit_price` conocido ×
    cantidad para los ítems con producto vinculado; ítems sin precio conocido
    marcados con "—" y excluidos (mostrar "estimado sobre N de M ítems").
  - **Pantalla siempre encendida**: `navigator.wakeLock` con feature-detect y
    liberación al salir (Safari iOS lo soporta desde 16.4; degradar en
    silencio).
- El realtime existente (`useRealtimeList`) debe seguir funcionando en esta
  vista (dos personas comprando a la vez es el caso estrella).

**Criterios de aceptación:**

- Marcar/desmarcar en modo compra sincroniza con `/lista` en otro dispositivo.
- El total estimado se actualiza al marcar (opción v1: mostrar "queda por
  coger ~X €" además del total).
- Salir del modo (botón atrás/cerrar) libera el wake lock.
- Touch targets ≥48px en esta vista.

---

## M5 — Predicción de reposición

**Objetivo.** Pasar del `min_quantity` manual a "sueles comprar leche cada
~6 días — ¿la añado?". Sugerencia, nunca automatismo.

**Cálculo v1 (determinista, sin tabla nueva):**

- Por producto con ≥3 compras: mediana de los intervalos entre `purchased_at`
  consecutivos en `receipt_items`.
- Candidato a sugerencia si: `hoy − última compra ≥ mediana`, el producto no
  está ya en la lista activa (`getActiveListProductIds`) y su stock agregado
  está a 0 o por debajo de `min_quantity`.
- Descartar productos con mediana > 60 días (compras esporádicas: ruido).

**Superficie:** extender `getSuggestions`
(`src/features/shopping-list/queries.ts:122`) con esta segunda fuente,
distinguiendo el motivo en el chip: "Quedan pocas" (actual) vs
"Sueles comprarlo cada ~6 días". Un toque añade a la lista, como hoy.

**Criterios de aceptación:**

- Producto comprado el día 1, 8 y 15 → mediana 7; el día 23 aparece sugerido
  si no hay stock; el día 16 no.
- Producto ya en lista → nunca sugerido.
- La query no degrada `/lista` (una sola consulta agregada, no N+1).

---

## M6 — "¿Qué hago hoy?"

**Objetivo.** Resolver el momento 19:30-sin-plan: sugerir 2–3 recetas del
recetario **cocinables ahora mismo** con lo que hay, priorizando lo que caduca.

**Decisión clave: determinista, sin IA.** El generador semanal ya gasta cuota
Gemini; esto es un ranking:

```
score = %ingredientes_en_stock (peso alto)
      + bonus si usa productos "consumir pronto" (status.ts)
      + apetencia (rating alto + tiempo sin cocinarse, señales de getRecipeSignals)
      − penalización si se cocinó esta semana
```

Reutiliza `computeMissingIngredients` para saber qué recetas están completas o
casi (0–1 faltantes), y `getInventoryStatus` para las caducidades.

**Superficie:** botón "¿Qué hago hoy?" en `/menus` (junto al grid semanal) que
abre un `ResponsiveModal` con 2–3 tarjetas: nombre, "tienes todo" / "falta 1:
X", y por qué se sugiere ("el calabacín caduca en 2 días"). Acciones por
tarjeta: ver receta · añadirla al slot de hoy en el menú.

**Criterios de aceptación:**

- Con recetario vacío o sin ninguna receta cocinable → empty state honesto
  (no rellenar con recetas imposibles).
- La razón mostrada es verdadera (deriva del score, no texto genérico).
- Cero llamadas a IA.

---

## M7 — Coste por receta y por menú

**Objetivo.** "Esta cena ≈ 3,40 €" en cada receta y coste estimado del menú
semanal. Es el puente entre las dos features estrella (menús y precios).

**Cálculo:** por ingrediente con producto vinculado, último `unit_price` (o
`price_per_kg` para pesados) × cantidad, normalizando unidades con
`src/lib/units.ts`. Ingredientes sin precio conocido o sin match → coste
parcial explícito: "≥ 2,80 € (3 de 5 ingredientes)". **Nunca** presentar un
parcial como total.

**Superficie v1:**

- Badge de coste en las tarjetas del recetario y en el detalle de receta.
- Suma estimada de la semana en la cabecera del menú (`menu-view.tsx`), con el
  mismo tratamiento de parcialidad.
- Token de acento de precios: `chart-3` (ya es la convención del repo).

**Fuera de alcance v1:** "genera un menú de menos de X €" en el prompt de IA
(anotar como iteración futura de `menu-prompt.ts`; requiere pasarle costes).

**Criterios de aceptación:**

- Receta con todos los ingredientes con precio → total exacto y estable.
- Cambiar la cantidad de un ingrediente recalcula el coste.
- Ingredientes en "ud" con precio por kg (o viceversa) cuentan como "sin
  precio" — no adivinar conversiones.

---

## M8 — Desperdicio visible en euros

**Objetivo.** Distinguir "lo consumí" de "lo tiré" al dar de baja stock, y
traducir lo tirado a euros. El desperdicio en dinero cambia comportamiento
mucho más que un badge de caducidad.

**Modelo de datos.** Migración: tabla `inventory_events`
(`household_id`, `product_id`, `quantity`, `unit`, `kind enum('consumed','discarded')`,
`created_by`, `created_at`), RLS estándar por hogar. Registrar solo bajas
(no cada edición de cantidad).

**Puntos de captura (los dos que ya existen, sin flujos nuevos):**

- `deleteInventoryAction` y el poner-a-cero: cuando el lote está **caducado o
  caduca pronto**, preguntar en el propio confirm "¿Consumido o tirado?"
  (dos botones). Si no está cerca de caducar, registrar `consumed` sin
  preguntar — no añadir fricción al caso feliz.
- La revisión de caducidades (`expiry-review.tsx` / `/inventario/revision`):
  la acción "caducado → eliminar" registra `discarded` directamente.

**Valorización:** cantidad × último `unit_price` conocido del producto; sin
precio conocido → cuenta en unidades pero no en euros.

**Superficie:** línea "Has tirado ~8 € este mes" dentro del panel M1 (por eso
la dependencia), con detalle por producto al tocar.

**Criterios de aceptación:**

- Tirar un lote valorizado suma al mes correcto; consumirlo no.
- El confirm de borrado solo pregunta cuando el lote está caducado/próximo
  (usar `getInventoryStatus`).
- Sin eventos → la línea de desperdicio no aparece (no mostrar "0 €" vacío).

---

## M9 — "Dónde te sale más barato"

**Objetivo.** Por producto habitual, comparar tu precio medio por cadena con
tus propios tickets: "La última vez te costó un 12% menos en Lidl".

**Regla anti-muestra-de-1 (estricta):** mostrar comparación solo si hay
**≥2 cadenas con ≥2 compras cada una** para ese producto. Si no, no mostrar
nada — un consejo con una compra de muestra es peor que ninguno.

**Cálculo:** `receipt_items` agrupado por `product_id × store_chain`:
media (o mediana) de `unit_price`, nº de compras, última fecha. Etiquetas vía
`CHAIN_LABELS` (`src/features/prices/chains.ts`).

**Superficie v1:** bloque de chips comparativos en `/precios/[productId]`
(cadena, precio medio, delta % vs la más barata) — la gráfica ya colorea por
cadena, esto lo hace legible de un vistazo. Opcional: mini-indicador en la
fila del overview ("Lidl −12%").

**Criterios de aceptación:**

- Producto comprado solo en Mercadona → no aparece el bloque.
- Los deltas cuadran con los datos de la tabla de últimas compras ya visible.
- Query única (sin N+1 sobre el overview).

---

## M10 — Notificaciones push + share target + shortcuts (habilitador PWA)

**Objetivo.** Casi todo lo anterior gana valor si avisa sin abrir la app.
Dividir en tres sub-fases **independientes**, de barata a cara:

**10a — Shortcuts del manifest (trivial).** `shortcuts` en
`src/app/manifest.ts`: "Añadir a la lista" (`/lista`), "Escanear ticket"
(`/escanear`). Sin más cambios.

**10b — Share target (barato, muy útil).** `share_target` en el manifest
(method POST, enctype multipart) + route handler que recibe la imagen/PDF
compartida desde la galería y entra al flujo de `scanReceiptAction`
(crear receipt en processing → redirigir a revisión). Cuidado con Clerk:
la ruta receptora requiere sesión; si no la hay, guardar es imposible —
redirigir a sign-in y avisar (v1 puede simplemente exigir sesión).

**10c — Web push (la pieza cara).** Infra: tabla `push_subscriptions`
(household_id, user_id, endpoint único, claves), VAPID keys en env, handler
`push` en `src/app/sw.ts` (Serwist — respetar el `navigationPreload`
desactivado), Server Action de suscripción desde `/ajustes` con preferencias
**por tipo de aviso**: caducidades (agregado diario, no por producto),
avisos de precio (M3, al confirmar ticket), reposición (M5). Envío: los
disparados por acción (precio) salen de la propia Server Action; el diario de
caducidades necesita un cron (Vercel Cron) — verificar límites del plan free
en la doc de Vercel antes de decidir cadencia.

**Criterios de aceptación (10c):**

- Opt-in explícito por tipo desde ajustes; revocar funciona.
- Una notificación de caducidad agrupa ("3 productos caducan esta semana"),
  nunca una por producto.
- Sin suscripciones → los flujos de M3/M5 siguen funcionando igual (el push
  es una capa encima, no una dependencia).

---

## Orden sugerido de implementación

1. **M1** (panel de gasto) — decide con el usuario la opción de descuentos.
2. **M2** (cocinado descuenta) — restaura la confianza en el inventario.
3. **M3** (avisos de precio) — primer "wow" proactivo, esfuerzo bajo.
4. **M5** (reposición) y **M6** ("¿qué hago hoy?") — quick wins de tiempo.
5. **M7** (coste por receta) → **M4** (modo compra, usa los mismos precios).
6. **M8** (desperdicio, se apoya en M1) → **M9** (comparador de cadenas).
7. **M10** en tres sub-fases; 10a/10b pueden adelantarse en cualquier momento.

Cada mejora termina con: `npm run build` limpio, prueba en viewport móvil
(375px) y escritorio, y verificación AA en ambos temas de cualquier UI nueva.
