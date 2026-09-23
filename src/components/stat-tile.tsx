import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Tarjeta de un dato suelto (icono + etiqueta + cifra + matiz), pensada para
 * rejillas de dos columnas. La usan el resumen del mes cerrado y el marcador del
 * mes en curso en el perfil: son la misma clase de dato mirada en dos momentos,
 * así que tienen que verse igual.
 *
 * `value` es texto ya formateado, no un número: quien la pinta decide si es un
 * importe, un recuento o una palabra ("Cumplido", "Nada").
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  accent?: "success" | "warning" | "chart-3";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          accent === "success" && "text-success",
          accent === "warning" && "text-warning",
          accent === "chart-3" && "text-price",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-xs text-muted-foreground text-pretty">{hint}</p>
      ) : null}
    </div>
  );
}
