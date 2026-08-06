import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChefHat } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <PageContainer>
      <PageHeader
        title={recipe.name}
        backHref="/recetas"
        backLabel="Mis recetas"
        action={
          <div className="flex items-center gap-2">
            {/*
              Cocinar es lo único que se hace con una receta además de editarla,
              y esta página es un formulario largo: sin el botón aquí arriba, la
              única puerta al modo cocinado pasaba por el menú, o sea que quien
              cocina algo que no había planificado no tenía ninguna. Solo con
              pasos escritos, que es lo que el modo va guiando.
            */}
            {recipe.steps.length > 0 ? (
              <Button asChild variant="outline" size="icon" aria-label="Cocinar paso a paso">
                <Link href={`/recetas/${recipe.id}/cocinar`}>
                  <ChefHat aria-hidden />
                </Link>
              </Button>
            ) : null}
            <CostBadge cost={cost} />
          </div>
        }
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
