import { Coins } from "lucide-react";

import { formatEuro } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { RecipeCost } from "../cost";

/**
 * Badge de coste estimado (M7), acento de precios `chart-3`. Presentacional y
 * sin hooks: sirve en Server y Client Components. Un total con "≈" solo cuando
 * TODOS los ingredientes tienen precio; si es parcial, "≥ X € (n de m)" para no
 * presentar jamás un parcial como total. Nada que mostrar si no hay precios.
 */
export function CostBadge({
  cost,
  className,
}: {
  cost: RecipeCost;
  className?: string;
}) {
  if (cost.pricedCount === 0) return null;

  const label = cost.complete
    ? `Coste estimado ${formatEuro(cost.total)}`
    : `Coste estimado desde ${formatEuro(cost.total)}, ${cost.pricedCount} de ${cost.totalCount} ingredientes con precio`;

  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-chart-3/10 px-2 py-0.5 text-xs font-medium text-price",
        className,
      )}
    >
      <Coins className="size-3.5" aria-hidden />
      <span aria-hidden>
        {cost.complete ? "≈ " : "≥ "}
        {formatEuro(cost.total)}
        {!cost.complete ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            ({cost.pricedCount} de {cost.totalCount})
          </span>
        ) : null}
      </span>
    </span>
  );
}
