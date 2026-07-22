import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { InventoryHistory } from "@/features/inventory/components/inventory-history";
import { getInventoryHistory } from "@/features/inventory/queries";

export const metadata: Metadata = { title: "Historial de movimientos" };

export default async function HistorialPage() {
  const { events, nowMs } = await getInventoryHistory();

  return (
    <PageContainer variant="default">
      <Link
        href="/inventario"
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Inventario
      </Link>
      <h1 className="mb-1 font-heading text-2xl font-semibold tracking-tight text-balance">
        Historial de movimientos
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Lo que se ha consumido, tirado y repuesto en los últimos 30 días.
      </p>

      {events.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aún no hay movimientos"
          description="Cuando gastes, tires o repongas productos, verás aquí el registro con la fecha y quién lo hizo."
        />
      ) : (
        <InventoryHistory events={events} nowMs={nowMs} />
      )}
    </PageContainer>
  );
}
