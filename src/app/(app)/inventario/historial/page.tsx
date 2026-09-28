import type { Metadata } from "next";
import { RotateCcwClock } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { InventoryHistory } from "@/features/inventory/components/inventory-history";
import { getInventoryHistory } from "@/features/inventory/queries";

export const metadata: Metadata = { title: "Historial de movimientos" };

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ events, nowMs }, { q }] = await Promise.all([
    getInventoryHistory(),
    searchParams,
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Movimientos de los últimos 30 días"
        backHref="/inventario"
        backLabel="Inventario"
      />

      {events.length === 0 ? (
        <EmptyState
          icon={RotateCcwClock}
          title="Aún no hay movimientos"
          description="Cuando gastes, tires o repongas productos, verás aquí el registro con la fecha y quién lo hizo."
        />
      ) : (
        <InventoryHistory events={events} nowMs={nowMs} initialQuery={q ?? ""} />
      )}
    </PageContainer>
  );
}
