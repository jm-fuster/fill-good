"use client";

import { ChainMark } from "@/components/chain-mark";
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
  chain,
  active,
  onClick,
}: {
  label: string;
  /**
   * Cadena a la que corresponde el chip, para pintar su sello de color. Se omite
   * en los chips que NO son una tienda («General», «Todas»), y entonces el chip
   * va solo con su texto: ahí no hay marca que reconocer.
   */
  chain?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {chain ? <ChainMark chain={chain} size="md" /> : null}
      {label}
    </button>
  );
}
