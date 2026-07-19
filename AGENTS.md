<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Food — App de hogar (inventario + lista + tickets + menús)

PWA mobile-first en **español** para gestionar el hogar: inventario, lista de la compra compartida, escaneo de tickets con IA, tendencias de precios y menús semanales. Plan de fases completo en `C:\Users\Jorge\.claude\plans\quiero-construir-una-aplicaci-n-fizzy-lollipop.md`.

## Stack

Next.js 16 App Router (Server Components + Server Actions) · Tailwind v4 + shadcn/ui · Supabase (Postgres/Storage/Realtime, RLS por hogar) · Clerk (third-party auth con Supabase) · Vercel AI SDK con Gemini free tier · Serwist (PWA).

## Sistema de diseño — reglas OBLIGATORIAS

Referencia viva en `/styleguide` (`src/app/styleguide/page.tsx`). Tokens en `src/app/globals.css`.

- **Solo tokens semánticos** (`bg-primary`, `text-warning`, `bg-chart-3`…). Prohibido inventar colores, hex o `oklch()` inline en componentes.
- Semántica: `success` = ok/en stock · `warning` = caduca pronto · `destructive` = caducado/eliminar · `chart-1..5` = series de datos (chart-3 = acento cálido de precios).
- **Touch targets ≥ 44px**: los tamaños por defecto de Button/Input ya lo cumplen; `xs`/`sm` solo para contextos densos no táctiles.
- Accesibilidad WCAG 2.2 AA: labels visibles (nunca placeholder-only), `aria-label` en icon buttons, foco visible, contraste AA en ambos temas, `prefers-reduced-motion` respetado.
- Móvil: edición en bottom sheets (`Drawer` de vaul), no dialogs centrados; bottom nav fija con `pb-safe`.
- Radios: `rounded-lg` controles, `rounded-xl` tarjetas. Idioma UI: español.
- `src/components/ui/*` son de shadcn: `button.tsx` e `input.tsx` llevan ajustes deliberados de touch target — no "resetear" a los defaults de shadcn.

## Convenciones de código

- Datos: lecturas en Server Components, escrituras en Server Actions (`src/features/<feature>/actions.ts`) + `revalidatePath`. Cliente Supabase por-request con token de Clerk (`src/lib/supabase/server.ts`, Fase 1).
- IA: **siempre** vía `getModel('receipts' | 'menus')` de `src/lib/ai/models.ts` — nunca instanciar un provider en una feature. El proveedor/modelo se cambia por env vars.
- Features en `src/features/<nombre>/{components,actions.ts,queries.ts,schemas.ts}`; UI compartida en `src/components/`.
- Migraciones SQL en `supabase/migrations/` vía Supabase CLI; regenerar tipos tras cada migración.
- El usuario no quiere gasto en IA por ahora: mantener Gemini free tier salvo que pida lo contrario.
