import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { RecipeForm } from "@/features/recipes/components/recipe-form";
import { RecipeRating } from "@/features/recipes/components/recipe-rating";
import { getRecipeForEdit, getRecipeRating } from "@/features/recipes/queries";

export const metadata: Metadata = { title: "Editar receta" };

export default async function EditarRecetaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipeForEdit(id);
  if (!recipe) notFound();
  const rating = await getRecipeRating(id);

  return (
    <PageContainer variant="default">
      <Link
        href="/recetas"
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Mis recetas
      </Link>
      <h1 className="mb-6 font-heading text-2xl font-semibold tracking-tight text-balance">
        {recipe.name}
      </h1>
      <div className="mb-6">
        <RecipeRating
          recipeId={recipe.id}
          initialUserRating={rating.userRating}
          avg={rating.avg}
          count={rating.count}
        />
      </div>
      <RecipeForm recipe={recipe} />
    </PageContainer>
  );
}
