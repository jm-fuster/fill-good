import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LineChart, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { getPriceOverview } from "@/features/prices/queries";
import { getMonthlySpending, getWasteInsight } from "@/features/prices/spending";
import { getPriceAlerts } from "@/features/prices/alerts";
import { SpendingPanel } from "@/features/prices/components/spending-panel";
import { PriceAlerts } from "@/features/prices/components/price-alerts";
import { formatEuro } from "@/lib/money";
import { UNIT_LABELS } from "@/lib/units";

export const metadata: Metadata = { title: "Precios" };

export default async function PreciosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const [rows, spending, alerts, waste] = await Promise.all([
    getPriceOverview(),
    getMonthlySpending(mes),
    getPriceAlerts(),
    getWasteInsight(),
  ]);

  // La racha es un hecho de AHORA: solo acompaña al mes en curso, que es el
  // único sin "mes siguiente" al que navegar.
  const isCurrentMonth = spending?.nextMonth === null;

  return (
    <PageContainer>
      <PageHeader
        title="Precios"
        description="Evolución de precios de lo que compras."
        action={
          <Button asChild variant="outline" size="icon" aria-label="Resumen del mes">
            <Link href="/resumen">
              <Sparkles aria-hidden />
            </Link>
          </Button>
        }
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
            <SpendingPanel
              data={spending}
              waste={
                waste
                  ? {
                      // La media habitual sí vale para cualquier mes; la racha no.
                      monthlyAverage: waste.monthlyAverage,
                      streak: isCurrentMonth ? waste.streak : null,
                    }
                  : null
              }
            />
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
