import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ProductIcon } from "@/components/product-icon";
import { cn } from "@/lib/utils";

export type PantryStatus = "ok" | "soon" | "expired";

/**
 * Fila de producto que replica el patrón real de la despensa
 * (icono + nombre + badge de semáforo). Mismos tokens que
 * `inventory-item-card.tsx`, sin interactividad: es una preview de marca.
 */
export function PantryRow({
  name,
  label,
  status,
}: {
  name: string;
  label: string;
  status: PantryStatus;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <ProductIcon name={name} size={28} className="shrink-0 text-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <Badge
        className={cn(
          "border-transparent",
          status === "expired" && "bg-destructive/15 text-destructive",
          status === "soon" && "bg-warning/15 text-warning",
          status === "ok" && "bg-success/15 text-success",
        )}
      >
        {label}
      </Badge>
    </div>
  );
}

// datos de ejemplo (marca): 4 filas que enseñan el semáforo de caducidad.
const PANTRY_ROWS: { name: string; label: string; status: PantryStatus }[] = [
  { name: "Leche entera", label: "En stock", status: "ok" },
  { name: "Yogur natural", label: "Caduca en 2 días", status: "soon" },
  { name: "Espinacas frescas", label: "Caducado", status: "expired" },
  { name: "Huevos", label: "En stock", status: "ok" },
];

/**
 * Marco de móvil (CSS) con una mini pantalla "Despensa" real. Decorativo:
 * el hero explica el producto en texto, así que el conjunto va `aria-hidden`
 * para no duplicar contenido en lectores de pantalla.
 */
export function HeroPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[320px]">
      <div className="rounded-3xl border border-border bg-card p-2 shadow-lg lg:translate-y-4 lg:rotate-2">
        <div className="overflow-hidden rounded-2xl bg-background">
          {/* Altavoz/notch sugerido con una barra sutil. */}
          <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-border" />
          <div className="flex items-baseline justify-between px-4 pt-4 pb-3">
            <span className="font-heading text-base font-semibold tracking-tight">
              Despensa
            </span>
            <span className="text-xs text-muted-foreground">12 productos</span>
          </div>
          <div className="space-y-2 px-3 pb-5">
            {PANTRY_ROWS.map((row) => (
              <PantryRow key={row.name} {...row} />
            ))}
          </div>
        </div>
      </div>

      {/* Notificación flotante (solo desktop): un único adorno, sin apilar más. */}
      <div className="absolute -top-4 -left-6 hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm lg:flex">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <Bell className="size-4" />
        </span>
        <span className="text-sm font-medium">El yogur caduca pronto</span>
      </div>
    </div>
  );
}
