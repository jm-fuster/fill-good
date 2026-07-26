"use client";

import { cn } from "@/lib/utils";

/**
 * Contador de artículos pendientes que se muestra sobre la entrada "Lista".
 * `variant="floating"` para la bottom nav (píldora flotante sobre el icono) y
 * `variant="inline"` para el sidebar (a la derecha de la etiqueta). Se oculta
 * cuando el count es 0; a partir de 99 muestra "99+".
 */
export function NavCountBadge({
  count,
  variant = "floating",
  className,
}: {
  count: number;
  variant?: "floating" | "inline";
  className?: string;
}) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);

  return (
    // El badge entra con un "pop" al aparecer (count 0→1); el número interior
    // se remonta por key y repite el pop en cada cambio de count.
    <span
      aria-label={`${count} pendiente${count === 1 ? "" : "s"}`}
      className={cn(
        "pointer-events-none inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums animate-in zoom-in-50 duration-200",
        variant === "floating"
          ? "absolute -top-1 left-1/2 ml-1.5 h-4 shadow-sm"
          : "h-4",
        className,
      )}
    >
      <span key={label} className="animate-in zoom-in-50 duration-200">
        {label}
      </span>
    </span>
  );
}
