import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Fab, fabButtonClass } from "@/components/layout/fab";
import { MenuSectionTabs } from "@/components/layout/menu-section-tabs";
import { RecipesList } from "@/features/recipes/components/recipes-list";
import { ExploreRecipes } from "@/features/recipes/components/explore-recipes";
import {
  getRecipeCostsForIds,
  getRecipeSignals,
  getSavedRecipes,
  getSeedRecipeCards,
  type RecipeSignals,
} from "@/features/recipes/queries";
import type { RecipeCost } from "@/features/recipes/cost";
import { getCurrentHousehold } from "@/features/household/queries";

export const metadata: Metadata = { title: "Mis recetas" };

export default async function RecetasPage() {
  const [recipes, household, seedCards] = await Promise.all([
    getSavedRecipes(),
    getCurrentHousehold(),
    getSeedRecipeCards(),
  ]);
  const [signalsList, costMap] = await Promise.all([
    household ? getRecipeSignals(household.id) : Promise.resolve([]),
    getRecipeCostsForIds(recipes.map((r) => r.id)),
  ]);
  const signals: Record<string, RecipeSignals> = Object.fromEntries(
    signalsList.map((s) => [s.recipeId, s]),
  );
  const costs: Record<string, RecipeCost> = Object.fromEntries(costMap);

  return (
    <PageContainer>
      <PageHeader
        title="Mis recetas"
        action={
          <Button asChild className="hidden md:inline-flex">
            <Link href="/recetas/nueva">
              <Plus aria-hidden />
              Nueva receta
            </Link>
          </Button>
        }
      />

      <div className="mb-6">
        <MenuSectionTabs active="recetario" />
      </div>

      <div className="flex flex-col gap-6">
        {recipes.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Aún no tienes recetas"
            description="Explora el pack de recetas de abajo para empezar, añade las tuyas o guarda las que genere la IA."
            action={
              <Button asChild>
                <Link href="/recetas/nueva">
                  <Plus aria-hidden /> Añade tu primera receta
                </Link>
              </Button>
            }
          />
        ) : (
          <RecipesList recipes={recipes} signals={signals} costs={costs} />
        )}

        <ExploreRecipes cards={seedCards} defaultOpen={recipes.length === 0} />
      </div>

      <Fab className="md:hidden">
        <Button
          asChild
          size="icon"
          aria-label="Nueva receta"
          className={fabButtonClass}
        >
          <Link href="/recetas/nueva">
            <Plus className="size-6" aria-hidden />
          </Link>
        </Button>
      </Fab>
    </PageContainer>
  );
}
