"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { UNIT_LABELS } from "@/lib/units";
import type { PricePoint } from "../queries";

export const CHAIN_LABELS: Record<string, string> = {
  mercadona: "Mercadona",
  carrefour: "Carrefour",
  lidl: "Lidl",
  dia: "Día",
  alcampo: "Alcampo",
  eroski: "Eroski",
  consum: "Consum",
  aldi: "Aldi",
  otro: "Otros",
};

// Orden fijo de colores categóricos (tokens del design system).
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function PriceChart({
  points,
  unit,
}: {
  points: PricePoint[];
  unit: string;
}) {
  // Cadenas presentes, en orden de primera aparición → color fijo por cadena.
  const chains: string[] = [];
  for (const p of points) if (!chains.includes(p.storeChain)) chains.push(p.storeChain);

  const config: ChartConfig = {};
  chains.forEach((chain, i) => {
    config[chain] = {
      label: CHAIN_LABELS[chain] ?? chain,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });

  // Pivot por fecha: { date, [chain]: unitPrice }.
  const byDate = new Map<string, Record<string, number | string>>();
  for (const p of points) {
    const row = byDate.get(p.date) ?? { date: p.date };
    row[p.storeChain] = Number(p.unitPrice.toFixed(2));
    byDate.set(p.date, row);
  }
  const data = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  const unitLabel = UNIT_LABELS[unit as keyof typeof UNIT_LABELS] ?? unit;

  return (
    <ChartContainer config={config} className="aspect-[4/3] w-full">
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v: string) =>
            format(parseISO(v), "d MMM", { locale: es })
          }
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) => `${v.toFixed(2)} €`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(v) =>
                format(parseISO(String(v)), "d 'de' MMMM yyyy", { locale: es })
              }
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    {CHAIN_LABELS[String(name)] ?? String(name)}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {Number(value).toFixed(2)} €/{unitLabel}
                  </span>
                </span>
              )}
            />
          }
        />
        {chains.map((chain) => (
          <Line
            key={chain}
            type="monotone"
            dataKey={chain}
            stroke={`var(--color-${chain})`}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        ))}
        {chains.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
      </LineChart>
    </ChartContainer>
  );
}
