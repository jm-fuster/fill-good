# Mejoras de la lista de la compra — backlog priorizado (L1–L13)

> **Documento para un agente de IA.** Lee este documento completo antes de tocar
> código. Lee también `AGENTS.md` (raíz del repo) y la guía de Next.js en
> `node_modules/next/dist/docs/` — este proyecto usa Next.js 16 con cambios que
> pueden diferir de tus datos de entrenamiento.
>
> Este documento es un **backlog**: cada mejora (L1…L13) es una tarea
> independiente y demo-able por sí sola. Implementa **una mejora por sesión**,
> en el orden de prioridad salvo que el usuario pida otra. No mezcles varias
> mejoras en un mismo commit.

## Contexto y diagnóstico

La lista de la compra (`/lista`) es la superficie más usada de Fill Good y se
usa sobre todo **en móvil y con prisa**: vaciar la cabeza antes de salir,
ajustar cantidades, y marcar en la tienda. La base técnica es sólida (realtime
por hogar, marcado optimista, modo compra con pasillos, wake lock y total
estimado), pero el flujo diario tiene fricción medible:

1. **Añadir varias cosas seguidas es lento.** El alta espera al servidor y
   deshabilita el input mientras guarda; entre ítem e ítem hay ~1-2 s muertos.
2. **Editar cuesta 4-5 toques.** Hay un "modo edición" global como puerta de
   entrada a cualquier cambio de nombre/cantidad.
3. **No se puede reordenar.** La columna `position` existe en la BD pero no hay
   ninguna UI; y además hay un **bug**: los ítems añadidos por chip/autocompletado
   entran con `position = 0` y saltan al principio de la lista.
4. **Borrar es un toque accidental sin vuelta atrás.** Papelera siempre visible
   y sin deshacer.
5. **El checkout no está donde ocurre.** En el modo compra (el momento caja) hay
   que salir a `/lista` para finalizar la compra.

Principio rector: **el gesto frecuente no puede esperar al servidor**. Todo lo
que el usuario hace en ráfaga (añadir, marcar, borrar) debe ser optimista con
reconciliación posterior, como ya hace `toggle`.

## Mapa de prioridad

| # | Mejora | Eje | Impacto | Esfuerzo | Depende de |
|---|---|---|---|---|---|
| L1 | Bug: `position` en altas por chip/autocompletado | Orden | Alto (bug) | Trivial | — |
| L2 | Alta optimista sin bloquear el input | Añadir | Muy alto | Medio | — |
| L3 | No duplicar: sumar cantidad si ya está en lista | Añadir | Alto | Bajo | — |
| L4 | Habituales/sugerencias al alcance del pulgar | Añadir | Alto | Bajo | — |
| L5 | Editar con toque directo (sin modo edición) | Editar | Alto | Bajo | — |
| L6 | Deshacer al borrar + swipe | Editar | Alto | Medio | — |
| L7 | Finalizar compra desde el modo compra | Modo compra | Alto | Bajo | — |
| L8 | Parseo de cantidad en texto libre ("2 leche") | Añadir | Medio | Medio | mejor tras L2 |
| L9 | Stepper ±1 inline en la fila | Editar | Medio | Bajo | mejor tras L5 |
| L10 | Agrupar por categoría en `/lista` (toggle) | Orden | Medio | Bajo-medio | L1 |
| L11 | Reordenación manual (drag & drop) | Orden | Medio | Medio-alto | L1; valorar tras L10 |
| L12 | Añadir desde el modo compra | Modo compra | Medio | Bajo | — |
| L13 | Pulido del modo compra (colapsar, progreso, haptics) | Modo compra | Bajo | Bajo | — |

**Si solo se hace una: L2.** Es la que convierte "apuntar la compra" en un
gesto de segundos. L1 es trivial y debería caer en la primera sesión que toque
la feature.

## Qué NO hacer (decisiones de producto, no reabrir)

- **No listas múltiples ni carpetas**: una lista activa por hogar es el modelo.
- **No campos nuevos en el alta rápida** (marca, precio objetivo, notas…): el
  camino rápido es un solo input; el detalle vive en el drawer de edición.
- **No IA en el alta ni en el parseo de cantidades**: regex/heurística
  determinista en TS (cuota Gemini reservada a tickets y menús).
- **Nada de automatismos silenciosos**: sumar cantidades al detectar duplicado
  se muestra y se puede deshacer; jamás fusionar ítems sin señal visible.

## Estado actual verificado en código (puntos de anclaje)

| Pieza | Dónde | Dato relevante |
|---|---|---|
| Vista principal | `src/features/shopping-list/components/shopping-list-view.tsx` | Pendientes + "En el carro"; modo edición global (`editMode`); papelera por fila siempre visible; `CheckoutBar` fija cuando hay marcados |
| Alta | `src/features/shopping-list/components/add-item-form.tsx` | `disabled={pending}` en el input bloquea altas encadenadas; sin optimismo (espera `router.refresh()`) |
| Autocompletado | `src/features/shopping-list/components/product-autocomplete.tsx` | Combobox ARIA correcto; exige ≥1 carácter (`q.length < 1 → []`); ordena por `purchaseCount` |
| Edición | `src/features/shopping-list/components/edit-list-item-drawer.tsx` | `ResponsiveModal` con nombre/cantidad/unidad + eliminar |
| Modo compra | `src/features/shopping-list/components/shopping-mode.tsx` | Agrupa por categoría, total estimado, wake lock; **sin** checkout ni alta |
| Marcado optimista | `shopping-list-view.tsx` (`toggle`) + `toggleItemAction` | El patrón a imitar: estado local primero, acción sin `revalidatePath`, Realtime reconcilia |
| ⚠️ Bug de orden | `src/features/shopping-list/actions.ts` (`addProductToListAction`) | No envía `position`; la BD aplica `default 0` (migración `20260719131524_shopping_list.sql`) → chips/autocompletado saltan al principio. `addListItemAction` sí calcula `max+1` |
| Orden de lectura | `src/features/shopping-list/queries.ts` (`getListItems`) | `order is_checked → position → created_at`; índice `(list_id, is_checked, position)` ya existe |
| Duplicados | `addListItemAction` / `addProductToListAction` | Ninguna comprueba si el producto ya está en la lista: siempre insertan fila nueva |
| Realtime | `src/features/shopping-list/use-realtime-list.ts` | `router.refresh()` ante cualquier cambio de `shopping_list_items`; resincronización por firma (`signatureOf`) en las vistas |
| Checkout | `actions.ts` (`checkoutAction`) | Vuelca marcados a inventario + redirige a revisión de caducidades; reutilizable tal cual desde el modo compra |
| Pasillos | `queries.ts` (`getShoppingModeItems`) | Join a `categories` con `sort_order`; reutilizable para agrupar en `/lista` (L10) |
| A11y pendiente | `add-item-form.tsx` (campo "Cant.") | Placeholder-only con `aria-label`; incumple la regla de labels visibles de `AGENTS.md` — resolver dentro de L8 |

### Gotchas del repo (no descubrirlos de nuevo)

- `src/lib/supabase/types.ts` se mantiene **a mano** — NO regenerar con la CLI.
- Migraciones vía Supabase CLI (`supabase db push`, proyecto enlazado); pedir
  autorización al usuario antes del push. L1–L9 y L12–L13 **no** necesitan
  migración; L10/L11 tampoco (la columna `position` ya existe).
- `shadcn add` sobrescribe `button.tsx`/`input.tsx` (touch targets deliberados).
- Reglas de diseño de `AGENTS.md` obligatorias: tokens semánticos, overlays vía
  `ResponsiveModal`, anchos vía `PageContainer`, targets ≥44px, UI en español,
  AA en ambos temas.
- El resync por firma (`signatureOf`) de las vistas compara campos concretos:
  si una mejora añade campos visibles (p. ej. posición), inclúyelos en la firma
  o el optimismo se pisará con datos viejos.

---

## L1 — Bug: `position` en altas por chip/autocompletado

**Objetivo.** Que todo ítem nuevo entre **al final** de la lista, se añada como
se añada. Es prerrequisito de cualquier trabajo de ordenación (L10, L11).

**Anclaje.** `addProductToListAction` (`src/features/shopping-list/actions.ts`)
inserta sin `position` → `default 0`. `addListItemAction` ya calcula `max+1`.

**Alcance v1:**

- Calcular `position = max + 1` también en `addProductToListAction` (misma
  consulta que usa `addListItemAction`; extraer helper compartido).
- Opcional barato: una pasada de normalización no es necesaria — los ítems
  existentes con `position = 0` quedan ordenados por `created_at` como desempate
  y se corrigen solos al salir de la lista con el checkout.

**Criterios de aceptación:**

- Añadir por texto libre, por autocompletado y por chip de habituales/sugerencias,
  en cualquier orden → los ítems aparecen en el orden en que se añadieron.
- El modo compra (que ordena por `position` dentro de categoría) no cambia de
  comportamiento aparente.

---

## L2 — Alta optimista sin bloquear el input

**Objetivo.** Poder vaciar la cabeza: escribir → Enter → escribir → Enter, sin
esperas ni cierres de teclado. Es la mejora de mayor impacto del backlog.

**Anclaje.** `add-item-form.tsx` (`disabled={pending}`, espera al servidor) y
`shopping-list-view.tsx` (patrón optimista ya existente en `toggle`).

**Alcance v1:**

- Insertar el ítem en el estado local de `ShoppingListView` en el momento del
  submit (id temporal), con nombre/cantidad/unidad tal como se enviaron.
- No deshabilitar el input ni el botón "+" durante el guardado; limpiar el
  campo y **mantener el foco** para encadenar altas. El teclado móvil no debe
  cerrarse entre altas.
- Reconciliar cuando llegue el refresh/Realtime (el mecanismo de firma ya
  resincroniza; asegurar que el ítem temporal se sustituye por el real sin
  parpadeo ni duplicado visual).
- Si la acción falla: quitar el ítem optimista, restaurar el texto en el input
  y mostrar el error (patrón actual de `toast.error` + `router.refresh()`).
- Aplicar el mismo tratamiento a los chips de Sugerencias/Habituales: hoy
  `disabled={adding}` bloquea todos los chips mientras uno guarda — deben
  poderse tocar en ráfaga, desapareciendo optimistamente al añadirse.

**Fuera de alcance:** cola offline persistente (el PWA offline real es otra
tarea); si no hay red, basta el comportamiento de error descrito.

**Criterios de aceptación:**

- Añadir 5 ítems seguidos tecleando sin pausa → los 5 aparecen al instante en
  la lista y quedan persistidos; cero toques extra entre altas.
- El aviso "Ya tienes X en el inventario" (warning del alta) sigue llegando
  como toast sin bloquear el flujo.
- Tocar 3 chips de habituales seguidos → los 3 entran; ninguno se pierde.
- Con la acción fallando (simular error), el ítem optimista desaparece y el
  texto vuelve al input.

---

## L3 — No duplicar: sumar cantidad si ya está en la lista

**Objetivo.** Que añadir algo que ya está en la lista no cree una segunda fila:
en un hogar compartido es el caso típico ("los dos apuntamos leche").

**Anclaje.** `addListItemAction` y `addProductToListAction` (ninguna comprueba
existencia). Match por `product_id` o, en texto libre, por `normalized_name`
(`src/lib/normalize.ts`), solo contra ítems **sin marcar** de la lista activa.

**Alcance v1:**

- Si hay match con un ítem sin marcar: en vez de insertar, sumar la cantidad
  (si ambas existen y la unidad coincide) o dejar la existente si el alta nueva
  no lleva cantidad. Si las unidades no coinciden → insertar fila nueva (no
  adivinar conversiones, regla del repo).
- Señal visible: toast "Leche ya estaba en la lista → 2 ud" (nunca silencioso).
- En el autocompletado, marcar con un badge "En la lista" los productos que ya
  están (dato disponible: ítems en cliente + `productId`); elegirlos aplica la
  misma suma.
- Los ítems marcados (en el carro) no cuentan como duplicado: si ya cogiste
  leche y añades leche, es un ítem nuevo pendiente.

**Criterios de aceptación:**

- "leche" en lista sin marcar + añadir "Leche" (texto libre, otra capitalización)
  → una sola fila; con cantidades 1 + 2 → queda 3.
- Mismo producto con unidad distinta (1 ud vs 500 g) → dos filas.
- Producto en el carro (marcado) + alta nueva → fila nueva pendiente.
- El toast informa siempre que hubo fusión.

---

## L4 — Habituales y sugerencias al alcance del pulgar

**Objetivo.** Que los atajos de un toque estén donde ocurre el alta, no
enterrados bajo la lista (con 15 ítems quedan fuera de pantalla).

**Anclaje.** `product-autocomplete.tsx` (exige ≥1 carácter) y las secciones
`Suggestions`/`Habituales` de `shopping-list-view.tsx`.

**Alcance v1:**

- Al **enfocar el input vacío**, el desplegable del combobox muestra los top
  habituales y sugerencias (mezclados, sugerencias primero, mismo límite
  `MAX_SUGGESTIONS` o ligeramente mayor), con su motivo abreviado cuando lo
  haya ("cada ~6 días").
- Las secciones de abajo pueden quedarse (escritorio las agradece), pero en
  móvil dejan de ser el único acceso.
- Mantener la semántica ARIA del combobox (es la razón de que exista este
  componente; no romperla).

**Fuera de alcance:** fila de chips con scroll horizontal bajo el formulario
(alternativa descartada por redundante si el focus-dropdown funciona bien;
reabrir solo si el usuario lo pide tras probar).

**Criterios de aceptación:**

- Tocar el input vacío → aparecen opciones al instante, un toque añade
  (comportamiento idéntico a elegir una sugerencia escrita).
- Escribir sigue filtrando el catálogo completo como hoy.
- Navegable con teclado (flechas/Enter/Escape) y `aria-activedescendant`
  correcto también en el estado "vacío con opciones".

---

## L5 — Editar con toque directo (sin modo edición global)

**Objetivo.** Cambiar nombre/cantidad de un ítem en 2 toques: tocar el nombre →
editar. Eliminar el ciclo "Editar → fila → Hecho".

**Anclaje.** `shopping-list-view.tsx` (`editMode`, `ListRow`): hoy toda la fila
es label del checkbox; en modo edición la fila entera abre el drawer.

**Alcance v1:**

- Dividir la fila en dos zonas táctiles: el **checkbox + margen generoso**
  (≥44px, puede abarcar hasta ~40% del ancho) marca/desmarca; el **texto del
  ítem** abre `EditListItemDrawer` directamente.
- Eliminar el botón "Editar"/"Hecho" y el estado `editMode`… salvo que L6 o
  L11 lo reutilicen como "modo organizar" (decisión: si al llegar aquí L11 ya
  está descartada, eliminarlo; si está prevista, dejar el toggle pero sin que
  sea necesario para editar).
- Affordance visual sutil en el texto (p. ej. chevron o subrayado punteado en
  la cantidad) para que se descubra que es tocable.
- Accesibilidad: el texto-botón necesita `aria-label` («Editar leche»); el
  checkbox conserva el suyo.

**Criterios de aceptación:**

- Tocar el nombre abre el editor con ese ítem; tocar el checkbox marca sin
  abrir nada; ninguna de las dos zonas < 44px de alto.
- No queda ningún flujo que exija el antiguo modo edición para editar.
- Marcar por error al intentar editar no ocurre en uso normal (probar en
  viewport 375px con el pulgar, no con puntero).

---

## L6 — Deshacer al borrar + swipe

**Objetivo.** Quitar el riesgo del toque accidental y dar vuelta atrás. Hoy la
papelera está en cada fila, borra al instante y no hay undo.

**Anclaje.** `ListRow` (botón papelera), `deleteListItemAction`,
`EditListItemDrawer` (botón "Quitar de la lista").

**Alcance v1:**

- **Swipe hacia la izquierda** en la fila (móvil) revela/ejecuta "Quitar";
  implementación con pointer events propios o una lib ligera ya compatible con
  React 19 — evitar dependencias pesadas.
- **Toast con "Deshacer"** (≈5 s) tras cualquier borrado (swipe o drawer).
  Implementación recomendada: borrado optimista local + acción diferida al
  expirar el toast; si el usuario deshace antes, no se llama al servidor.
  (Alternativa: borrar ya y reinsertar al deshacer — aceptable, pero pierde
  `position` y `added_by`; documentar la elección en el PR.)
- **Quitar la papelera fija** de la fila: en escritorio (sin swipe), mostrarla
  solo en hover/focus de la fila (`group-hover`), patrón estándar.
- El realtime del resto de miembros se entera al confirmarse el borrado (no
  durante la ventana de undo) — comportamiento aceptado en v1.

**Criterios de aceptación:**

- Swipe + "Deshacer" → el ítem vuelve exactamente donde estaba (misma posición
  visible) y no se borró en el servidor.
- Dejar expirar el toast → el ítem desaparece también en otro dispositivo.
- En escritorio, la papelera aparece al hacer hover y con foco de teclado
  (visible con `:focus-visible`, no solo hover).
- Borrar desde el drawer también ofrece deshacer.

---

## L7 — Finalizar compra desde el modo compra

**Objetivo.** Cerrar la compra donde termina: en la caja, dentro del modo
compra, sin volver a `/lista`.

**Anclaje.** `shopping-mode.tsx` (no tiene checkout) y `checkoutAction`
(reutilizable tal cual; ya redirige a `/inventario/revision`).

**Alcance v1:**

- Footer fijo en el modo compra cuando hay ≥1 ítem marcado: botón
  "Finalizar compra (N) → inventario" (mismo texto y semántica que la
  `CheckoutBar` de `/lista`; extraer componente compartido si sale natural).
- Respetar `pb-safe` y no tapar la última fila (padding inferior del scroll).
- Tras checkout: salir del modo compra (la redirección a revisión de
  caducidades ya lo hace; si no hay ids, volver a `/lista`).
- El wake lock se libera al desmontar (ya implementado; verificar que la
  navegación por `router.push` lo dispara).

**Criterios de aceptación:**

- Marcar todo → finalizar desde el modo compra → inventario actualizado y
  redirección a revisión de caducidades; la lista queda sin los comprados.
- Con 0 marcados el botón no aparece.
- Dos dispositivos en modo compra: al finalizar uno, el otro ve la lista
  vaciarse (Realtime ya lo cubre).

---

## L8 — Parseo de cantidad en texto libre

**Objetivo.** Que "2 leche", "300 g arroz" o "aceite 1l" entren con cantidad y
unidad correctas desde un solo input, sin tocar el campo "Cant.".

**Anclaje.** `add-item-form.tsx` + `addListItemSchema`
(`src/features/shopping-list/schemas.ts`). Unidades válidas: `ud, g, kg, ml, l`
(enum del schema). Determinista, sin IA.

**Alcance v1:**

- Heurística en cliente antes del submit: número al inicio o al final del
  texto, con unidad opcional pegada o separada ("2", "2 ud", "300g", "1,5 l").
  Coma decimal soportada (ya se hace en el campo actual).
- El nombre resultante es el texto sin el fragmento de cantidad, trim y sin
  dobles espacios. Si la heurística no matchea con confianza → todo es nombre
  (nunca partir mal un "7 up" — mantener una lista corta de falsos positivos o
  exigir separador).
- **Preview en vivo**: mientras se escribe, mostrar bajo el input qué se
  entendió ("Añadir: arroz · 300 g") para que el usuario confíe en el parseo.
- El campo "Cant." se elimina del formulario de alta (la edición fina queda en
  el drawer). Esto resuelve además el label placeholder-only pendiente de a11y.
- El autocompletado filtra por el **nombre parseado**, no por el texto crudo
  (escribir "2 lech" debe sugerir "Leche"); elegir una sugerencia respeta la
  cantidad parseada (comportamiento equivalente al actual `handleSelect`).

**Criterios de aceptación:**

- "2 leche" → Leche, 2 ud (o unidad por defecto del producto si matchea
  catálogo). "300g arroz" → arroz, 300 g. "aceite 1,5 l" → aceite, 1.5 l.
- "7 up" (o texto sin patrón claro) → nombre íntegro, sin cantidad.
- El preview coincide siempre con lo que realmente se inserta.
- No queda ningún input placeholder-only en el formulario.

---

## L9 — Stepper ±1 inline

**Objetivo.** El ajuste más común ("pon 2 en vez de 1") sin abrir el drawer ni
el teclado numérico.

**Anclaje.** `ListRow` y `updateListItemAction` (sirve tal cual; valorar una
variante ligera que solo toque `quantity`).

**Alcance v1:**

- Al tocar la **zona de cantidad** de la fila (o un affordance equivalente
  decidido en L5), mostrar stepper − / + inline o en un popover mínimo;
  optimista, con persistencia debounced (una llamada al soltar, no por toque).
- "−" sobre cantidad 1 → la cantidad pasa a null (ítem sin cantidad), no a 0.
- Ítems sin cantidad: "+" empieza en 1.
- Solo para unidad "ud" o sin unidad; en g/kg/ml/l el paso ±1 no tiene sentido
  → esos abren el drawer como hasta ahora.

**Criterios de aceptación:**

- Tocar +/+/+ rápido → una sola escritura al servidor con el valor final; la
  UI nunca espera.
- Realtime: el otro dispositivo ve la cantidad final.
- Targets del stepper ≥44px; operable con teclado en escritorio.

---

## L10 — Agrupar por categoría en `/lista` (toggle)

**Objetivo.** Ver la lista organizada por pasillos también fuera del modo
compra. Para muchos hogares esto sustituye a la reordenación manual.

**Anclaje.** `getShoppingModeItems` ya resuelve el join a categorías con
`sort_order`; `getListItems` no lo trae. Depende de L1 (orden consistente).

**Alcance v1:**

- Toggle "Agrupar por categoría" en la cabecera de la lista (icono + estado
  persistido en `localStorage`; no necesita tabla).
- Agrupado: mismas cabeceras de sección que el modo compra (icono + nombre,
  orden por `sort_order`); dentro de cada grupo, orden por `position`.
  Sin agrupar: comportamiento actual.
- "En el carro" queda siempre como bloque final único (no se agrupa).
- Ítems sin categoría → grupo "Otros" al final (constante ya existente
  `NO_CATEGORY_SORT`).

**Criterios de aceptación:**

- El toggle persiste entre visitas y no afecta al otro miembro del hogar.
- Añadir un ítem con la vista agrupada lo coloca en su grupo al reconciliar
  (optimista puede aparecer al final del grupo "Otros" hasta saber categoría —
  aceptable y documentado).
- El modo compra no cambia.

---

## L11 — Reordenación manual (drag & drop) — DESCARTADA

> **Decisión (2026-07-23):** descartada tras implementar L10. El agrupado por
> categoría cubre la necesidad de orden para el hogar; el drag & drop añadía
> esfuerzo medio-alto (dependencia o pointer-code, accesibilidad de teclado,
> reescritura de `position`) sin beneficio claro por encima de L10. Reabrir
> solo si el uso real lo pide.

**Objetivo.** Arrastrar para reordenar los pendientes. Valorar **después** de
L10: si el agrupado por categoría cubre la necesidad real, esta tarea puede
quedar descartada — confirmarlo con el usuario antes de empezar.

**Anclaje.** Columna `position` + índice ya existen (L1 debe estar hecha).
Vista: `shopping-list-view.tsx`.

**Alcance v1:**

- Solo en la vista **sin agrupar** y solo sobre pendientes ("En el carro" no se
  reordena).
- Móvil: long-press sobre la fila levanta el ítem y activa el arrastre (sin
  asa permanente, no hay ancho). Escritorio: asa visible en hover + arrastre
  con puntero; accesible también con teclado (patrón estándar: foco en el asa,
  espacio para coger, flechas para mover, espacio para soltar).
- Implementación sugerida: `@dnd-kit` (compatible React 19; verificar) o
  pointer events propios si la dependencia pesa demasiado.
- Persistencia: Server Action que recibe el nuevo orden (lista de ids →
  posiciones enteras reescritas 1..n); optimista en cliente; last-write-wins
  entre miembros (suficiente para un hogar).
- Incluir `position` en la firma de resync (`signatureOf`) para que Realtime
  reconcilie bien.

**Criterios de aceptación:**

- Reordenar en un dispositivo se refleja en el otro vía Realtime.
- Marcar/desmarcar y editar siguen funcionando igual durante y después del
  arrastre; el scroll de la página no se dispara al arrastrar en móvil.
- Sin ratón: se puede reordenar con teclado en escritorio.

---

## L12 — Añadir desde el modo compra

**Objetivo.** Estás en la tienda y recuerdas algo: añadirlo sin salir del modo
compra.

**Anclaje.** `shopping-mode.tsx`; reutilizar `AddItemForm` (que tras L2/L8 ya
es optimista y parsea cantidades) dentro de un `ResponsiveModal`.

**Alcance v1:**

- Botón "+" en el header del modo compra → bottom sheet con el formulario de
  alta (catálogo incluido: pasar `catalog` a la ruta `/lista/compra` o cargarlo
  ahí; cuidado con el peso, es la misma query `getProductCatalog`).
- El ítem nuevo aparece en su grupo de categoría (o "Otros") vía el refresh de
  Realtime; optimismo local dentro del modo compra es deseable pero puede
  quedar en seguimiento si complica la reconciliación por firma.

**Criterios de aceptación:**

- Añadir desde el modo compra en el móvil A → aparece en el modo compra del
  móvil B sin salir de la vista.
- El sheet respeta `pb-safe` y el teclado no tapa el input (probar en 375px).
- Cerrar el sheet no rompe el wake lock.

---

## L13 — Pulido del modo compra

**Objetivo.** Detalles de calidad de vida para la tienda. Agrupa tres micro
mejoras independientes; pueden hacerse juntas (son pequeñas) o partirse.

**Alcance v1:**

- **Colapsar cogidos por sección**: los ítems marcados de cada categoría se
  contraen a una línea "✓ 3 cogidos" tocable para expandir (los grupos ya
  ordenan marcados al final; esto reduce scroll en listas largas).
- **Progreso**: "12 de 18" (o barra fina) en el header, junto a "Quedan N por
  coger".
- **Haptics**: `navigator.vibrate(10)` al marcar, con feature-detect y
  respetando `prefers-reduced-motion` (si está activo, no vibrar).

**Criterios de aceptación:**

- Colapsar/expandir no pierde el estado al llegar un refresh de Realtime.
- La vibración no ocurre en dispositivos sin soporte ni con reduced motion.
- Nada de esto cambia la vista `/lista`.

---

## Orden sugerido de implementación

1. **L1** (bug de `position`) — trivial, desbloquea el eje de orden.
2. **L2** (alta optimista) — el grueso de la sensación de agilidad.
3. **L3** (no duplicar) + **L4** (habituales en el foco) — completan el alta.
4. **L5** (edición directa) + **L6** (deshacer + swipe) — completan la edición.
5. **L7** (checkout en modo compra) — quick win independiente, puede adelantarse.
6. **L8** (parseo de cantidad) → **L9** (stepper) — segunda pasada de agilidad.
7. **L10** (agrupar por categoría) → decidir con el usuario si **L11** (drag &
   drop) sigue haciendo falta.
8. **L12** y **L13** cuando el resto esté asentado.

Cada mejora termina con: `npm run build` limpio, prueba en viewport móvil
(375px) y escritorio, verificación AA en ambos temas de cualquier UI nueva, y
prueba de sincronización Realtime con dos sesiones cuando la mejora toque
escrituras.
