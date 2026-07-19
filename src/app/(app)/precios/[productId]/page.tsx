import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import {
  CHAIN_LABELS,
  PriceChart,
} from "@/features/prices/components/price-chart";
import { getProductPriceHistory } from "@/features/prices/queries";
import { UNIT_LABELS } from "@/lib/units";

export const metadata: Metadata = { title: "Precio" };

function euro(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

export default async function PrecioDetallePage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const history = await getProductPriceHistory(productId);
  if (!history) notFound();

  const { name, points } = history;
  const unit = points[0]?.unit ?? "ud";
  const prices = points.map((p) => p.unitPrice);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const last = prices.length ? prices[prices.length - 1] : 0;

  return (
    <>
      <Link
        href="/precios"
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Precios
      </Link>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
        {name}
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Evolución del precio por {UNIT_LABELS[unit]}.
      </p>

      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay compras registradas de este producto.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Mínimo" value={euro(min)} accent="success" />
            <Stat label="Último" value={euro(last)} />
            <Stat label="Máximo" value={euro(max)} accent="warning" />
          </div>

          {points.length > 1 ? (
            <PriceChart points={points} unit={unit} />
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Con una sola compra aún no hay tendencia. Escanea más tickets con
              este producto para ver cómo evoluciona su precio.
            </p>
          )}

          <div>
            <h2 className="mb-2 text-sm font-medium">Compras</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="py-2 font-medium">
                      Fecha
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Tienda
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Precio/ud
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...points]
                    .reverse()
                    .map((p, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">
                          {format(parseISO(p.date), "d MMM yyyy", {
                            locale: es,
                          })}
                        </td>
                        <td className="py-2">
                          {CHAIN_LABELS[p.storeChain] ?? p.storeChain}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {euro(p.unitPrice)}/{UNIT_LABELS[p.unit]}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "warning";
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          accent === "success"
            ? "font-semibold text-success tabular-nums"
            : accent === "warning"
              ? "font-semibold text-warning tabular-nums"
              : "font-semibold tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}
