import { PiggyBank, Tag, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEuro, formatEuroSigned } from "@/lib/money";

/**
 * Hucha del hogar (G1): saldo neto del mes, con el desglose de sus dos
 * componentes siempre visible (no colapsado). Un número grande sin explicación
 * es justo lo que hace que la gente deje de creerse este tipo de pantallas; con
 * solo dos líneas de desglose no hace falta un <details>.
 *
 * En fichero propio porque lo pintan varias pantallas (el panel de /precios y el
 * marcador de /perfil): la hucha es EL número del producto y dos copias del
 * mismo bloque acabarían contando la misma cifra de dos maneras distintas.
 */
export function SavingsBlock({
  savingsTotal,
  discountTotal,
  savingsByPrice,
}: {
  savingsTotal: number;
  discountTotal: number;
  savingsByPrice: number;
}) {
  if (discountTotal <= 0 && savingsByPrice === 0) return null;
  const positive = savingsTotal >= 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p
        className={cn(
          "flex items-center gap-1.5 text-sm font-medium",
          positive ? "text-success" : "text-warning",
        )}
      >
        <PiggyBank className="size-4 shrink-0" aria-hidden />
        Hucha del hogar: {formatEuroSigned(savingsTotal)}
      </p>
      <ul className="flex flex-col gap-1 pl-6 text-xs text-muted-foreground">
        {discountTotal > 0 ? (
          <li className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1">
              <Tag className="size-3.5 shrink-0" aria-hidden />
              Descuentos del ticket
            </span>
            <span className="tabular-nums">{formatEuro(discountTotal)}</span>
          </li>
        ) : null}
        {savingsByPrice !== 0 ? (
          <li className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1">
              {savingsByPrice > 0 ? (
                <TrendingDown className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <TrendingUp className="size-3.5 shrink-0" aria-hidden />
              )}
              Precio frente a lo habitual
            </span>
            <span className="tabular-nums">{formatEuroSigned(savingsByPrice)}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
