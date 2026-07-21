import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LineChart } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { getPriceOverview } from "@/features/prices/queries";
import { getMonthlySpending } from "@/features/prices/spending";
import { SpendingPanel } from "@/features/prices/components/spending-panel";
import { UNIT_LABELS } from "@/lib/units";

export const metadata: Metadata = { title: "Precios" };

function euro(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

export default async function PreciosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const [rows, spending] = await Promise.all([
    getPriceOverview(),
    getMonthlySpending(mes),
  ]);

  return (
    <PageContainer variant="default">
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
          {spending ? <SpendingPanel data={spending} /> : null}

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
                    {euro(r.lastUnitPrice)}/{UNIT_LABELS[r.unit]}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-right">
                  <div>
                    <p className="font-medium tabular-nums">
                      {euro(r.totalSpent)}
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
