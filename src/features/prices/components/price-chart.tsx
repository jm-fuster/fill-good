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
import { formatEuro } from "@/lib/money";
import type { PricePoint } from "../queries";
import { chainLabel } from "../chains";

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
  perLabel,
}: {
  points: PricePoint[];
  /**
   * Por qué se cobra cada punto («ud», «kg»… o «pack»): lo decide la página, que
   * es quien sabe si el histórico guarda el precio de la caja. Con la unidad del
   * producto el tooltip decía «€/ud» donde el resto de la pantalla dice «/pack».
   */
  perLabel: string;
}) {
  // Cadenas presentes, en orden de primera aparición → color fijo por cadena.
  const chains: string[] = [];
  for (const p of points) if (!chains.includes(p.storeChain)) chains.push(p.storeChain);

  // La clave de cada serie NO es el nombre de la cadena: las tiendas propias del
  // hogar (L15 f5) pueden llevar espacios o puntos ("Bon Àrea", "Coviran S.A.") y
  // ChartContainer las convierte en variables CSS (`--color-<clave>`), donde un
  // espacio invalida la declaración entera y la línea se quedaría sin color.
  // `s0`, `s1`… siempre son válidas; el nombre legible viaja en el config, que es
  // de donde lo sacan la leyenda y el tooltip.
  const series = chains.map((chain, i) => ({
    chain,
    key: `s${i}`,
    label: chainLabel(chain),
  }));
  const keyByChain = new Map(series.map((s) => [s.chain, s.key]));
  const labelByKey = new Map(series.map((s) => [s.key, s.label]));

  const config: ChartConfig = {};
  series.forEach((s, i) => {
    config[s.key] = {
      label: s.label,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  });

  // Pivot por fecha: { date, [clave de serie]: unitPrice }.
  const byDate = new Map<string, Record<string, number | string>>();
  for (const p of points) {
    const row = byDate.get(p.date) ?? { date: p.date };
    const key = keyByChain.get(p.storeChain);
    if (key) row[key] = Number(p.unitPrice.toFixed(2));
    byDate.set(p.date, row);
  }
  const data = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  return (
    <ChartContainer
      config={config}
      className="aspect-[4/3] w-full md:aspect-[2/1]"
    >
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
        {/* El eje NO arranca en 0 ("auto"): son céntimos de diferencia sobre un
            euro, y con el cero abajo las líneas salían planas justo en lo que la
            gráfica tiene que enseñar. Es una gráfica de líneas, no de barras: no
            hay área que el corte del eje deforme. */}
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => formatEuro(v)}
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
                    {labelByKey.get(String(name)) ?? String(name)}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatEuro(Number(value))}/{perLabel}
                  </span>
                </span>
              )}
            />
          }
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={`var(--color-${s.key})`}
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
