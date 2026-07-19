import type { Metadata } from "next";
import { Package } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Inventario" };

export default function InventarioPage() {
  return (
    <>
      <PageHeader
        title="Inventario"
        description="Tu despensa, nevera y congelador."
      />
      <EmptyState
        icon={Package}
        title="Aún no hay productos"
        description="Cuando añadas productos o escanees un ticket, tu inventario aparecerá aquí organizado por ubicación."
      />
    </>
  );
}
