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
  variant = "row",
}: {
  savingsTotal: number;
  discountTotal: number;
  savingsByPrice: number;
  /**
   * `row` — bloque compacto dentro del panel de gasto de /precios.
   * `hero` — titular de /perfil: el mismo saldo y el mismo desglose, con la
   * cifra en grande porque allí la hucha es el asunto de la pantalla.
   */
  variant?: "row" | "hero";
}) {
  if (discountTotal <= 0 && savingsByPrice === 0) return null;
  const positive = savingsTotal >= 0;
  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border",
        isHero ? "gap-3 rounded-xl p-5" : "gap-2 p-3",
      )}
    >
      {isHero ? (
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <PiggyBank className="size-4 shrink-0" aria-hidden />
            A la hucha este mes
          </p>
          <p
            className={cn(
              "text-4xl font-semibold tabular-nums",
              positive ? "text-success" : "text-warning",
            )}
          >
            {formatEuroSigned(savingsTotal)}
          </p>
        </div>
      ) : (
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium",
            positive ? "text-success" : "text-warning",
          )}
        >
          <PiggyBank className="size-4 shrink-0" aria-hidden />
          Hucha del hogar: {formatEuroSigned(savingsTotal)}
        </p>
      )}
      <ul
        className={cn(
          "flex flex-col gap-1 text-xs text-muted-foreground",
          !isHero && "pl-6",
        )}
      >
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
