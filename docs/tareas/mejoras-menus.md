# Mejoras de menús — backlog priorizado (N1–N5)

> **Documento para un agente de IA.** Lee este documento completo antes de tocar código.
> Lee también `AGENTS.md` (raíz del repo) y la guía de Next.js en
> `node_modules/next/dist/docs/` — este proyecto usa Next.js 16 con cambios que
> pueden diferir de tus datos de entrenamiento.
>
> Este documento es un **backlog**: cada mejora (N1…N5) es una tarea
> independiente y demo-able por sí sola. Implementa **una mejora por sesión**,
> en el orden de prioridad salvo que el usuario pida otra. No mezcles varias
> mejoras en un mismo commit.

## Contexto de producto

Fill Good genera menús semanales con IA a partir del inventario, el recetario
del hogar y unas reglas (min/max por receta + texto libre). El feedback del
usuario pide **darle más fuerza a los menús**: mover platos de día u hora con
comodidad, no empezar con el recetario a cero, y que la IA conozca el objetivo
del hogar (mantenerse sano, perder peso, masa muscular…).

El diagnóstico de la revisión (2026-07-22) encontró tres dolores reales y un
cuarto que el feedback no menciona pero que invalida a los demás si no se
arregla primero:

1. **Mover un plato es imposible.** Hoy hay que borrarlo y reescribirlo; y al
   editar, una entrada con receta vinculada se convierte en texto libre
   (pierde ingredientes, coste M7 y descuento de stock M2).
2. **La regeneración es destructiva.** "Generar menú con IA" hace `DELETE` de
   toda la semana, incluidas las ediciones manuales del usuario. Cualquier
   inversión en manipulación manual exige antes que la regeneración respete
   lo tocado por humanos.
3. **La IA no sabe nada del hogar.** El prompt hardcodea "saludable y
   equilibrado… cenas más ligeras". No hay objetivo, estilo de dieta,
   ingredientes a evitar ni nº de raciones configurables.
4. **Arranque en frío del recetario.** La IA inventa platos efímeros que se
   pueden guardar, pero "¿Qué hago hoy?" (M6), las reglas (C2) y el coste por
   receta (M7) solo rinden con recetario poblado.

Principio rector (heredado de `mejoras-producto.md`): **usar el dato que ya se
captura antes de capturar dato nuevo**, y preferir soluciones deterministas
(SQL/TS) sobre llamadas de IA (cuota Gemini free tier).

## Mapa de prioridad

| # | Mejora | Dolor que ataca | Impacto | Esfuerzo | Migración | Depende de |
|---|---|---|---|---|---|---|
| N1 | Mover y duplicar platos | 1 | Muy alto | Bajo | No | — |
| N2 | Regeneración respetuosa + "otra idea" por hueco | 2 | Muy alto | Medio | Sí (2 columnas) | — |
| N3 | Perfil de menús del hogar (objetivo) | 3 | Alto | Medio | Sí (tabla nueva) | — |
| N4 | Recetario inicial curado ("Explorar recetas") | 4 | Alto | Alto (contenido) | Sí (chica) | mejor tras N3 |
| N5 | Copiar semana anterior | 1 | Medio | Bajo | No | N1 |

**Si solo se hace una: N1.** Es la fricción diaria y desbloquea que el resto
del trabajo manual tenga sentido. N2 debería ir inmediatamente después: sin
ella, el botón principal de la pantalla destruye lo que N1 permite construir.

## Qué NO hacer (decisiones de producto, no reabrir)

- **No macros ni calorías.** `mejoras-producto.md` ya fija "no planificación
  nutricional/macros: es otro producto". El objetivo del hogar (N3) se
  implementa como **sesgo cualitativo del prompt** (frases fijas y
  deterministas por objetivo), sin un solo número nutricional en UI ni BD.
- **No APIs externas de recetas** (TheMealDB, Spoonacular, Edamam…): las
  gratuitas son anglosajonas (nombres e ingredientes no casan con un hogar
  español y romperían el matching ingrediente↔catálogo), las buenas son de
  pago, y una dependencia externa contradice la ventaja del dato propio. El
  arranque en frío se resuelve con un **pack curado en el repo** (N4), mismo
  patrón que el catálogo E12.
- **El objetivo es del HOGAR, no por miembro.** La cena es compartida;
  objetivos individuales en conflicto no tienen solución de producto. Las
  particularidades individuales van como texto libre ("Ana no toma lactosa")
  en `avoid_text` o en las reglas free-text existentes.
- **"Evitar ingredientes" nunca se presenta como gestión de alergias.** Un LLM
  generativo no puede garantizar "sin trazas". Etiquetar siempre como
  preferencia, con helper text explícito (ver N3).
- **Drag & drop nunca como único camino para mover.** En una PWA móvil,
  arrastrar sobre una lista vertical con scroll es frustrante y poco
  accesible. El gesto primario es "Mover a…" explícito (N1); el drag & drop es
  pulido opcional de una sesión posterior.
- **Nada de automatismos silenciosos**: toda escritura derivada se propone y
  el usuario confirma con un toque (patrón establecido en el repo).

## Estado actual verificado en código (puntos de anclaje)

| Pieza | Dónde | Dato relevante |
|---|---|---|
| Grid semanal | `src/features/menus/components/menu-view.tsx` (const `SLOTS`, ~línea 63) | Solo `lunch`/`dinner` en UI. La BD **ya admite** `breakfast`: check en `supabase/migrations/20260719143638_menus.sql:47` |
| Editar plato | `updateMenuEntryAction` (`src/features/menus/actions.ts:424`) | Pone `recipe_id: null` — editar una receta la degrada a texto libre |
| Añadir plato | `addMenuEntryAction` (`actions.ts:377`) | Calcula `position` como siguiente libre del hueco |
| Regenerar | `generateMenuAction` (`actions.ts:283`) | `delete().eq("menu_id", menuId)` — borra TODA la semana antes de insertar |
| Unicidad | `supabase/migrations/20260720160000_menu_entries_multi.sql` | `unique (menu_id, date, meal_slot, position)` — mover/duplicar debe recalcular `position` en destino |
| `menu_entries` columnas | `supabase/migrations/20260719143638_menus.sql:42` | `date`, `meal_slot`, `recipe_id` (nullable), `free_text`, `position`, `cooked_at`. **No existe** `source` ni `pinned` (los añade N2) |
| Prompt IA | `buildMenuPrompt` (`src/lib/ai/menu-prompt.ts:88`) | Objetivo hardcodeado ("saludable y equilibrado", "cenas más ligeras"); raciones hardcodeadas ("para 2 raciones", ~línea 142) |
| Raciones efímeras | `actions.ts:327` | `servings: 2` hardcodeado al insertar recetas efímeras |
| Reglas del menú | `menu_rules` + `validateAndPatchRules` (`src/features/menus/rules.ts`) | Validación determinista post-IA de min/max; UI en `components/menu-rules.tsx` |
| Recetas | `recipes`: `source` check `('manual','ai')` (`20260719143638_menus.sql:14`), `is_saved` (`20260720120000_recipes_recetario.sql`) | Efímeras = `is_saved=false`; `saveGeneratedRecipeAction` en `src/features/recipes/actions.ts` las asciende; `cleanupOrphanEphemeralRecipes` (`menus/actions.ts:90`) limpia huérfanas |
| Cocinado | `toggleEntryCookedAction` (`actions.ts:470`) | `cooked_at` = fecha de la entrada; alimenta apetencia (C3) y descuento de stock (M2) |
| Añadir receta a hoy | `addRecipeToMenuAction` (`actions.ts:723`) | Elige slot por hora (<16:00 → lunch); reutilizable como referencia de inserción |
| Entrada (tipo) | `MenuEntry` en `src/features/menus/queries.ts` | Campos usados por la vista: `id, date, slot, recipeId, recipeName, recipeIsSaved, freeText, cookedAt` |
| Precedente de siembra | `supabase/migrations/20260721170000_seed_default_products.sql` (E12) | Función idempotente `security definer`, sembrada en `create_household` + backfill; ~75 productos con `normalized_name` precalculado como literal |
| Matching ingrediente↔producto | `src/features/menus/missing.ts` (`computeMissingIngredients`) | Tres niveles: product_id → nombre exacto normalizado → fuzzy. N4 reutiliza SOLO el nivel exacto |
| Coste semanal | `weekCost` en `menu-view.tsx` (M7) | Depende de `recipe_id` en las entradas — otra razón para que mover no rompa el vínculo |

### Gotchas del repo (no descubrirlos de nuevo)

- `src/lib/supabase/types.ts` se mantiene **a mano** — NO regenerar con la CLI
  (romperías los alias `UnitType`/`LocationType`). Tras cada migración, añade
  los tipos nuevos editando el archivo.
- Migraciones vía Supabase CLI (`supabase db push`, proyecto ya enlazado);
  **pide autorización al usuario antes de ejecutar el push**.
- IA **siempre** vía `getModel('menus')` de `src/lib/ai/models.ts`. El usuario
  no quiere gasto en IA: Gemini free tier y preferir lógica determinista.
- Overlays vía `ResponsiveModal`, anchos vía `PageContainer`, solo tokens
  semánticos, touch targets ≥44px, UI en español, AA en ambos temas
  (`AGENTS.md` es obligatorio).
- `shadcn add` sobrescribe `button.tsx`/`input.tsx`; responde "no" o restaura
  con git.
- En móvil no apiles bottom sheets: si un flujo necesita "segunda pantalla"
  (p. ej. el picker de destino de N1), cambia la vista DENTRO del mismo
  `ResponsiveModal` en vez de abrir otro encima.

---

## N1 — Mover y duplicar platos

**Objetivo.** Que reorganizar la semana sea un gesto de 2 toques: "Mover a…" y
"Duplicar en…" desde el sheet de edición de cualquier plato, conservando el
vínculo con la receta.

**Valor.** Es la acción más frecuente de un planificador y hoy es imposible
sin destruir datos. El modelo ya lo soporta: mover = actualizar
`date`/`meal_slot`/`position`. Cero migraciones.

**Alcance v1:**

- Dos botones nuevos en `EditEntryDrawer` (`menu-view.tsx:407`), solo cuando
  `entryId != null`: **Mover a…** y **Duplicar en…**.
- Al pulsarlos, el mismo `ResponsiveModal` cambia a una vista de picker:
  rejilla compacta de 7 días × huecos activos de la semana visible, cada celda
  con el día ("lun 22") y el hueco ("Comida"/"Cena"), touch target ≥44px.
  El hueco de origen aparece marcado y deshabilitado (para mover). Botón
  "Volver" para regresar a la edición.
- Server actions nuevas en `src/features/menus/actions.ts`:
  - `moveMenuEntryAction(entryId, date, slot)`: actualiza `date`, `meal_slot`
    y `position` (siguiente libre del hueco destino, mismo cálculo que
    `addMenuEntryAction`). **Conserva `recipe_id`/`free_text` tal cual.**
  - `duplicateMenuEntryAction(entryId, date, slot)`: inserta una copia
    (mismo `recipe_id` o `free_text`) en el destino. **Nunca copia
    `cooked_at`.**
- Ambas revalidan `/menus`.

**Decisiones:**

- **Misma semana en v1.** Mover a otra semana exigiría `ensureMenu` de la
  semana destino y un picker con navegación; anotar como iteración futura, no
  hacerlo ahora.
- **Entradas cocinadas:** si `cooked_at != null` y la fecha destino es futura,
  la acción devuelve error claro ("No puedes mover a un día futuro un plato ya
  cocinado"); la UI puede además deshabilitar esas celdas. No desmarcar
  cocinado en silencio.
- **Drag & drop: NO en esta tarea.** Si el usuario lo pide después, es una
  sesión aparte (dnd-kit: pointer en escritorio, long-press en móvil), siempre
  como capa encima de "Mover a…", nunca sustituto.

**Criterios de aceptación:**

- Mover una entrada con receta vinculada conserva `recipe_id`: tras mover, el
  coste semanal (M7) no cambia y "Lo cocinamos" sigue proponiendo descuento.
- Mover al hueco de origen es no-op sin error.
- Dos platos movidos al mismo hueco no colisionan con el unique
  `(menu_id, date, meal_slot, position)`.
- Duplicar una entrada cocinada crea una copia SIN cocinar.
- Todo el flujo funciona en 375px (bottom sheet) y en escritorio (dialog),
  AA en ambos temas.

---

## N2 — Regeneración respetuosa + "otra idea" por hueco

**Objetivo.** Que "Generar menú con IA" deje de arrasar la semana: por defecto
completa los huecos libres respetando lo manual y lo fijado; "Rehacer todo"
pasa a ser una opción explícita. Y un re-roll por hueco ("otra idea") para
cambiar un solo plato sin tocar el resto.

**Anclaje.** `generateMenuAction` (`actions.ts:283` hace el DELETE),
`buildMenuPrompt` (`menu-prompt.ts:88`), `validateAndPatchRules`
(`rules.ts`), `cleanupOrphanEphemeralRecipes` (`actions.ts:90`).

**Migración** (nueva, editar `types.ts` a mano después):

```sql
alter table menu_entries
  add column source text not null default 'manual'
    check (source in ('manual', 'ai')),
  add column pinned boolean not null default false;
```

El default `'manual'` hace de backfill conservador: todo lo existente queda
protegido (mejor proteger de más que borrar trabajo del usuario).
`generateMenuAction` y el re-roll insertan con `source = 'ai'`;
`addMenuEntryAction`, `updateMenuEntryAction`, `addRecipeToMenuAction`,
`moveMenuEntryAction`/`duplicateMenuEntryAction` (N1) escriben/conservan
`'manual'` (editar una entrada IA la convierte en manual, coherente con que ya
la desvinculaba).

**Flujo v1:**

1. **Fijar plato:** toggle "Fijar" (icono chincheta, `aria-pressed`) en el
   sheet de edición. Una entrada `pinned` nunca la toca la regeneración,
   sea `ai` o `manual`.
2. **Regenerar (default = completar):** borra solo entradas
   `source = 'ai' AND NOT pinned`; conserva el resto. El prompt recibe una
   sección nueva "Platos ya fijados esta semana (NO los cambies; cuenta con
   ellos para variedad y reglas)" con día, hueco y nombre de cada conservado.
   La validación de reglas (`validateAndPatchRules`) debe contar los
   conservados para los min/max y solo parchear sobre huecos generados.
3. **Rehacer todo:** cuando existan entradas conservables, el botón de generar
   ofrece la alternativa destructiva con confirmación explícita
   (`ResponsiveModal` de confirmación, botón `destructive`). Sin entradas
   conservables, el botón se comporta como hoy.
4. **"Otra idea" por hueco:** en el sheet de edición de una entrada
   (o en hueco con plato IA), botón que pide UN plato alternativo:
   `generateObject` con un schema de un solo plato (subconjunto de
   `menu-schema.ts`), contexto reducido (inventario, recetario de temporada,
   reglas, y la lista de los demás platos de la semana para no repetir).
   Reemplaza la entrada en su misma `position`, `source = 'ai'`. Tras
   reemplazar, ejecutar `cleanupOrphanEphemeralRecipes` (la receta efímera
   anterior queda huérfana).

**Decisiones:**

- No añadir un modo "regenerar solo un día" en v1: el re-roll por hueco cubre
  el 90% del caso con menos UI.
- El re-roll es 1 llamada pequeña a Gemini; aceptable en free tier. Todo lo
  demás de esta tarea es determinista.

**Criterios de aceptación:**

- Semana con 3 platos manuales + 2 IA fijados + 9 IA sueltos → regenerar
  conserva exactamente 5 y rellena el resto; los conservados aparecen en el
  prompt como fijados.
- "Rehacer todo" borra también manuales y fijados, solo tras confirmación.
- Regla "X al menos 2 veces" se cumple contando un fijado que ya sea X
  (no aparece 3 veces).
- "Otra idea" cambia SOLO ese plato; el resto de la semana queda byte a byte
  igual; no quedan recetas efímeras huérfanas.
- Con la semana vacía, el botón de generar no muestra la opción destructiva.

---

## N3 — Perfil de menús del hogar (objetivo, estilo, raciones)

**Objetivo.** Configuración inicial (y editable) de qué quiere el hogar de sus
menús: objetivo cualitativo, estilo de dieta, ingredientes a evitar, nº de
raciones y si se planifica desayuno. La IA lo recibe como sesgo del prompt.

**Valor.** Hoy el prompt decide por el usuario ("saludable y equilibrado").
Esto convierte el generador en SU generador sin reabrir la decisión de "no
macros".

**Migración** (nueva tabla, RLS estándar por hogar; editar `types.ts` a mano):

```sql
create table household_menu_prefs (
  household_id uuid primary key references households (id) on delete cascade,
  goal text not null default 'balanced'
    check (goal in ('balanced', 'light', 'muscle', 'gain')),
  diet_style text not null default 'omnivore'
    check (diet_style in ('omnivore', 'vegetarian', 'vegan', 'gluten_free')),
  avoid_text text,
  servings int not null default 2 check (servings between 1 and 12),
  plan_breakfast boolean not null default false,
  updated_at timestamptz not null default now()
);
```

**Flujo v1:**

1. **Onboarding de 1 pantalla, saltable:** al entrar a `/menus` sin fila de
   prefs, mostrar una card/`ResponsiveModal` "Configura tu menú" (objetivo con
   4 opciones tipo radio-card, estilo de dieta, raciones, toggle desayuno,
   campo "Evitar ingredientes"). "Ahora no" crea la fila con defaults y no
   vuelve a molestar. Nunca bloquear la generación.
2. **Edición posterior:** sección "Preferencias del menú" junto a las reglas
   existentes (`menu-rules.tsx` es la referencia de patrón y ubicación).
3. **Prompt (`menu-prompt.ts`):** mapa determinista `goal → 2–3 frases fijas`
   insertadas como objetivo prioritario tras las reglas obligatorias.
   Ejemplos de tono (redactar con cuidado, sin números):
   - `light`: "Platos saciantes pero ligeros; verdura abundante; técnicas
     sencillas (plancha, horno, vapor); cenas especialmente ligeras."
   - `muscle`: "Cada comida y cena debe incluir una fuente clara de proteína
     (legumbre, huevo, pescado, carne magra o lácteo); raciones generosas."
   - `gain`: "Raciones generosas y platos energéticos y densos; añade
     acompañamientos (pan, arroz, pasta, frutos secos)."
   - `balanced`: el texto actual.
   `diet_style` → frase dura ("TODOS los platos deben ser vegetarianos: sin
   carne ni pescado…"). `avoid_text` → "Evita SIEMPRE estos ingredientes: …".
   `servings` sustituye los dos "2 raciones" hardcodeados
   (`menu-prompt.ts` ~142 y `actions.ts:327`).
4. **Desayuno (`plan_breakfast`):** la BD ya lo admite (check de `meal_slot`
   incluye `'breakfast'`). Si está activo: `SLOTS` en `menu-view.tsx` deja de
   ser constante y se deriva de las prefs (pasarlas desde el Server Component
   de la página), el prompt pide también desayunos (sencillos y repetibles), y
   el schema/validación aceptan el slot extra. Merienda/snack queda FUERA de
   alcance (exigiría alterar el check y densificar el grid).

**Decisiones:**

- Cero números nutricionales en UI, BD y prompt. Si el usuario pide calorías
  o macros, remitir a la decisión de producto (es otro producto).
- El campo se llama **"Evitar ingredientes"** con helper text visible:
  "Es una preferencia para los menús generados, no una garantía frente a
  alergias o intolerancias." Nunca usar la palabra "alergia" como feature.
- Objetivo único por hogar (ver "Qué NO hacer"). Particularidades
  individuales → `avoid_text` o reglas free-text.

**Criterios de aceptación:**

- Hogar sin prefs → generación idéntica a hoy (defaults) y sin errores.
- Con `goal = 'muscle'`, el prompt generado contiene las frases del mapa
  (verificable con un test unitario de `buildMenuPrompt`, que es función pura).
- Con `diet_style = 'vegetarian'`, una generación de prueba no produce carne
  ni pescado (verificación manual documentada en el PR).
- Con `plan_breakfast = true`, el grid muestra 7×3 huecos, "Mover a…" (N1)
  ofrece el hueco de desayuno y la imagen compartible
  (`/api/menus/[menuId]/imagen`) no se rompe.
- El onboarding es saltable, no reaparece tras saltarlo, y funciona AA en
  móvil y escritorio.

---

## N4 — Recetario inicial curado ("Explorar recetas")

**Objetivo.** Eliminar el arranque en frío del recetario con un pack curado de
recetas españolas incluido en el repo, explorable e importable
selectivamente. Sin APIs externas, sin IA en runtime.

**Valor.** "¿Qué hago hoy?" (M6), las reglas (C2), el coste por receta (M7) y
la calidad del menú IA dependen de un recetario poblado. Es el análogo exacto
del catálogo E12, cuya decisión de producto ya está validada: sembrar
infraestructura invisible sí, datos ficticios no — aquí, además, la
importación es **opt-in por receta** (nunca volcado masivo).

**Contenido (parte principal del esfuerzo):**

- Archivo versionado `src/features/recipes/seed/recetas-iniciales.json`
  (formato: `id` estable tipo slug, `name`, `description`, `meal_types`,
  `seasons`, flags `vegetarian`/`vegan`/`gluten_free`, `servings: 2`,
  `ingredients: [{ name, quantity, unit }]`).
- **40–60 recetas de calidad valen más que 100 mediocres.** Cocina española
  real de diario (lentejas, tortilla, gazpacho, merluza al horno, pisto,
  salmorejo, pollo al ajillo…), cubriendo ambas temporadas del sistema
  (`winter`/`summer`), comidas y cenas, y suficientes vegetarianas para que el
  filtro de N3 no quede vacío.
- Los `name` de los ingredientes deben casar por nombre normalizado
  (`src/lib/normalize.ts`) con el catálogo E12
  (`20260721170000_seed_default_products.sql`) siempre que exista el producto:
  redactar los ingredientes MIRANDO esa lista. Puede generarse un borrador del
  JSON con IA una única vez fuera de la app, pero la revisión humana del
  resultado es parte de la tarea.

**Migración** (chica): ampliar el check de `recipes.source` a
`('manual', 'ai', 'seed')` para trazabilidad. Editar `types.ts` a mano.

**Flujo v1:**

1. Sección **"Explorar"** en `/recetas` (pestaña o bloque bajo el recetario;
   en el empty state del recetario, protagonista). Filtros: temporada,
   comida/cena, estilo de dieta. Tarjetas con nombre, descripción corta y
   botón "Añadir a mi recetario".
2. `importSeedRecipeAction(seedId)`: lee la receta del JSON (servidor), inserta
   `recipes` (`is_saved = true`, `source = 'seed'`) + `recipe_ingredients`,
   vinculando `product_id` por nombre normalizado contra el catálogo del hogar
   — **solo matching exacto**, nada de fuzzy aquí (un vínculo equivocado
   contamina lista y stock). Sin match → ingrediente sin `product_id`, como
   los manuales.
3. **Idempotencia:** si el hogar ya tiene una receta guardada con el mismo
   `normalized_name`, la tarjeta muestra "Ya en tu recetario" (botón
   deshabilitado) y la action rechaza el duplicado.
4. **Enganche con N3 (si ya está hecha):** al cerrar el onboarding de
   preferencias, ofrecer un pack filtrado por objetivo/estilo ("¿Añadimos 15
   recetas para empezar?") con importación multi-selección, siempre revisable.

**Decisiones:**

- Las recetas importadas son recetas normales del hogar: editables y
  borrables. El seed del repo es solo la fuente de la copia.
- No sembrar automáticamente al crear el hogar (a diferencia del catálogo):
  un recetario son gustos, no infraestructura. Siempre opt-in.

**Criterios de aceptación:**

- En un hogar nuevo (catálogo E12 recién sembrado), importar 10 recetas deja
  ≥80% de sus ingredientes con `product_id` vinculado.
- Receta importada → aparece en el recetario, se puede usar en reglas, sale en
  "¿Qué hago hoy?" si hay stock, y muestra coste (M7) cuando hay precios.
- Reimportar la misma receta no crea duplicados.
- El filtro "vegetariano" devuelve resultados no vacíos en ambas temporadas.
- Cero llamadas a IA en runtime; `npm run build` no infla el bundle cliente
  con el JSON (importarlo solo en servidor).

---

## N5 — Copiar semana anterior

**Objetivo.** En una semana vacía, botón "Copiar la semana anterior": duplica
sus entradas ajustando fechas. Para hogares con rutina estable es el 80% del
plan hecho en un toque.

**Anclaje.** Reutiliza la lógica de copia de `duplicateMenuEntryAction` (N1) y
`ensureMenu`.

**Alcance v1:**

- Visible solo si la semana visible no tiene entradas y la anterior sí.
- Copia `recipe_id`/`free_text` y hueco; ajusta `date` +7 días; **nunca**
  copia `cooked_at`; escribe `source = 'manual'`, `pinned = false` (si N2 ya
  existe).
- Una sola server action; confirmación no necesaria (la semana está vacía y
  deshacer = borrar platos, ya posible).

**Criterios de aceptación:**

- Semana destino con alguna entrada → el botón no aparece.
- Las recetas vinculadas conservan el vínculo (el coste M7 de la semana nueva
  coincide con la anterior a igualdad de precios).
- Entradas cocinadas de la semana origen llegan sin cocinar.

---

## Orden sugerido de implementación

1. **N1** (mover/duplicar) — sin migración, máximo alivio de fricción diaria.
2. **N2** (regeneración respetuosa) — protege el trabajo que N1 permite;
   decide con el usuario el copy exacto de "Rehacer todo".
3. **N3** (perfil del hogar) — migración chica + prompt; el onboarding deja
   preparado el enganche de N4.
4. **N4** (recetario inicial) — la curación del JSON puede avanzar en paralelo
   a cualquier otra tarea; el código es lo de menos.
5. **N5** (copiar semana) — quick win; puede adelantarse tras N1 si apetece.

Cada mejora termina con: `npm run build` limpio, prueba en viewport móvil
(375px) y escritorio, verificación AA en ambos temas de cualquier UI nueva, y
—si hay migración— `supabase db push` **con autorización previa del usuario**
y `src/lib/supabase/types.ts` actualizado a mano.
