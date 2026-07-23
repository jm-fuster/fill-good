# E11 — Diseño responsive para escritorio/tablet

> **Tarea para un agente de IA.** Lee este documento completo antes de tocar código.
> Lee también `AGENTS.md` (raíz del repo) y la guía de Next.js en
> `node_modules/next/dist/docs/` — este proyecto usa Next.js 16 con cambios que
> pueden diferir de tus datos de entrenamiento.

## Objetivo

Fill Good es una PWA mobile-first. Hoy en escritorio se ve como un móvil
centrado: **toda** la app está encajonada en `max-w-lg` (512 px) con una bottom
nav fija. El objetivo es que en tablet/PC la app tenga un layout propio de
escritorio (navegación lateral, contenido más ancho, diálogos centrados,
grids multi-columna) **sin cambiar en absoluto la experiencia móvil actual**,
que está pulida y es la principal.

Principio rector: **adaptativo, no dos apps**. Un solo árbol de componentes;
las diferencias se resuelven con breakpoints de Tailwind (CSS primero) y, solo
donde es inevitable (modales), con un media query en JS que corre tras la
interacción del usuario (sin riesgo de flash de hidratación).

## Diagnóstico del estado actual (verificado en código)

| Pieza | Archivo | Problema en escritorio |
|---|---|---|
| Shell | `src/components/layout/app-shell.tsx` | `<main>` con `max-w-lg px-4 pb-28` fijo; `pb-28` reserva la bottom nav que en desktop no existirá |
| Navegación | `src/components/layout/bottom-nav.tsx` | Bottom nav fija con 5 tabs y botón central flotante "Escanear"; patrón exclusivamente móvil |
| FAB añadir producto | `src/features/inventory/components/add-product-drawer.tsx:67` | FAB fijo posicionado con la utility `bottom-fab` y wrapper `max-w-lg` acoplado al ancho del shell |
| Barras de acción fijas | `src/features/shopping-list/components/shopping-list-view.tsx:331`, `src/features/receipts/components/receipt-review.tsx:384`, `src/features/inventory/components/expiry-review.tsx:168` | `fixed inset-x-0 bottom-16 … max-w-lg`: acopladas a la altura de la bottom nav (`bottom-16`) y al ancho móvil; en desktop quedarían flotando sobre el viewport, no sobre la columna de contenido |
| Edición | 8 componentes usan `Drawer` (vaul, bottom sheet): `edit-item-drawer`, `add-product-drawer`, `edit-list-item-drawer`, `transfer-ownership-drawer`, `delete-household-drawer`, `menu-view`, `menu-rules`, `recipe-form` | Bottom sheet en pantalla de 27" es mala UX; en desktop la convención es dialog centrado |
| Páginas | Todas las de `src/app/(app)/*` | Cero breakpoints responsive en código de features (verificado con grep: solo los primitivos de `src/components/ui/*` traen alguno) |
| Impresión | `src/app/globals.css` (bloque `@media print`) | Oculta la nav por selector `nav[aria-label="Navegación principal"]`; la nueva navegación de escritorio también deberá ocultarse |
| Tokens | `src/app/globals.css` | Los tokens `--sidebar-*` de shadcn **ya existen** en ambos temas — la base para el sidebar está lista |

No existe `src/hooks/` todavía. `sheet.tsx`, `skeleton.tsx`, `separator.tsx` y
`button.tsx` ya están en `src/components/ui/`; `tooltip.tsx` **no** está.

## Decisión de arquitectura

1. **Breakpoint de shell: `md` (768 px).** Por debajo: exactamente lo de hoy
   (bottom nav + FAB + bottom sheets). Desde `md`: sidebar lateral, sin bottom
   nav, sin FAB, diálogos centrados. Un único punto de corte para el shell
   evita estados intermedios raros; dentro del contenido sí se usan `lg`/`xl`
   para densidad (grids).
2. **Navegación desktop: componente `Sidebar` oficial de shadcn**
   (`npx shadcn@latest add sidebar`), con `collapsible="icon"` y
   `SidebarProvider` + `SidebarInset` en el shell. Razones: los tokens ya están
   en `globals.css`, trae accesibilidad resuelta (teclado, `aria`, atajo
   Ctrl/Cmd+B, tooltips en modo icono) y persistencia del estado en cookie.
3. **La bottom nav y el sidebar coexisten en el árbol** y se muestran/ocultan
   **solo con CSS** (`md:hidden` / `hidden md:block`). Nada de `useIsMobile`
   para el shell: `display:none` saca al elemento oculto del árbol de
   accesibilidad, así que nunca hay dos navegaciones activas a la vez ni flash
   de hidratación.
4. **Modales adaptativos:** un wrapper `ResponsiveModal` que renderiza `Drawer`
   (vaul) en `< md` y `Dialog` en `≥ md`, con la misma API de subcomponentes.
   Aquí sí se usa un hook `useMediaQuery` en JS: los modales solo se abren tras
   una interacción (post-hidratación), por lo que no hay mismatch SSR.
5. **Anchos de contenido por tipo de página** mediante un componente
   `PageContainer` con 3 variantes (ver Fase 2), en lugar de un ancho global.

## Reglas innegociables (de `AGENTS.md`, aplican a TODO lo nuevo)

- Solo tokens semánticos (`bg-primary`, `text-warning`, `bg-sidebar`…). Nada de
  hex/`oklch()` inline en componentes.
- WCAG 2.2 AA: labels visibles, `aria-label` en icon buttons, foco visible,
  contraste AA en ambos temas, `prefers-reduced-motion` respetado.
- Touch targets ≥ 44 px se mantienen también en desktop (la app se usará en
  tablets táctiles). **No reducir densidad de controles.**
- `src/components/ui/button.tsx` e `input.tsx` llevan ajustes deliberados de
  touch target: **si el CLI de shadcn pregunta por sobrescribirlos al instalar
  `sidebar`, responde NO** (instala solo `sidebar`, `tooltip` y
  `use-mobile`/hooks que falten).
- Idioma de la UI: español. Radios: `rounded-lg` controles, `rounded-xl`
  tarjetas.
- Verifica cada fase en el navegador (preview) antes de pasar a la siguiente.

---

## Fase 1 — Shell adaptativo

**Archivos:** `app-shell.tsx`, `bottom-nav.tsx`, nuevo
`src/components/layout/app-sidebar.tsx`, `globals.css`, `src/app/(app)/layout.tsx`.

1. Instala el bloque sidebar de shadcn (ver advertencia arriba). Verifica que
   el contenedor desktop del componente `Sidebar` lleva `hidden md:block` (es
   el default de shadcn): así CSS decide, no JS.
2. Crea `AppSidebar` con las **mismas 5 entradas** de `bottom-nav.tsx`
   (Inventario, Lista, Escanear, Menús, Ajustes — mismos iconos lucide, misma
   lógica de activo incluyendo `matchPrefixes: ["/recetas"]` para Menús).
   Cabecera del sidebar: marca "Fill Good" (hay assets en `public/brand/`).
   Usa `SidebarMenuButton` con `isActive` y `aria-current="page"`. "Escanear"
   es una entrada más del menú (el botón central flotante es un patrón solo
   móvil); puedes destacarla visualmente con el token `sidebar-primary`.
3. En `AppShell`: envuelve en `SidebarProvider`; `AppSidebar` + `SidebarInset`;
   dentro del inset un header sticky solo-desktop (`hidden md:flex`) con
   `SidebarTrigger` (con `aria-label`). Añade a `BottomNav` la clase
   `md:hidden` en el `<nav>`.
4. Padding del main: `pb-28` solo móvil → `pb-28 md:pb-8`; `px-4 md:px-8`.
   El ancho pasa a gestionarlo `PageContainer` (Fase 2).
5. **Skip link**: añade como primer elemento focusable del shell un enlace
   "Saltar al contenido" que apunte a `<main id="contenido">`, visualmente
   oculto salvo con foco (patrón `sr-only focus:not-sr-only …`). Beneficia a
   todos los formatos.
6. Impresión: en `globals.css` el bloque `@media print` debe ocultar también el
   sidebar y el header del inset (añade selectores o usa `print:hidden`).
7. Solo debe existir **una** región con `aria-label="Navegación principal"`
   visible a la vez (la otra queda `display:none`). Etiqueta ambas igual.

**Criterio:** a 375 px la app es pixel-perfect idéntica a hoy; a ≥ 768 px hay
sidebar colapsable, no hay bottom nav, Ctrl/Cmd+B funciona, y el estado
colapsado persiste al recargar.

## Fase 2 — Contenedores de contenido

**Archivos:** nuevo `src/components/layout/page-container.tsx`, todas las
páginas de `src/app/(app)/*`, `src/app/styleguide/page.tsx`.

1. Crea `PageContainer` con variantes:
   - `narrow` — flujos enfocados y formularios: `max-w-lg` siempre
     (escanear, onboarding-like, revision de caducidades).
   - `default` — listas 1 columna legibles: `max-w-lg md:max-w-2xl`
     (lista de la compra, ajustes, precios overview, revisar ticket).
   - `wide` — grids y datos: `max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl`
     (inventario, menús, recetas, precios detalle).
   Siempre `mx-auto w-full`.
2. Aplica la variante en cada página (el `<main>` del shell deja de imponer
   `max-w-lg`). No muevas lógica: solo envuelve.
3. `PageHeader` no cambia de API; comprueba que respira bien en anchos grandes
   (el `action` seguirá usándose en Fase 4).

**Criterio:** ninguna página "flota" en un pasillo de 512 px en desktop; los
formularios no se estiran a línea completa (legibilidad ~65–75 caracteres).

## Fase 3 — Modales adaptativos (Drawer ↔ Dialog)

**Archivos:** nuevos `src/hooks/use-media-query.ts` y
`src/components/ui/responsive-modal.tsx`; los 8 componentes con `Drawer`.

1. `useMediaQuery(query)`: `matchMedia` + suscripción; valor inicial `false`
   en SSR. Documenta en el archivo que solo debe usarse para UI
   post-interacción.
2. `ResponsiveModal` expone: Root, `Trigger`, `Content`, `Header`, `Title`,
   `Description`, `Footer`, `Close`. Con `min-width: 768px` mapea a `Dialog*`;
   si no, a `Drawer*`. Mantén las props que hoy se usan en los drawers
   (`open`, `onOpenChange`, `repositionInputs`… — las exclusivas de vaul se
   ignoran en la rama Dialog).
3. Migra los 8 usos. Atención a los wrappers internos
   `mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto` que
   hoy centran el contenido dentro del sheet: en la rama Dialog el ancho lo da
   `DialogContent` (usa `sm:max-w-md` o `sm:max-w-lg` según el formulario).
4. Los flujos complejos (`menu-view.tsx`, `menu-rules.tsx`,
   `recipe-form.tsx`) tienen varios drawers anidados en su lógica: migra uno a
   uno y prueba cada flujo completo (generar menú, editar regla, añadir
   ingrediente a receta) en móvil Y desktop.
5. Confirmaciones destructivas (`delete-household-drawer`,
   `transfer-ownership-drawer`): en desktop el foco inicial debe caer en la
   acción **segura** (Cancelar), nunca en la destructiva. Radix Dialog enfoca
   el primer focusable: ordena o usa `onOpenAutoFocus`.

**Criterio:** en móvil todo sigue siendo bottom sheet (regla de AGENTS.md); en
desktop todo es dialog centrado con overlay, cierre con Escape, foco atrapado
y devuelto al trigger al cerrar.

## Fase 4 — FAB y barras de acción fijas

**Archivos:** `add-product-drawer.tsx`, `shopping-list-view.tsx`,
`receipt-review.tsx`, `expiry-review.tsx`, `src/app/(app)/inventario/page.tsx`.

1. **FAB "añadir producto"**: el wrapper fijo (línea ~67) pasa a `md:hidden`.
   En desktop el trigger vive en el `action` del `PageHeader` de Inventario
   como `<Button>` con icono `Plus` y texto "Añadir producto"
   (`hidden md:inline-flex`), junto al botón "Ver precios" existente. Ambos
   triggers abren el **mismo** `ResponsiveModal` (un solo estado `open`).
2. **Barras fijas** (checkout de lista, confirmar ticket, guardar revisión):
   en móvil quedan como están (`fixed … bottom-16 … max-w-lg`). En `md+`
   pásalas a `md:sticky md:bottom-0 md:inset-x-auto md:max-w-none md:px-0`
   dentro de la columna de contenido, con fondo `bg-background/95
   backdrop-blur-sm` y borde superior para que no se mezclen con la lista al
   hacer scroll. Motivo: `bottom-16` compensa una bottom nav que ya no existe
   y `fixed` centra respecto al viewport, no respecto al contenido desplazado
   por el sidebar.
3. Revisa `pb-fab` (`inventory-list.tsx:119`): en desktop no hay FAB, así que
   `md:pb-0` (o equivalente) para no dejar un hueco fantasma.

**Criterio:** ninguna acción primaria tapa contenido ni queda descentrada en
ningún ancho; en desktop los botones de acción están donde el usuario de
escritorio los espera (header o final del flujo, sticky).

## Fase 5 — Adaptación por página

Aplica grids solo donde aportan; ante la duda, una columna legible gana.

- **Inventario** (`inventory-list.tsx`): mantiene grupos por ubicación
  (fijados / despensa / nevera / congelador). Dentro de cada grupo, las
  tarjetas pasan a `md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3`. La
  búsqueda con label + chips de estado se quedan arriba a ancho completo
  (los chips con scroll horizontal `-mx-4 px-4` ya no necesitan sangrar en
  desktop: `md:mx-0 md:px-0 md:flex-wrap`).
- **Lista de la compra**: 1 columna `default`. No convertir en grid: es una
  checklist ordenada por pasillo/categoría y el orden visual importa.
- **Menús** (`menu-view.tsx:220-241`): hoy cada día es `grid-cols-2`
  (comida/cena). En desktop muestra la semana en paralelo:
  `lg:grid-cols-2 xl:grid-cols-3` a nivel de tarjetas de día (7 columnas no
  caben con contenido legible; verifica visualmente antes de fijar).
  La vista de impresión no debe cambiar.
- **Recetas** (`/recetas`): grid de tarjetas `md:grid-cols-2 lg:grid-cols-3`.
  El formulario de receta se queda `narrow`/`default`.
- **Precios** (`/precios`): la lista de filas enlazadas escala bien a 1
  columna `default`; opcionalmente `lg:grid-cols-2`. **Detalle**
  (`/precios/[productId]`): contenedor `wide`; el chart de recharts crece con
  el ancho (comprueba que usa contenedor responsive y que los ejes/leyenda
  siguen legibles en oscuro).
- **Escanear**: `narrow` centrado (subir foto/cámara es un flujo enfocado).
  **Revisar ticket**: `default`, con su barra de confirmación según Fase 4.
- **Ajustes**: `default`; los bloques (hogar, miembros, aliases, tema) pueden
  ir en `md:grid-cols-2` si quedan equilibrados; si no, 1 columna.
- **Páginas fuera del shell** (`onboarding`, `unirse/[code]`, `offline`,
  sign-in/up): ya están centradas con `max-w-md`; solo revisa que a 1440 px no
  haya nada raro (fondos, logos).

**Criterio:** cada página aprovecha el ancho sin sacrificar legibilidad;
ninguna fila de tarjeta se estira a > ~40rem de ancho de lectura.

## Fase 6 — Styleguide y documentación

1. Añade a `/styleguide` (`src/app/styleguide/page.tsx`) una sección
   "Responsive" que documente: breakpoint de shell (`md`), las 3 variantes de
   `PageContainer`, el patrón `ResponsiveModal` y el mapeo FAB→header. El
   propio styleguide debe dejar de ser `max-w-lg` (usa `wide`).
2. Actualiza `AGENTS.md`, sección de diseño, con las nuevas reglas:
   - "Móvil (< md): bottom nav + FAB + bottom sheets. Desktop (≥ md): sidebar
     + acciones en header + dialogs centrados. Overlays SIEMPRE vía
     `ResponsiveModal`, nunca `Drawer`/`Dialog` directos en features."
   - "Anchos de página SIEMPRE vía `PageContainer` (narrow/default/wide)."

## Fase 7 — Verificación (obligatoria antes de dar por cerrado)

Con el dev server y el navegador embebido:

1. **Anchos**: 375, 768, 1024 y 1440 px en las 8 rutas principales
   (`/inventario`, `/lista`, `/escanear`, `/escanear/[id]/revisar`, `/precios`,
   `/precios/[id]`, `/menus`, `/recetas`, `/ajustes`). Captura de pantalla de
   cada una en 375 y 1440.
2. **Móvil intacto**: diff visual mental a 375 px contra la versión actual —
   no debe cambiar nada.
3. **Teclado**: recorrido completo con Tab en desktop: skip link → sidebar →
   contenido; foco visible siempre; Escape cierra dialogs y devuelve el foco
   al trigger; Ctrl/Cmd+B alterna el sidebar.
4. **Temas**: light y dark en 768 y 1440 (tokens `sidebar-*` ya definidos,
   pero verifica contraste real del item activo).
5. **Reduced motion**: con `prefers-reduced-motion` las transiciones del
   sidebar/dialogs no animan (ya hay regla global; confirma que shadcn no la
   puentea).
6. **Impresión**: vista previa de imprimir en `/menus` — sin sidebar, sin
   header, sin navegación.
7. **Consola limpia**: sin errores de hidratación en ninguna ruta (el punto
   3 de la Fase 1 existe precisamente para evitarlos).
8. `npm run lint` y `npm run build` en verde.

## Fuera de alcance (NO hacer)

- Rediseñar componentes, colores o tipografía; cambiar flujo o copy alguno.
- Atajos de teclado nuevos más allá del Ctrl/Cmd+B que trae el sidebar.
- Densidad "compacta" de escritorio (los touch targets se quedan a 44 px).
- Tocar Server Actions, queries, esquema o cualquier lógica de datos.
- Virtualización de listas u optimizaciones de rendimiento.

## Orden de commits sugerido

Un commit por fase, en español, prefijo `feat: E11 — …` (sigue el estilo del
historial: `git log --oneline`). Si una fase rompe algo de otra, arregla antes
de avanzar; no acumules deuda entre fases.
