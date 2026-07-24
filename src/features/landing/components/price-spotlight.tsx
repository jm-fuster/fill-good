import { PageContainer } from "@/components/layout/page-container";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

// datos de ejemplo: precio de un producto a lo largo de varios meses (sube).
const SERIES = [8.1, 8.45, 8.3, 8.95, 9.25, 9.1, 9.7, 9.95];

// datos de ejemplo: mismo producto hoy en tres súpers; el más barato en verde.
const PRICE_ROWS = [
  { chain: "Mercadona", price: "9,85 €", cheapest: false },
  { chain: "Carrefour", price: "10,20 €", cheapest: false },
  { chain: "Lidl", price: "9,49 €", cheapest: true },
];

const VIEW_W = 320;
const VIEW_H = 120;
const PAD = 12;

/** Construye la polilínea del sparkline a partir de la serie (en servidor). */
function buildSparkline(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;
  const points = values.map((value, i) => {
    const x = PAD + (i / (values.length - 1)) * innerW;
    const y = PAD + (1 - (value - min) / span) * innerH;
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${(PAD + innerW).toFixed(1)} ${VIEW_H - PAD} L${PAD} ${VIEW_H - PAD} Z`;
  const last = points[points.length - 1];
  return { line, area, last };
}

export function PriceSpotlight() {
  const { line, area, last } = buildSparkline(SERIES);

  return (
    <section className="w-full border-t border-border bg-muted py-16 md:py-24">
      <PageContainer variant="wide" className="px-4 sm:px-6">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <Reveal className="lg:order-2">
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              Tus tickets se convierten en tu historial de precios
            </h2>
            <p className="mt-4 max-w-[48ch] text-lg text-pretty text-muted-foreground">
              Cada ticket guarda lo que pagaste y dónde. Fill Good compara tus
              súpers y te avisa cuando algo sube.
            </p>
          </Reveal>

          <Reveal delayMs={80} className="lg:order-1">
            <figure className="rounded-xl border border-border bg-card p-5">
              <figcaption className="flex items-baseline justify-between gap-2">
                <span className="font-medium">Aceite de oliva 1 L</span>
                <span className="text-xs text-muted-foreground">
                  Precio, últimos meses
                </span>
              </figcaption>

              <svg
                aria-hidden
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="mt-3 w-full"
                preserveAspectRatio="none"
              >
                <path d={area} className="fill-chart-3/10" />
                <path
                  d={line}
                  fill="none"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-chart-3"
                />
                <circle
                  cx={last[0]}
                  cy={last[1]}
                  r={3.5}
                  className="fill-chart-3"
                />
              </svg>

              <ul className="mt-4 space-y-2">
                {PRICE_ROWS.map((row) => (
                  <li
                    key={row.chain}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">{row.chain}</span>
                    <span className="flex items-baseline gap-2">
                      {row.cheapest ? (
                        <span className="text-xs text-success">más barato</span>
                      ) : null}
                      <span
                        className={cn(
                          "font-mono",
                          row.cheapest
                            ? "font-medium text-success"
                            : "text-foreground",
                        )}
                      >
                        {row.price}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </figure>
          </Reveal>
        </div>
      </PageContainer>
    </section>
  );
}
