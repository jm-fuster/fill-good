"use client";

import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Celda de acción secundaria de un plato: icono arriba, etiqueta corta debajo.
 * Con etiqueta visible (no solo `aria-label`) para que se siga entendiendo de un
 * vistazo, ocupando un tercio del ancho. La comparten el drawer de un plato y el
 * repaso de platos, que ofrecen las mismas salidas.
 */
export function EntryActionTile({
  icon: Icon,
  label,
  onClick,
  loading,
  disabled,
  pressed,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Acción de dos estados (fijar/desfijar): refleja el estado actual. */
  pressed?: boolean;
  destructive?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : destructive ? "destructive" : "outline"}
      onClick={onClick}
      loading={loading}
      disabled={disabled}
      aria-pressed={pressed}
      className="h-auto min-h-16 flex-col gap-1 px-1 py-2 text-[0.7rem] leading-tight whitespace-normal"
    >
      <Icon aria-hidden />
      {label}
    </Button>
  );
}
