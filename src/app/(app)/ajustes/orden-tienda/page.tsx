import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { getStoreCategories } from "@/features/categories/queries";
import { StoreOrderEditor } from "@/features/categories/components/store-order-editor";

export const metadata: Metadata = { title: "Orden de la tienda" };

export default async function OrdenTiendaPage() {
  const categories = await getStoreCategories();

  return (
    <PageContainer>
      <PageHeader
        title="Orden de la tienda"
        description="Ordena los pasillos como en tu supermercado. La lista agrupada y el modo compra te mostrarán los productos en este orden."
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <StoreOrderEditor categories={categories} />
    </PageContainer>
  );
}
