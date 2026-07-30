import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Receipt,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/money";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BudgetBar } from "./budget-bar";
import type { MonthlySpending, SpendingBreakdownItem } from "../spending";

// Colores categóricos en orden fijo (tokens del design system). Nunca se
// ciclan: a partir del 5º, el desglose los agrupa en "Otros".
const CHART_BAR = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];
const MAX_BARS = 5;

/** Agrupa la cola del desglose en "Otros" para no ciclar colores. */
function foldTail(
  items: SpendingBreakdownItem[],
): SpendingBreakdownItem[] {
  if (items.length <= MAX_BARS) return items;
  const head = items.slice(0, MAX_BARS - 1);
  const tail = items.slice(MAX_BARS - 1);
  const rest = tail.reduce((s, i) => s + i.total, 0);
  return [...head, { key: "otros", label: "Otros", total: rest }];
}

function BreakdownBars({
  title,
  items,
}: {
  title: string;
  items: SpendingBreakdownItem[];
}) {
  const folded = foldTail(items);
  if (folded.length === 0) return null;
  const max = Math.max(...folded.map((i) => i.total), 1);

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-2">
        {folded.map((item, i) => {
          const isOther = item.key === "otros" && folded.length > MAX_BARS - 1;
          return (
            <li key={item.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatEuro(item.total)}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    isOther
                      ? "bg-muted-foreground/40"
                      : CHART_BAR[i % CHART_BAR.length],
                  )}
                  style={{ width: `${(item.total / max) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Panel de gasto de un mes (M1). Es la herramienta de ANÁLISIS: cuánto se fue,
 * en qué y dónde. La hucha ya no vive aquí —es el marcador del mes en curso y
 * está en /perfil, y de cualquier mes pasado, en /resumen— para que el mismo
 * número no se cuente de dos maneras distintas.
 */
export function SpendingPanel({ data }: { data: MonthlySpending }) {
  const {
    monthLabel,
    prevMonth,
    nextMonth,
    total,
    prevTotal,
    delta,
    receiptCount,
    budget,
    byCategory,
    byChain,
  } = data;

  const hasData = receiptCount > 0;
  const spentLess = delta < 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resumen de {monthLabel}</CardTitle>
        <CardAction className="flex items-center gap-1 self-center">
          <Link
            href={`/precios?mes=${prevMonth}`}
            aria-label="Mes anterior"
            className="inline-flex size-9 items-center justify-center rounded-lg border transition-colors hover:bg-muted"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          {nextMonth ? (
            <Link
              href={`/precios?mes=${nextMonth}`}
              aria-label="Mes siguiente"
              className="inline-flex size-9 items-center justify-center rounded-lg border transition-colors hover:bg-muted"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span
              aria-hidden
              className="inline-flex size-9 items-center justify-center rounded-lg border text-muted-foreground opacity-40"
            >
              <ChevronRight className="size-4" />
            </span>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {hasData ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-3xl font-semibold tabular-nums">
                  {formatEuro(total)}
                </p>
                {prevTotal > 0 ? (
                  <p
                    className={cn(
                      "flex items-center gap-1 text-sm",
                      spentLess ? "text-success" : "text-warning",
                    )}
                  >
                    {spentLess ? (
                      <TrendingDown className="size-4" aria-hidden />
                    ) : (
                      <TrendingUp className="size-4" aria-hidden />
                    )}
                    {formatEuro(Math.abs(delta))} {spentLess ? "menos" : "más"} que el
                    mes anterior
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sin datos del mes anterior
                  </p>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Receipt className="size-4" aria-hidden />
                {receiptCount} {receiptCount === 1 ? "compra" : "compras"}
              </p>
            </div>

            {budget != null ? <BudgetBar total={total} budget={budget} /> : null}

            {byCategory.length > 0 ? (
              <BreakdownBars title="Por categoría" items={byCategory} />
            ) : null}

            {byChain.length > 0 ? (
              <BreakdownBars title="Por comercio" items={byChain} />
            ) : null}
          </>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            Sin compras en {monthLabel.toLowerCase()}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
