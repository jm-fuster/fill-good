import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

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
 * donante recoloreado (el melocotón de Fluent en morado) y `col` un dibujo propio:
 * las dos cierran la fila para comprobar que no desentonan con el resto.
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
    <PageContainer variant="wide" className="px-4 py-6 pb-16">
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
            <Trash2 data-icon="inline-start" aria-hidden /> Eliminar
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
        description="Estados de inventario y caducidad, siempre con estos pares token/uso."
      >
        <div className="flex flex-wrap gap-2">
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
          <Badge variant="outline">Sin stock</Badge>
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
        description="Iconos a color plano (Fluent Emoji Flat, MIT) — estilo propio, no emojis del sistema. Se resuelven por capas: icono manual → adivinado del nombre → icono de categoría → genérico. Componente ProductIcon; se eligen a mano con ProductIconPicker."
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

      <Section title="Estados de carga" description="Skeletons, nunca spinners a pantalla completa.">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-3/4 rounded-xl" />
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
              <code>PageContainer</code> — ancho por tipo de página
            </p>
            <ul className="flex flex-col gap-1 text-muted-foreground">
              <li>
                <code>narrow</code> — <code>max-w-lg</code> siempre (formularios,
                escanear, revisión de caducidades).
              </li>
              <li>
                <code>default</code> — <code>max-w-lg</code> →{" "}
                <code>md:max-w-2xl</code> (listas de 1 columna: lista, ajustes,
                precios, revisar ticket).
              </li>
              <li>
                <code>wide</code> — hasta <code>xl:max-w-6xl</code> (grids y
                datos: inventario, menús, recetas, detalle de precios).
              </li>
            </ul>
            <div className="mt-3 flex flex-col gap-2" aria-hidden>
              <div className="mx-auto h-8 w-full max-w-[8rem] rounded-lg bg-muted text-center text-xs leading-8">
                narrow
              </div>
              <div className="mx-auto h-8 w-full max-w-[16rem] rounded-lg bg-muted text-center text-xs leading-8">
                default
              </div>
              <div className="h-8 w-full rounded-lg bg-muted text-center text-xs leading-8">
                wide
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
            Anchos de página siempre vía <code>PageContainer</code>{" "}
            (narrow/default/wide), nunca <code>max-w-*</code> a mano.
          </li>
          <li>Radios: <code>rounded-lg</code> controles, <code>rounded-xl</code> tarjetas.</li>
        </ul>
      </Section>
    </PageContainer>
  );
}
