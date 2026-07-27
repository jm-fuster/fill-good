<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Fill Good — App de hogar (inventario + lista + tickets + menús)

PWA mobile-first en **español** enfocada en **ahorrar y comprar con eficiencia** en el hogar (eslogan: *"Compra lo justo, ahorra más"*): inventario, lista de la compra compartida, escaneo de tickets con IA, tendencias de precios y menús semanales. El identificador interno del repo/carpeta sigue siendo `Food`; el nombre de producto es **Fill Good**. Plan de fases completo en `C:\Users\Jorge\.claude\plans\quiero-construir-una-aplicaci-n-fizzy-lollipop.md`.

## Stack

Next.js 16 App Router (Server Components + Server Actions) · Tailwind v4 + shadcn/ui · Supabase (Postgres/Storage/Realtime, RLS por hogar) · Clerk (third-party auth con Supabase) · Vercel AI SDK con Gemini free tier · Serwist (PWA).

## Sistema de diseño — reglas OBLIGATORIAS

Referencia viva en `/styleguide` (`src/app/styleguide/page.tsx`). Tokens en `src/app/globals.css`.

- **Solo tokens semánticos** (`bg-primary`, `text-warning`, `bg-chart-3`…). Prohibido inventar colores, hex o `oklch()` inline en componentes.
- Semántica: `success` = ok/en stock · `warning` = caduca pronto · `destructive` = caducado/eliminar · `chart-1..5` = series de datos (chart-3 = acento cálido de precios).
- **Touch targets ≥ 44px**: los tamaños por defecto de Button/Input ya lo cumplen; `xs`/`sm` solo para contextos densos no táctiles.
- Accesibilidad WCAG 2.2 AA: labels visibles (nunca placeholder-only), `aria-label` en icon buttons, foco visible, contraste AA en ambos temas, `prefers-reduced-motion` respetado.
- **Responsive (E11) — adaptativo, no dos apps.** Un único árbol de componentes; breakpoint del shell `md` (768px). Móvil (`< md`): bottom nav fija con `pb-safe` + FAB + bottom sheets. Escritorio (`≥ md`): sidebar lateral colapsable (`AppSidebar`, Ctrl/Cmd+B) + acciones primarias en el header + diálogos centrados. Bottom nav y sidebar conviven en el árbol y se alternan **solo con CSS** (`md:hidden` / `hidden md:block`), nunca con `useIsMobile` para el shell.
- **Overlays SIEMPRE vía `ResponsiveModal`** (`src/components/ui/responsive-modal.tsx`): bottom sheet (`Drawer`) en `< md`, dialog centrado (`Dialog`) en `≥ md`. Nunca `Drawer`/`Dialog` directos en features.
- **Anchos de página SIEMPRE vía `PageContainer`**; no pongas `max-w-*` a mano en páginas ni en el shell. **Dentro de la app hay un único ancho**: usa `<PageContainer>` sin `variant`, así los márgenes en escritorio no cambian al navegar entre páginas. Las variantes `prose` (legales) y `narrow` (FAQ de la landing) son solo para texto largo fuera de la app.
- Radios: `rounded-lg` controles, `rounded-xl` tarjetas. Idioma UI: español.
- `src/components/ui/*` son de shadcn: `button.tsx` e `input.tsx` llevan ajustes deliberados de touch target — no "resetear" a los defaults de shadcn.

## Convenciones de código

- Datos: lecturas en Server Components, escrituras en Server Actions (`src/features/<feature>/actions.ts`) + `revalidatePath`. Cliente Supabase por-request con token de Clerk (`src/lib/supabase/server.ts`, Fase 1).
- IA: **siempre** vía `getModel('receipts' | 'menus')` de `src/lib/ai/models.ts` — nunca instanciar un provider en una feature. El proveedor/modelo se cambia por env vars.
- Features en `src/features/<nombre>/{components,actions.ts,queries.ts,schemas.ts}`; UI compartida en `src/components/`.
- Migraciones SQL en `supabase/migrations/` vía Supabase CLI; regenerar tipos tras cada migración.
- El usuario no quiere gasto en IA por ahora: mantener Gemini free tier salvo que pida lo contrario.

## Vigilancia de calidad (rendimiento + accesibilidad)

- **Accesibilidad (estática):** `npm run lint` corre ESLint con el preset **`jsx-a11y/strict`** (31 reglas en `error`) y `--max-warnings 0`. Una regresión WCAG rompe el lint. Las supresiones puntuales (patrones WAI-ARIA combobox/radiogroup, reenvío de foco solo-puntero) van con `eslint-disable-next-line` + comentario que justifica el porqué; no añadas supresiones sin justificar. Recuerda: jsx-a11y solo cubre ~30-40% de WCAG — el resto (foco, contraste real en ambos temas) se valida a mano.
- **Bundle base (rendimiento):** `npm run check:bundle` mide el First-Load JS compartido (todo lo que carga cada ruta) contra un presupuesto en `scripts/check-bundle-budget.mjs` (`BUDGET_KB`). Requiere un `next build` previo; `npm run build:check` hace ambos. Sube `BUDGET_KB` solo a conciencia, con una dependencia que lo justifique. Nota: el build de Turbopack **no** expone mapa de chunks por ruta (no hay `app-build-manifest.json`), por eso presupuestamos el baseline compartido, no cada ruta.
