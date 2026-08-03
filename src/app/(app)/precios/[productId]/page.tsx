import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { PageContainer } from "@/components/layout/page-container";
import { PriceChart } from "@/features/prices/components/price-chart";
import { CHAIN_LABELS } from "@/features/prices/chains";
import { computeChainComparison } from "@/features/prices/chain-comparison";
import { getProductPriceHistory } from "@/features/prices/queries";
import { formatEuro } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  APPROX,
  comparablePriceLabel,
  effectivePackSize,
  formatPurchasePriceLabel,
  formatQuantity,
  UNIT_LABELS,
  type UnitContent,
} from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Precio" };

/**
 * Qué trae cada compra, en palabras: "Cada pack trae 30 ud de ≈ 200 g de media".
 * Con pack la frase habla de packs porque el precio del histórico es el de la
 * caja; sin pack ni contenido no hay nada que contar y no se dice nada.
 */
function contentSentence(
  unit: UnitType,
  content: UnitContent,
  pack: number | null,
): string | null {
  const measure = content
    ? `${content.estimate ? `${APPROX} ` : ""}${formatQuantity(content.size, content.unit)}${content.estimate ? " de media" : ""}`
    : null;
  if (pack) {
    const units = formatQuantity(pack, "ud");
    return measure
      ? `Cada pack trae ${units} de ${measure}.`
      : `Cada pack trae ${units}.`;
  }
  return measure ? `Cada ${UNIT_LABELS[unit]} trae ${measure}.` : null;
}

export default async function PrecioDetallePage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const history = await getProductPriceHistory(productId);
  if (!history) notFound();

  const { name, points, content, packSize } = history;
  const unit = points[0]?.unit ?? "ud";
  // Con pack, lo que el histórico guarda es el precio de la CAJA: la pantalla
  // entera habla de packs y deja el precio por unidad como equivalencia.
  const pack = effectivePackSize(unit, packSize);
  const perLabel = pack ? "pack" : UNIT_LABELS[unit];
  const brings = contentSentence(unit, content, pack);
  const prices = points.map((p) => p.unitPrice);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const last = prices.length ? prices[prices.length - 1] : 0;
  const chainComparison = computeChainComparison(
    points.map((p) => ({ unitPrice: p.unitPrice, storeChain: p.storeChain })),
  );

  return (
    <PageContainer>
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
        Evolución del precio por {perLabel}.
        {brings ? ` ${brings}` : null}
      </p>

      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay compras registradas de este producto.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="Mínimo"
              value={formatEuro(min)}
              accent="success"
              perMeasure={comparablePriceLabel(min, unit, content, packSize)}
            />
            <Stat
              label="Último"
              value={formatEuro(last)}
              perMeasure={comparablePriceLabel(last, unit, content, packSize)}
            />
            <Stat
              label="Máximo"
              value={formatEuro(max)}
              accent="warning"
              perMeasure={comparablePriceLabel(max, unit, content, packSize)}
            />
          </div>

          {points.length > 1 ? (
            <PriceChart points={points} unit={unit} />
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Con una sola compra aún no hay tendencia. Escanea más tickets con
              este producto para ver cómo evoluciona su precio.
            </p>
          )}

          {chainComparison ? (
            <div>
              <h2 className="mb-2 text-sm font-medium">
                Dónde te sale más barato
              </h2>
              <ul className="flex flex-col gap-2">
                {chainComparison.map((c) => (
                  <li
                    key={c.chain}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border p-3",
                      c.cheapest && "border-success/40 bg-success/5",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        media{" "}
                        {formatPurchasePriceLabel(c.avgPrice, unit, packSize)} ·{" "}
                        {c.count} compras
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium tabular-nums",
                        c.cheapest ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {c.cheapest ? "más barato" : `+${c.deltaPct}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
                      Precio/{perLabel}
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
                          {formatPurchasePriceLabel(
                            p.unitPrice,
                            p.unit,
                            packSize,
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function Stat({
  label,
  value,
  accent,
  perMeasure = null,
}: {
  label: string;
  value: string;
  accent?: "success" | "warning";
  /** Equivalente comparable entre formatos (€/kg, €/l); null = no se muestra. */
  perMeasure?: string | null;
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
      {perMeasure ? (
        <p className="text-xs text-chart-3 tabular-nums">{perMeasure}</p>
      ) : null}
    </div>
  );
}
