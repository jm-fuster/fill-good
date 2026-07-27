import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Receipt,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEuro, formatEuroSigned } from "@/lib/money";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
 * Hucha del hogar (G1): saldo neto del mes, con el desglose de sus dos
 * componentes siempre visible (no colapsado). Un número grande sin explicación
 * es justo lo que hace que la gente deje de creerse este tipo de pantallas; con
 * solo dos líneas de desglose no hace falta un <details>.
 */
function SavingsBlock({
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

function BudgetBar({ total, budget }: { total: number; budget: number }) {
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

export function SpendingPanel({ data }: { data: MonthlySpending }) {
  const {
    monthLabel,
    prevMonth,
    nextMonth,
    total,
    prevTotal,
    delta,
    receiptCount,
    discountTotal,
    savingsByPrice,
    savingsTotal,
    budget,
    byCategory,
    byChain,
    discardedTotal,
    discardedByProduct,
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

            <SavingsBlock
              savingsTotal={savingsTotal}
              discountTotal={discountTotal}
              savingsByPrice={savingsByPrice}
            />

            {discardedTotal > 0 ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-destructive">
                  <Trash2 className="size-4" aria-hidden />
                  Has tirado {formatEuro(discardedTotal)} este mes
                  {discardedByProduct.length > 0 ? (
                    <span className="text-xs text-muted-foreground group-open:hidden">
                      · ver detalle
                    </span>
                  ) : null}
                </summary>
                {discardedByProduct.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1 pl-6">
                    {discardedByProduct.map((d) => (
                      <li
                        key={d.key}
                        className="flex items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="truncate text-muted-foreground">
                          {d.label}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatEuro(d.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </details>
            ) : null}

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
