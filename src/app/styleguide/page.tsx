import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

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

export const metadata: Metadata = { title: "Guía de estilo" };

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
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 pb-16">
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

      <Section title="Estados de carga" description="Skeletons, nunca spinners a pantalla completa.">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-3/4 rounded-xl" />
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
            Edición en móvil: bottom sheet (<code>Drawer</code>), no modales
            centrados.
          </li>
          <li>Radios: <code>rounded-lg</code> controles, <code>rounded-xl</code> tarjetas.</li>
        </ul>
      </Section>
    </div>
  );
}
