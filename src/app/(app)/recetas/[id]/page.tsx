import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { RecipeForm } from "@/features/recipes/components/recipe-form";
import { RecipeRating } from "@/features/recipes/components/recipe-rating";
import { CostBadge } from "@/features/recipes/components/cost-badge";
import {
  getRecipeCost,
  getRecipeForEdit,
  getRecipeRating,
} from "@/features/recipes/queries";
import { getStockByProduct } from "@/features/inventory/queries";
import { getProductCatalog } from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Editar receta" };

export default async function EditarRecetaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipeForEdit(id);
  if (!recipe) notFound();
  const [rating, cost, catalog, stock] = await Promise.all([
    getRecipeRating(id),
    getRecipeCost(id),
    getProductCatalog(),
    getStockByProduct(),
  ]);

  return (
    <PageContainer variant="default">
      <PageHeader
        title={recipe.name}
        backHref="/recetas"
        backLabel="Mis recetas"
        action={<CostBadge cost={cost} />}
      />
      <div className="mb-6">
        <RecipeRating
          recipeId={recipe.id}
          initialUserRating={rating.userRating}
          avg={rating.avg}
          count={rating.count}
        />
      </div>
      <RecipeForm recipe={recipe} catalog={catalog} stock={stock} />
    </PageContainer>
  );
}
