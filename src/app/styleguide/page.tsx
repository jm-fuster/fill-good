import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, ShoppingCart, Trash } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductIcon } from "@/components/product-icon";

export const metadata: Metadata = { title: "Guía de estilo" };

/**
 * Muestra representativa de iconos de producto (L16). La ficha va en `bg-muted`
 * a propósito: el color lo pone el icono, así que un tinte por categoría detrás
 * competiría con él. `manzana` y `manzana-verde` van juntas porque son el caso que
 * justifica el set a color: en monocromo eran el mismo dibujo. `ciruela` es un
 * donante recoloreado (el melocotón de Fluent en morado) y `col`, `jamon` y
 * `coliflor` son dibujos propios: cierran la fila para comprobar que no desentonan
 * con el resto. `coliflor` está aquí a propósito por ser el más pálido del set —
 * su masa casi blanca solo se despega del fondo gracias a las hojas verdes.
 */
const productIconSamples = [
  "manzana",
  "manzana-verde",
  "tomate",
  "pescado",
  "leche",
  "pan",
  "berenjena",
  "bote-spray",
  "cafe",
  "helado",
  "ciruela",
  "col",
  "jamon",
  "coliflor",
];

const colorTokens = [
  { name: "primary", className: "bg-primary text-primary-foreground" },
  { name: "secondary", className: "bg-secondary text-secondary-foreground" },
  { name: "accent", className: "bg-accent text-accent-foreground" },
  { name: "muted", className: "bg-muted text-muted-foreground" },
  { name: "success", className: "bg-success text-success-foreground" },
  { name: "warning", className: "bg-warning text-warning-foreground" },
  {
    name: "destructive",
    className: "bg-destructive text-destructive-foreground",
  },
  { name: "card", className: "border bg-card text-card-foreground" },
];

const chartTokens = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      {description ? (
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  // Referencia viva del sistema de diseño: solo en desarrollo. En producción no
  // debe ser accesible (no forma parte del producto).
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <PageContainer className="px-4 py-6 pb-16">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/ajustes"
            className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Volver a ajustes
          </Link>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Guía de estilo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Referencia viva del sistema de diseño. Toda la UI consume estos
            tokens — nada de colores o tamaños inventados.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section
        title="Color"
        description="Tokens semánticos (nunca hex directos). success = en stock / ok · warning = caduca pronto · destructive = caducado / eliminar."
      >
        <div className="grid grid-cols-2 gap-2">
          {colorTokens.map((token) => (
            <div
              key={token.name}
              className={`flex h-16 items-end rounded-lg p-2 text-xs font-medium ${token.className}`}
            >
              {token.name}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          <strong className="font-medium text-foreground">
            El verde de <code>success</code> va más oscuro que sus hermanos y no
            se puede aclarar «para que combine».
          </strong>{" "}
          La <code>L</code> de <code>oklch()</code> es lightness percibida, pero
          el contraste WCAG se calcula con luminancia relativa, y ahí el verde
          pesa 0,7152 de los tres canales. A la misma <code>L</code> de diseño el
          verde contrasta bastante menos que el rojo o el ámbar: medido, a{" "}
          <code>L 0,52</code> tenía más luminancia (0,1517) que{" "}
          <code>destructive</code> a <code>L 0,53</code> (0,1304). Por eso el
          badge <code>success/15</code> se quedaba en 4,25:1 y hubo que bajar el
          token a <code>L 0,48</code>. Moraleja para cualquier token nuevo:{" "}
          <em>la misma L no da el mismo contraste en dos tonos distintos</em>.
        </p>
        <p className="mt-4 mb-2 text-sm font-medium">
          Charts (series: supermercados, categorías) — chart-3 es el acento
          cálido de precios
        </p>
        <div className="flex gap-2">
          {chartTokens.map((c, i) => (
            <div key={c} className={`h-10 flex-1 rounded-lg ${c}`}>
              <span className="sr-only">chart-{i + 1}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">
          <span className="font-medium text-price">3,49 €/kg</span>{" "}
          <span className="text-muted-foreground">
            — como TEXTO, el acento de precios va con <code>text-price</code>,
            no con <code>text-chart-3</code>: el de gráfica se quedaba en 4,0:1
            sobre los fondos claros (3,7 sobre su propio tinte). Iconos y
            estrellas sí siguen en <code>chart-3</code> (les basta 3:1).
          </span>
        </p>
      </Section>

      <Section
        title="Tipografía"
        description="Geist Sans. Escala: título de página 2xl semibold, sección lg semibold, cuerpo sm/base, apoyo xs muted."
      >
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <p className="text-2xl font-semibold tracking-tight">
            Título de página
          </p>
          <p className="text-lg font-semibold">Título de sección</p>
          <p className="text-base">Cuerpo de texto base</p>
          <p className="text-sm">Cuerpo de texto compacto</p>
          <p className="text-sm text-muted-foreground">Texto secundario</p>
          <p className="text-xs text-muted-foreground">
            Apoyo / metadatos · 12px
          </p>
        </div>
      </Section>

      <Section
        title="Botones"
        description="Tamaño por defecto 44px (touch target WCAG). xs/sm solo para contextos densos no táctiles."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">
            <Trash data-icon="inline-start" aria-hidden /> Eliminar
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="lg">Grande (CTA)</Button>
          <Button size="sm" variant="outline">
            Pequeño
          </Button>
          <Button size="icon" aria-label="Añadir producto">
            <Plus aria-hidden />
          </Button>
          <Button disabled>Deshabilitado</Button>
        </div>
      </Section>

      <Section
        title="Formularios"
        description="Labels siempre visibles (nunca placeholder como única etiqueta). Inputs de 44px."
      >
        <div className="flex flex-col gap-4 rounded-xl border p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-nombre">Nombre del producto</Label>
            <Input id="sg-nombre" placeholder="p. ej. Leche entera" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-error">Cantidad (con error)</Label>
            <Input
              id="sg-error"
              aria-invalid
              defaultValue="-3"
              aria-describedby="sg-error-msg"
            />
            <p id="sg-error-msg" className="text-sm text-destructive">
              La cantidad no puede ser negativa.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id="sg-check" defaultChecked />
            <Label htmlFor="sg-check">Comprado</Label>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sg-select">Ubicación</Label>
            <Select defaultValue="fridge">
              <SelectTrigger id="sg-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pantry">Despensa</SelectItem>
                <SelectItem value="fridge">Nevera</SelectItem>
                <SelectItem value="freezer">Congelador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section
        title="Badges de estado"
        description="Estados de inventario y caducidad, siempre con estos pares token/uso. El tinte está reservado a la caducidad: los tres colores son la MISMA escala (frescura), así que lo que no es una fecha no se tiñe. «Agotado» va neutro (outline) y se distingue por forma —borde, sin relleno—; si compartiera el ámbar de «caduca pronto», una tarjeta vacía se leería como comida a punto de echarse a perder. Y no convive con ninguno de los tres: sin existencias no hay frescura de la que hablar, así que en agotado la escala entera se calla (también «Consumir pronto»)."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-success/30 bg-success/15 text-success">
            En stock
          </Badge>
          <Badge className="border-warning/40 bg-warning/15 text-warning">
            Caduca en 2 días
          </Badge>
          <Badge className="border-destructive/30 bg-destructive/15 text-destructive">
            Caducado
          </Badge>
          <Badge variant="secondary">Congelador</Badge>
          <Badge variant="outline">Agotado</Badge>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Y lo que no es un estado del producto no va en esta fila ni lleva pill:
          «está en la lista de la compra» se dice con un chip de carrito anclado
          al icono del producto —el mismo icono del gesto, del interruptor de la
          ficha y del selector de <code>/lista</code>—. En la esquina del icono y
          no al final de la fila de badges, porque esa fila cambia de longitud en
          cada tarjeta y el indicador cambiaba de sitio con ella. Relleno sólido
          (<code>bg-primary</code>) y no un contorno fino, que entre badges de
          color no se veía. Pill no: <code>primary</code> y <code>success</code>{" "}
          son casi el mismo verde y un pill verde con carrito se confundiría con
          el de caducidad. El anillo va en <code>ring-card</code>, el token de la
          superficie que lo sostiene, no el de la página.
        </p>
        <div className="mt-3 flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
          <span className="relative flex shrink-0">
            <ProductIcon slug="leche" size={32} />
            <span className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
              <ShoppingCart className="size-3" aria-hidden />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block font-medium">Leche entera</span>
            <span className="text-muted-foreground">2 ud · 2 l</span>
          </span>
          <span className="sr-only">En la lista de la compra</span>
        </div>
      </Section>

      <Section title="Tarjeta de producto" description="Patrón de item de inventario.">
        <Card>
          <CardHeader>
            <CardTitle>Yogur natural</CardTitle>
            <CardDescription>Nevera · 4 ud</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Badge className="border-warning/40 bg-warning/15 text-warning">
              Caduca en 2 días
            </Badge>
            <div className="flex items-center gap-2">
              <Button size="icon-sm" variant="outline" aria-label="Quitar uno">
                −
              </Button>
              <span className="w-6 text-center text-sm font-medium">4</span>
              <Button size="icon-sm" variant="outline" aria-label="Añadir uno">
                +
              </Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Iconos de producto (L16)"
        description="Iconos a color plano (Fluent Emoji Flat, MIT) — estilo propio, no emojis del sistema. Se resuelven por capas: icono manual → adivinado del nombre → icono de categoría → genérico. Componente ProductIcon; se eligen a mano con ProductIconPickerView, una vista que se mete dentro del panel que la abre (nunca un modal encima de otro)."
      >
        <div className="flex flex-wrap gap-3">
          {productIconSamples.map((slug) => (
            <div
              key={slug}
              className="flex size-12 items-center justify-center rounded-xl bg-muted"
            >
              <ProductIcon slug={slug} size={26} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          El color es <strong>intrínseco</strong>: cada SVG trae sus rellenos, así
          que <code>text-*</code> no tiñe estos iconos — para atenuar uno se usa{" "}
          <code>opacity-*</code>. La ficha va en <code>bg-muted</code> y no en un
          tinte por categoría, que competiría con el color del propio icono.
          Guardamos un slug, no un componente: cambiar de set el día de mañana es
          sustituir SVGs.
        </p>
      </Section>

      <Section
        title="Estados de carga"
        description="Skeletons para rutas (loading.tsx), nunca spinners a pantalla completa. Para acciones en curso, la prop loading de Button."
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-3/4 rounded-xl" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button loading>Guardando…</Button>
          <Button variant="outline" loading>
            Generando menú…
          </Button>
          <Button variant="destructive" loading>
            Eliminando…
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          <code>loading</code> deshabilita el botón, marca{" "}
          <code>aria-busy</code> y el spinner <strong>sustituye</strong> al
          icono (el label se mantiene para que el ancho no salte). Si dos
          botones comparten un mismo estado pending, <code>loading</code> solo
          en el que dispara la acción. No compatible con <code>asChild</code>.
        </p>
      </Section>

      <Section
        title="Movimiento y feedback"
        description="Micro-animaciones de coste cero: solo transform/opacity (compositor), 100–300 ms, y prefers-reduced-motion las apaga todas vía la regla global."
      >
        <div className="flex flex-col gap-4 text-sm">
          <div className="rounded-xl border p-4">
            <p className="mb-2 font-medium">Patrones establecidos (reutilizar, no inventar)</p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
              <li>
                Navegación optimista: <code>useOptimisticNav</code> resalta la
                entrada al tocar (sin esperar al servidor);{" "}
                <code>NavLinkIcon</code> pulsa el icono solo si la ruta tarda
                (&gt;150 ms de delay, cero parpadeo en navegaciones rápidas).
              </li>
              <li>
                Cambios de estado en listas: key con el estado (
                <code>{"`${id}:${checked}`"}</code>) fuerza el remount y la
                fila entra animada (<code>animate-in fade-in zoom-in-95</code>)
                en su nueva sección.
              </li>
              <li>
                Números que cambian (steppers, badges): span interior con{" "}
                <code>key</code> por valor + <code>zoom-in-50</code>, dejando
                estable la región <code>aria-live</code>.
              </li>
              <li>
                Filtros que re-renderizan listas: cross-fade por bloque (una
                key por filtro activo, UNA animación por cambio). Nunca key por
                tecleo de búsqueda: remontar por tecla cuesta CPU.
              </li>
              <li>
                Háptica: <code>vibrateTick()</code> de{" "}
                <code>src/lib/haptics.ts</code> al confirmar acciones táctiles
                (feature-detect; respeta reduced-motion).
              </li>
            </ul>
          </div>
          <div className="rounded-xl border p-4">
            <p className="mb-1 font-medium">Reglas</p>
            <p className="text-muted-foreground">
              100–200 ms para interacción (press, pops), 200–300 ms para
              entradas; ease-out. Nunca animar altura, anchura o posición
              (layout). Los overlays ya animan de serie (vaul, shadcn, sonner,
              Recharts): no duplicar. Press feedback táctil:{" "}
              <code>active:scale-95</code> + <code>transition-transform</code>.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Responsive (E11)"
        description="Adaptativo, no dos apps: un único árbol de componentes; las diferencias se resuelven con breakpoints. Punto de corte del shell: md (768px)."
      >
        <div className="flex flex-col gap-4 text-sm">
          <div className="rounded-xl border p-4">
            <p className="mb-1 font-medium">Shell</p>
            <p className="text-muted-foreground">
              &lt; md: bottom nav + FAB + bottom sheets (la experiencia móvil de
              siempre). ≥ md: sidebar lateral colapsable (Ctrl/Cmd+B), acciones
              en el header y diálogos centrados. Bottom nav y sidebar conviven
              en el árbol y se alternan solo con CSS.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-2 font-medium">
              <code>PageContainer</code> — un solo ancho en la app
            </p>
            <ul className="flex flex-col gap-1 text-muted-foreground">
              <li>
                <code>app</code> (por defecto) — <code>max-w-lg</code> hasta{" "}
                <code>xl:max-w-6xl</code>. <strong>Todas</strong> las páginas de
                la app: los márgenes en escritorio no cambian al navegar.
              </li>
              <li>
                <code>prose</code> — <code>md:max-w-2xl</code>, solo para texto
                largo fuera de la app (páginas legales).
              </li>
              <li>
                <code>narrow</code> — <code>max-w-lg</code>, solo para bloques
                estrechos de la landing (FAQ).
              </li>
            </ul>
            <div className="mt-3 flex flex-col gap-2" aria-hidden>
              <div className="h-8 w-full rounded-lg bg-muted text-center text-xs leading-8">
                app
              </div>
              <div className="mx-auto h-8 w-full max-w-[16rem] rounded-lg bg-muted text-center text-xs leading-8">
                prose
              </div>
              <div className="mx-auto h-8 w-full max-w-[8rem] rounded-lg bg-muted text-center text-xs leading-8">
                narrow
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-1 font-medium">
              <code>ResponsiveModal</code>
            </p>
            <p className="text-muted-foreground">
              Todo overlay va por <code>ResponsiveModal</code>: bottom sheet
              (<code>Drawer</code>) en &lt; md y diálogo centrado
              (<code>Dialog</code>) en ≥ md, con la misma API de subcomponentes.
              Las features nunca importan <code>Drawer</code>/<code>Dialog</code>{" "}
              directamente.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-1 font-medium">
              <code>CollapsibleFields</code>
            </p>
            <p className="text-muted-foreground">
              En un panel de formulario, a la vista solo los campos del día a
              día; el resto va plegado en{" "}
              <code>&laquo;Ajustes adicionales&raquo;</code> para que las
              acciones (guardar, eliminar) se lean sin scroll en móvil. Lo
              plegado se oculta con CSS y sigue montado: las Server Actions leen
              el <code>FormData</code> completo y un campo ausente se guarda como
              vacío. Acompáñalo de <code>ResponsiveModalFooter sticky</code>.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-1 font-medium">FAB → header</p>
            <p className="text-muted-foreground">
              La acción primaria es un FAB flotante en móvil y un botón en el
              header (junto al resto de acciones) en escritorio; ambos disparan
              el mismo modal.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Reglas del sistema">
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          <li>
            Solo tokens: <code>bg-primary</code>, <code>text-warning</code>…
            Nunca colores arbitrarios ni hex.
          </li>
          <li>Touch targets ≥ 44px; bottom nav ≥ 48px.</li>
          <li>Contraste AA verificado en claro y oscuro para cada par.</li>
          <li>Labels visibles; placeholder solo como ejemplo de formato.</li>
          <li>
            Botones de icono siempre con <code>aria-label</code>.
          </li>
          <li>
            Foco visible en todo elemento interactivo (ring del token{" "}
            <code>ring</code>).
          </li>
          <li>
            Animaciones respetan <code>prefers-reduced-motion</code>.
          </li>
          <li>
            Overlays siempre vía <code>ResponsiveModal</code>: bottom sheet en
            móvil, diálogo centrado en escritorio (nunca{" "}
            <code>Drawer</code>/<code>Dialog</code> directos en features).
          </li>
          <li>
            Anchos de página siempre vía <code>PageContainer</code>, nunca{" "}
            <code>max-w-*</code> a mano. En la app se usa sin{" "}
            <code>variant</code>: un único ancho para todas las páginas.
          </li>
          <li>Radios: <code>rounded-lg</code> controles, <code>rounded-xl</code> tarjetas.</li>
        </ul>
      </Section>
    </PageContainer>
  );
}
