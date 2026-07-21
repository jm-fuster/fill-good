import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { MenuSectionTabs } from "@/components/layout/menu-section-tabs";
import { RecipesList } from "@/features/recipes/components/recipes-list";
import {
  getRecipeSignals,
  getSavedRecipes,
  type RecipeSignals,
} from "@/features/recipes/queries";
import { getCurrentHousehold } from "@/features/household/queries";

export const metadata: Metadata = { title: "Mis recetas" };

export default async function RecetasPage() {
  const [recipes, household] = await Promise.all([
    getSavedRecipes(),
    getCurrentHousehold(),
  ]);
  const signalsList = household ? await getRecipeSignals(household.id) : [];
  const signals: Record<string, RecipeSignals> = Object.fromEntries(
    signalsList.map((s) => [s.recipeId, s]),
  );

  return (
    <>
      <PageHeader
        title="Mis recetas"
        description="El recetario de tu hogar para planificar los menús."
        action={
          <Button asChild size="icon" aria-label="Nueva receta">
            <Link href="/recetas/nueva">
              <Plus aria-hidden />
            </Link>
          </Button>
        }
      />

      <div className="mb-6">
        <MenuSectionTabs active="recetario" />
      </div>

      {recipes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aún no tienes recetas"
          description="Añade las recetas de tu hogar para que los menús las tengan en cuenta. También puedes guardar las que genere la IA."
          action={
            <Button asChild>
              <Link href="/recetas/nueva">
                <Plus aria-hidden /> Añade tu primera receta
              </Link>
            </Button>
          }
        />
      ) : (
        <RecipesList recipes={recipes} signals={signals} />
      )}
    </>
  );
}
