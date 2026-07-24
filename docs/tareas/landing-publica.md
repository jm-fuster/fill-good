# Landing pública de Fill Good (`/` sin sesión)

> Especificación para el agente que la implemente. Léela entera antes de escribir código.
> Regla previa del repo: **lee la guía relevante en `node_modules/next/dist/docs/` antes de tocar nada** (Next 16 tiene breaking changes; p. ej. el middleware vive en `src/proxy.ts`).

## 1. Problema y objetivo

Hoy, un visitante anónimo que entra en `fillgood.jorgemolinafuster.com`:

1. `src/app/page.tsx` hace `redirect("/inventario")`.
2. `/inventario` no es ruta pública → `auth.protect()` en `src/proxy.ts` lo manda a `/sign-in`.
3. Aterriza en el widget de Clerk centrado en una página en blanco, sin saber qué es Fill Good.

**Objetivo:** que `/` sea una landing pública con estilo de marca que explique el producto y sus ventajas, con CTA de crear cuenta / iniciar sesión. Los usuarios con sesión siguen yendo directos a `/inventario` sin ver la landing.

## 2. Lectura de diseño (design read)

**Lectura:** landing de producto de consumo (app de hogar para ahorrar) para familias/parejas en España, con lenguaje fresco y de confianza, apoyada 100 % en el sistema de diseño existente de Fill Good (tokens Tailwind v4 + primitivas shadcn + Geist), con movimiento contenido CSS-first.

**Diales:** `DESIGN_VARIANCE: 6` (asimetría con intención, nada caótico: hablamos de dinero y comida, la confianza manda) · `MOTION_INTENSITY: 4` (entradas CSS + hover táctil; sin librería de animación) · `VISUAL_DENSITY: 3` (aireado, marketing).

**Modo:** greenfield para la superficie, pero **preserve** para la marca: los tokens, la tipografía y el tono ya existen y son obligatorios. No se inventa nada visual nuevo.

## 3. Restricciones no negociables del repo

- **Solo tokens semánticos** (`bg-primary`, `text-warning`, `bg-chart-3`, `bg-muted`…). Prohibido cualquier hex/oklch inline. El verde de marca ya es `--primary`; el acento cálido de precios es `chart-3`.
- **Tipografía:** Geist Sans (`font-sans`) ya cableada vía `next/font` en el layout raíz. `font-mono` (Geist Mono) solo para cifras/precios si hace falta. No añadir fuentes.
- **Iconos:** `lucide-react` (la familia del proyecto; no mezclar otras, no dibujar SVG de iconos a mano).
- **Tema:** la landing debe funcionar en claro y oscuro (ThemeProvider con `system` ya activo). Con tokens sale gratis; no fijar tema.
- **Touch targets ≥ 44 px:** los tamaños por defecto de `Button` ya lo cumplen (`default` h-11, `lg` h-12). No usar `xs`/`sm` en la landing.
- **No tocar** `src/components/ui/button.tsx` ni `input.tsx` (ajustes deliberados). No hace falta añadir componentes shadcn nuevos (el FAQ va con `<details>` nativo, ver §7.6).
- **Anchos:** el contenido interno de cada sección usa `PageContainer variant="wide"` (`src/components/layout/page-container.tsx`) dentro de bandas full-bleed (`<section class="w-full …">`). Así se respeta la regla "anchos siempre vía PageContainer" y a la vez hay fondos a sangre completa. La sección FAQ usa `narrow`.
- **Idioma:** español de España. `npm run lint` corre jsx-a11y strict con `--max-warnings 0`: la landing debe pasar limpio.
- **Sin dependencias nuevas.** Nada de framer-motion/GSAP: `tw-animate-css` ya está instalado y basta. El presupuesto de bundle (`npm run check:bundle`) mide el baseline compartido; no añadas nada global.

## 4. Arquitectura técnica

### 4.1 Routing y auth

- `src/proxy.ts`: añadir `"/"` al `createRouteMatcher` de rutas públicas (matchea solo la raíz exacta):

```ts
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/offline",
  "/api/push/caducidades",
]);
```

- `src/app/page.tsx`: pasa a ser el punto de bifurcación (Server Component):

```tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
// … importar las secciones de la landing

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/inventario");
  return <LandingPage />;
}
```

- Los CTAs enlazan con `<Link href="/sign-up">` y `<Link href="/sign-in">` (las páginas de Clerk ya existen). Usa `Button asChild` para que el enlace tenga aspecto de botón.

### 4.2 PWA y SEO (efectos colaterales, ya decididos)

- **`manifest.ts` no se toca.** `start_url: "/"` sigue valiendo: la app instalada de un usuario logueado pasa por `/` y el servidor la redirige a `/inventario` (coste: un redirect servidor, aceptable). `id: "/"` preserva la identidad de la PWA.
- **SEO:** `/` pasa de responder 307→sign-in a un 200 con contenido real. La metadata por defecto del layout raíz ("Fill Good — Compra lo justo, ahorra más" + descripción) ya sirve; no dupliques metadata en la página.
- **Serwist:** nada que hacer; la landing es una página más para el `defaultCache`.
- La página es dinámica (lee `auth()`); no intentes hacerla estática.

### 4.3 Archivos a crear

```
src/features/landing/components/
  landing-page.tsx        // composición de secciones (Server Component)
  landing-nav.tsx         // header sticky
  landing-hero.tsx
  hero-preview.tsx        // marco de móvil + mini-inventario real de demo
  landing-how-it-works.tsx
  landing-bento.tsx
  price-spotlight.tsx     // sección de ahorro con sparkline SVG servidor
  landing-faq.tsx         // <details>/<summary> estilizados
  landing-cta.tsx         // banda final bg-primary
  landing-footer.tsx
  reveal.tsx              // ÚNICO client component ('use client'), opcional, ver §8
```

La feature no tiene `actions.ts` ni `queries.ts`: es solo presentación. Todo Server Components salvo `reveal.tsx`.

## 5. Estrategia de visuales (importante: sin slop)

No hay capturas de pantalla disponibles en build y **está prohibido** fabricar "capturas falsas" con divs que imiten otro producto. Pero este repo ES el producto: la opción honesta y robusta es renderizar **previews vivas compuestas con las primitivas reales de la app** (`Card`, `Badge`, `Checkbox`, `ProductIcon` de `src/components/product-icon.tsx`…), con datos de ejemplo marcados con comentario `// datos de ejemplo` en el código. Ventajas: pixel-perfect con la marca, tema claro/oscuro gratis, cero pipeline de assets, LCP de texto (instantáneo).

- **No uses `recharts` en la landing** (pesado). El sparkline de precios es un `<svg>` renderizado en servidor a partir de un array de datos de ejemplo (es un gráfico con datos mock etiquetados, no un icono decorativo dibujado a mano).
- Cifras visibles de ejemplo: plausibles y discretas ("1,89 €", "caduca en 2 días"). **Prohibido** inventar métricas de marketing ("ahorra un 30 %", "10.000 hogares"): no existen datos que las respalden.
- Si más adelante Jorge aporta capturas reales, viven en `public/landing/` y sustituyen el contenido del marco del hero vía `next/image` (mismo marco, otro relleno). Deja el marco preparado para ello, pero **la v1 sale con previews vivas**, sin bloquearse por assets.
- El logo existe: `public/brand/fillgood-logo.svg` (cuadrado verde `#127A4E` con hoja blanca y círculo amarillo). Úsalo como `<Image>`/`<img>`; el wordmark es texto "Fill Good" en `font-semibold` al lado. No redibujar el logo.

## 6. Copy definitivo (usar tal cual, no improvisar)

Registro único: cercano, directo, verbos concretos (escanea, apunta, comparte, ahorra). Nada de "revoluciona", "eleva", "sin esfuerzo". **Cero rayas (`—`/`–`) en cualquier texto visible**: usa coma, punto, dos puntos o paréntesis (en español la tentación del inciso con raya es alta; resístela).

Los textos exactos van en §7. Si algo no cabe o suena mal al maquetar, se acorta, nunca se adorna.

## 7. Estructura de la página, sección a sección

8 bloques, 6 de contenido. Familias de layout todas distintas: split asimétrico / flujo horizontal / bento / banda split invertida / FAQ / banda centrada. **Cero eyebrows** (etiquetas uppercase con tracking sobre títulos): los H2 se bastan solos. Un solo `h1` (hero); el resto `h2` (+ `h3` en celdas/pasos).

Ritmo vertical: secciones `py-16 md:py-24`; hero algo más alto pero con `pt` máximo `pt-24` en desktop.

### 7.1 Nav (header sticky)

- `h-16`, `sticky top-0 z-40`, `bg-background/85 backdrop-blur border-b border-border`. Una sola línea siempre.
- Izquierda: logo (32 px) + "Fill Good" (`font-semibold`).
- Derecha desktop (`md:`): `Button variant="ghost"` → "Iniciar sesión" y `Button` (default) → "Crear cuenta gratis".
- Derecha móvil: **solo** "Iniciar sesión" (ghost). El usuario nuevo tiene el CTA primario en el hero a un pulgar de distancia; el recurrente necesita entrar rápido. Sin menú hamburguesa: no hay más navegación.

### 7.2 Hero (split asimétrico)

- Grid `lg:grid-cols-12`: copy en `lg:col-span-7`, visual en `lg:col-span-5`. En móvil: columna única, copy primero, el marco del móvil asoma debajo (eso ya invita a hacer scroll: **prohibido** poner texto "scroll" o flechas).
- Pila del hero (máximo 4 elementos, sin eyebrow, sin micro-tagline bajo los CTAs):
  - `h1`: **"Compra lo justo, ahorra más"** (`text-4xl md:text-5xl lg:text-6xl tracking-tight`, máx. 2 líneas).
  - Sub (≤ 20 palabras, `text-muted-foreground text-lg max-w-[46ch]`): **"La despensa, la lista de la compra y los precios de tu súper, compartidos con toda tu casa."**
  - CTAs: `Button size="lg"` → **"Crear cuenta gratis"** + `Button size="lg" variant="outline"` → **"Iniciar sesión"**. En fila en `sm:`, apilados a ancho completo en móvil. Ningún label puede partirse en 2 líneas en desktop.
- Visual (`hero-preview.tsx`): marco de móvil hecho con CSS (`rounded-3xl border border-border bg-card shadow-lg p-2`, interior `rounded-2xl bg-background`, `max-w-[320px]`, aspecto ~9/19). Dentro, mini-pantalla "Despensa" real: 4 filas de producto (`ProductIcon` + nombre + `Badge`) mostrando el semáforo de la app: `success` ("En stock"), `warning` ("Caduca en 2 días"), `destructive` ("Caducado"). En `lg:` el marco va ligeramente rotado/desplazado (p. ej. `lg:rotate-2 lg:translate-y-4`) para el punto de asimetría; en móvil, recto.
- Opcional (solo `lg:`): una tarjeta flotante `absolute` estilo notificación junto al marco: icono `Bell` + "El yogur caduca pronto" sobre `bg-card border shadow-sm`. Máximo una. Nada de pills superpuestas con etiquetas tipo "App · 01".

### 7.3 Cómo funciona (flujo de 3 pasos)

- `h2`: **"Del ticket a la despensa, en un minuto"**.
- 3 pasos **sin** "Paso 1/2/3" (prohibido): el contenido es la etiqueta. Desktop: 3 columnas conectadas por una hairline (`border-t border-border` decorativa entre iconos o un separador con `ChevronRight`); móvil: lista vertical con el icono a la izquierda. Sin tarjetas: espacio y tipografía (los iconos en un contenedor `size-12 rounded-lg bg-secondary text-secondary-foreground`).
  1. `ScanLine` · **"Escanea el ticket"** · "Haz una foto al salir del súper. La IA la convierte en productos con sus precios."
  2. `Refrigerator` (o `Package`) · **"Tu despensa se actualiza sola"** · "El inventario refleja lo que hay en casa y avisa de lo que caduca."
  3. `ShoppingCart` · **"Compra solo lo que falta"** · "La lista compartida se rellena con lo que se agota. Sin duplicados ni olvidos."

### 7.4 Bento de características (6 celdas exactas)

- `h2`: **"Todo lo de casa, en una sola app"**.
- Grid asimétrico `md:grid-cols-4` con ritmo (nada de 6 tarjetas iguales): 1 celda grande `md:col-span-2 md:row-span-2`, 1 celda ancha `md:col-span-2`, 4 celdas 1×1. En móvil todo apilado a 1 columna. Celdas `rounded-xl border border-border p-6`; **diversidad de fondos obligatoria**: la grande con preview viva sobre `bg-card`, dos con tinte (`bg-secondary`, `bg-accent`), el resto `bg-card`. Nunca 6 celdas blancas solo-texto.
  1. **Grande · "Caducidades a la vista"** — "El semáforo te dice qué va justo de fecha antes de que se tire." + preview viva: 3 filas con `Badge` success/warning/destructive (puede reusar el patrón del hero con otros productos).
  2. **Ancha · "Precios súper a súper"** — "Fill Good recuerda lo que pagaste en cada súper y te enseña dónde te sale mejor." + chips de cadenas con tokens `chart-1/2/3` y precios de ejemplo (`font-mono`). Acento cálido `chart-3` aquí y solo aquí.
  3. **"Lista compartida en tiempo real"** — "Lo que apunta uno lo ve toda la casa, al momento." + mini-fila con `Checkbox` marcado.
  4. **"Tickets leídos por IA"** — "Foto o PDF: los productos, cantidades y precios se apuntan solos." Icono `Sparkles` o `ReceiptText`.
  5. **"Del menú semanal a la lista"** — "Planifica la semana y añade sus ingredientes a la lista en un toque." Icono `CalendarDays`.
  6. **"Instálala como app"** — "En tu móvil, con avisos de caducidad. Sin pasar por ninguna tienda de apps." Icono `BellRing` o `Smartphone`.
- Sin puntos decorativos de color, sin numeración de celdas, sin etiquetas superpuestas.

### 7.5 Spotlight de ahorro (banda split, invertida respecto al hero)

- Banda full-bleed `bg-muted` (mismo tema, solo tinte; **no** invertir claro/oscuro a mitad de página).
- `h2`: **"Tus tickets se convierten en tu historial de precios"**.
- Body (≤ 25 palabras): **"Cada ticket guarda lo que pagaste y dónde. Fill Good compara tus súpers y te avisa cuando algo sube."**
- Split 2 columnas en `lg:` con el visual a la IZQUIERDA y el texto a la derecha (invertido respecto al hero; con este son 2 splits en la página, el máximo permitido). Visual: `price-spotlight.tsx` con un sparkline SVG servidor (línea de precio de un producto de ejemplo, trazo `stroke-chart-3`, ejes implícitos, `aria-hidden` + texto alternativo cercano) y debajo 2-3 filas "cadena → precio" (`font-mono`), p. ej. "Aceite de oliva 1 L" en tres súpers con el más barato en `text-success font-medium`. **Prohibidas** barras de progreso con track de fondo como comparación.
- CTA no: esta sección no lleva botón (la intención "registro" ya tiene su label y sus dos ubicaciones; no multiplicar).

### 7.6 FAQ (contenedor `narrow`)

- `h2`: **"Preguntas frecuentes"**.
- `<details>`/`<summary>` nativos estilizados con tokens (`rounded-lg border border-border`, `summary` con `min-h-11`, icono `ChevronDown` rotando con `group-open:`): accesible de serie, cero JS, cero dependencias nuevas. `divide-y` o `space-y-3`; sin doble borde arriba+abajo por fila.
- Contenido (honesto, sin promesas que la app no cumpla):
  1. **¿Cuánto cuesta?** → "Nada. Fill Good es gratis."
  2. **¿Funciona con mi supermercado?** → "Sí. La IA lee el ticket (foto o PDF) de cualquier súper; no depende de integraciones."
  3. **¿Tengo que instalar algo?** → "No. Funciona en el navegador y, si quieres, la instalas como app en tu móvil."
  4. **¿Quién ve mis datos?** → "Solo tu hogar. Invitas a los tuyos con un código y nadie más ve vuestra despensa ni vuestros precios."
  5. **¿Cuántas personas pueden usarla?** → "Toda la casa: misma despensa, misma lista y mismos precios para todos los miembros."

### 7.7 CTA final (banda centrada)

- Banda full-bleed `bg-primary text-primary-foreground` (el único bloque de color saturado de la página; centrado está justificado: es el cierre).
- `h2`: **"Empieza hoy con tu casa"** + una línea: **"Crea tu hogar, invita a los tuyos y comprad con cabeza."**
- `Button size="lg" variant="secondary"` → **"Crear cuenta gratis"** (mismo label exacto que en nav/hero: una intención, un label). `variant="secondary"` contrasta bien sobre `bg-primary` en ambos temas sin inventar estilos.

### 7.8 Footer

- Mínimo: logo pequeño + "Fill Good" + la línea "Compra lo justo, ahorra más." + enlaces "Iniciar sesión" / "Crear cuenta gratis" (`variant="link"` o anchors con `text-muted-foreground hover:text-foreground`) + `© {año actual} Fill Good`.
- **Prohibido:** versión de build, strips de ciudad/hora/clima, redes sociales inventadas, enlaces legales a páginas que no existen.

## 8. Movimiento (CSS-first, MOTION 4)

- **Entrada del hero:** cascada con `tw-animate-css` (`animate-in fade-in slide-in-from-bottom-4`) y `animation-delay` escalonado (0/75/150 ms) en h1, sub, CTAs y marco. Solo `transform`/`opacity`.
- **Reveals al hacer scroll (opcional, único JS):** `reveal.tsx` con `'use client'` + `IntersectionObserver` que añade una clase al entrar en viewport. Regla de seguridad: **el estado por defecto (sin JS) es visible**; el componente aplica el estado oculto solo al montar. Nada de `window.addEventListener("scroll")`. Si complica, elimínalo: la página funciona igual sin reveals.
- **Hover/tacto:** los botones ya traen estados; en celdas del bento, como mucho `transition-shadow hover:shadow-md`. En `:active` de CTAs, `active:scale-[0.98]`.
- **Reduced motion:** `globals.css` ya anula animaciones y transiciones globalmente con `prefers-reduced-motion: reduce`; no lo puentees con estilos inline.
- Prohibido: parallax, marquees, glows, gradientes animados, cursores custom, loops infinitos.

## 9. Accesibilidad (el lint la vigila, pero no toda)

- Landmarks: `<header>`, `<main>`, `<footer>`; nav con `aria-label` propio (distinto de "Navegación principal", que la app usa para la bottom nav y el CSS de impresión lo oculta por ese selector).
- Un solo `h1`; jerarquía h2/h3 sin saltos.
- El sparkline SVG: `aria-hidden="true"` y la información en texto adyacente (las filas de precios).
- Imágenes: `alt` real en el logo ("Fill Good"); previews decorativas con `aria-hidden` si duplican el texto.
- Contraste: cubierto por tokens (verificados AA en ambos temas), pero revisa a mano el par `variant="secondary"` sobre `bg-primary` en claro y oscuro.
- Foco visible: ya global vía `globals.css`; no lo elimines en `summary` ni enlaces.

## 10. Rendimiento

- Todo Server Components menos `reveal.tsx` → el JS propio de la ruta es ~0. No importar `recharts`, ni nada de `src/features/*` que arrastre queries/actions de servidor con supabase (las previews se componen con primitivas de `src/components/ui/*` + `ProductIcon`, no con componentes de features).
- LCP = texto del h1 (sin imagen hero). El logo del nav como SVG estático.
- `npm run build:check` debe seguir en verde (la landing no toca el baseline compartido).

## 11. Checklist anti-slop (verificar antes de dar por hecha)

- [ ] Cero `—` y `–` en textos visibles (buscar literalmente en los archivos de la feature).
- [ ] Cero eyebrows (uppercase + tracking sobre títulos). Cero numeración de secciones ("01 ·…").
- [ ] Sin "Paso 1/2/3" textual; sin etiquetas de versión (BETA, v1) en el hero.
- [ ] Sin testimonios, logos de clientes ni métricas inventadas.
- [ ] Sin scroll cues ("desliza", flechas animadas), sin puntos decorativos de color, sin pills sobre imágenes, sin footer con versión/ciudad/hora.
- [ ] Un label por intención en toda la página: "Crear cuenta gratis" y "Iniciar sesión", literales, en todas sus apariciones.
- [ ] Ningún CTA parte su texto en 2 líneas en desktop; hero completo (h1+sub+CTAs) visible sin scroll en 375×812 y 1280×800.
- [ ] Bento: 6 contenidos = 6 celdas, con ≥ 2 celdas con fondo/preview distintos del resto; nunca 3 tarjetas iguales en fila como sección.
- [ ] Máximo 2 secciones con patrón split imagen+texto (hero y spotlight, ya asignadas).
- [ ] Un solo bloque de color saturado (CTA final); ninguna sección invierte el tema.
- [ ] Radios coherentes: `rounded-lg` controles, `rounded-xl` tarjetas/celdas, `rounded-3xl` solo el marco del móvil.
- [ ] Copy releído en voz alta: nada gramaticalmente raro ni "poético de IA".

## 12. Verificación y criterios de aceptación

La verificación por navegador está limitada en este entorno (dev server + login Clerk); verifica con herramientas y deja lo visual para Jorge:

1. `npm run lint` (jsx-a11y strict, 0 warnings) · `npm run typecheck` · `npm run build:check` en verde.
2. Matriz de comportamiento (razonada sobre el código, y probada por Jorge en deploy):
   - Anónimo en `/` → landing (200, sin redirect).
   - Con sesión en `/` → redirect a `/inventario`.
   - `/sign-in`, `/sign-up`, `/offline` y el cron siguen funcionando igual.
   - `/unirse/[code]` sigue protegido (pide login y vuelve): sin cambios.
   - PWA instalada (start_url `/`): usuario logueado acaba en `/inventario`.
3. Revisión visual manual (Jorge): claro/oscuro, 375 px / 768 px / 1280 px, foco por teclado en nav → CTAs → FAQ.

## 13. Fuera de alcance (no hacer en esta tarea)

- Pulir `/sign-in` y `/sign-up` (añadir logo y enlace "Volver" a la landing): mejora natural, pero **otra tarea**.
- `robots.ts` / `sitemap.ts` / imagen OpenGraph (`opengraph-image`): opcionales de SEO para después; la landing no depende de ellos.
- Capturas reales del producto en `public/landing/`: cuando Jorge las aporte, sustituyen el contenido del marco del hero. La v1 no espera por ellas.
- Analítica, cookies, páginas legales: no existen hoy en la app; no inventarlas.
