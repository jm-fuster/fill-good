import Link from "next/link";
import { ChevronRight, PiggyBank } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEuroSigned } from "@/lib/money";

/**
 * Hucha del mes en curso, en la pantalla de entrada de facto de la app (G1).
 * Engancha con /perfil, que es donde vive el marcador completo del hogar.
 *
 * Saldo NETO con su signo real: un mes flojo se muestra en `warning`, no se
 * escamotea. Toda la fila es el enlace (no solo el icono) para que el target
 * táctil sea grande y legible por lectores de pantalla.
 */
export function SavingsStrip({ total }: { total: number }) {
  const positive = total >= 0;

  return (
    <Link
      href="/perfil"
      className="flex min-h-11 items-center justify-between gap-2 rounded-xl border p-3 text-sm transition-colors hover:bg-muted"
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <PiggyBank className="size-4 shrink-0" aria-hidden />
        Hucha del hogar este mes
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <span
          className={cn(
            "font-medium tabular-nums",
            positive ? "text-success" : "text-warning",
          )}
        >
          {formatEuroSigned(total)}
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </span>
    </Link>
  );
}
