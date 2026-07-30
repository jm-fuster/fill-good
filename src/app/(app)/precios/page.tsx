import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LineChart } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { getPriceOverview } from "@/features/prices/queries";
import { getMonthlySpending } from "@/features/prices/spending";
import { getPriceAlerts } from "@/features/prices/alerts";
import { SpendingPanel } from "@/features/prices/components/spending-panel";
import { PriceAlerts } from "@/features/prices/components/price-alerts";
import { formatEuro } from "@/lib/money";
import {
  pricePerMeasureLabel,
  UNIT_LABELS,
  type UnitContent,
} from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Precios" };

/**
 * Equivalencia en €/kg o €/l cuando el producto declara el contenido de su
 * envase. No se muestra nada cuando no aporta (sin contenido, o el precio ya
 * viene por kilo o litro): un renglón vacío es peor que ninguno.
 */
function PerMeasure({
  unitPrice,
  unit,
  content,
}: {
  unitPrice: number;
  unit: UnitType;
  content: UnitContent;
}) {
  const label = pricePerMeasureLabel(unitPrice, unit, content);
  if (!label) return null;
  return <p className="text-sm text-chart-3">{label}</p>;
}

export default async function PreciosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const [rows, spending, alerts] = await Promise.all([
    getPriceOverview(),
    getMonthlySpending(mes),
    getPriceAlerts(),
  ]);

  return (
    <PageContainer>
      {/* Sin atajo al resumen del mes: ese destino cuelga de /perfil, que es
          quien lleva el marcador. Aquí se viene a analizar precios. */}
      <PageHeader
        title="Precios"
        description="Evolución de precios de lo que compras."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Sin historial de precios"
          description="Escanea tickets de la compra y aquí verás cómo evoluciona el precio de cada producto y dónde compras más barato."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <PriceAlerts alerts={alerts} />

          {spending ? (
            <SpendingPanel data={spending} />
          ) : null}

          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
            {rows.map((r) => (
              <Link
                key={r.productId}
                href={`/precios/${r.productId}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.purchases}{" "}
                    {r.purchases === 1 ? "compra" : "compras"} · último{" "}
                    {formatEuro(r.lastUnitPrice)}/{UNIT_LABELS[r.unit]}
                  </p>
                  {/* Precio comparable entre formatos: es lo que "1,29 €/ud"
                      esconde cuando cada envase trae una cantidad distinta. */}
                  <PerMeasure
                    unitPrice={r.lastUnitPrice}
                    unit={r.unit}
                    content={r.content}
                  />
                </div>
                <div className="flex items-center gap-1 text-right">
                  <div>
                    <p className="font-medium tabular-nums">
                      {formatEuro(r.totalSpent)}
                    </p>
                    <p className="text-xs text-muted-foreground">gastado</p>
                  </div>
                  <ChevronRight
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
