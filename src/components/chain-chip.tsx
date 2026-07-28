"use client";

import { cn } from "@/lib/utils";

/**
 * Chip de tienda: fila horizontal de opciones excluyentes (la tienda de esta
 * compra, el orden que se está editando…). Vive en `components/` y no en
 * `components/ui/` porque no es de shadcn.
 *
 * `aria-pressed` en vez de un radiogroup a mano: el patrón WAI-ARIA de
 * radiogroup obliga a gestionar el foco con flechas y aquí no aporta nada — son
 * botones que se pulsan, agrupados con `role="group"` y su etiqueta.
 */
export function ChainChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
