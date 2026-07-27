import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/money";

/**
 * Objetivo de gasto del mes con barra de progreso (G5). A diferencia del
 * recuento a toro pasado del resumen mensual, esta es la versión EN VIVO: aquí
 * pasarse sí usa `destructive`, porque el mes sigue abierto y todavía hay margen
 * para reaccionar.
 */
export function BudgetBar({ total, budget }: { total: number; budget: number }) {
  const pct = budget > 0 ? (total / budget) * 100 : 0;
  const width = Math.min(pct, 100);
  const over = total > budget;
  const near = pct > 85 && !over;

  const barColor = over
    ? "bg-destructive"
    : near
      ? "bg-warning"
      : "bg-success";
  const textColor = over
    ? "text-destructive"
    : near
      ? "text-warning"
      : "text-success";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Objetivo mensual</span>
        <span className="tabular-nums">
          <span className={cn("font-medium", textColor)}>{formatEuro(total)}</span>
          <span className="text-muted-foreground"> / {formatEuro(budget)}</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
        {over
          ? `Te has pasado ${formatEuro(total - budget)} del objetivo`
          : `Te quedan ${formatEuro(budget - total)} este mes`}
      </p>
    </div>
  );
}
