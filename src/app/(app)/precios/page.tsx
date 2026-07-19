import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Precios" };

export default function PreciosPage() {
  return (
    <>
      <PageHeader
        title="Precios"
        description="Evolución de precios de lo que compras."
      />
      <EmptyState
        icon={TrendingUp}
        title="Sin historial de precios"
        description="Cuando confirmes tickets escaneados, aquí verás cómo evoluciona el precio de cada producto y en qué supermercado compras más barato."
      />
    </>
  );
}
