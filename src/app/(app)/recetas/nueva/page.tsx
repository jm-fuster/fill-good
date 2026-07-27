import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { RecipeForm } from "@/features/recipes/components/recipe-form";
import { getStockByProduct } from "@/features/inventory/queries";
import { getProductCatalog } from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Nueva receta" };

export default async function NuevaRecetaPage() {
  const [catalog, stock] = await Promise.all([
    getProductCatalog(),
    getStockByProduct(),
  ]);
  return (
    <PageContainer>
      <PageHeader
        title="Nueva receta"
        description="Añade los datos del plato y sus ingredientes."
        backHref="/recetas"
        backLabel="Mis recetas"
      />
      <RecipeForm catalog={catalog} stock={stock} />
    </PageContainer>
  );
}
