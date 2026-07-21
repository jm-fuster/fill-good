import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { RecipeForm } from "@/features/recipes/components/recipe-form";

export const metadata: Metadata = { title: "Nueva receta" };

export default function NuevaRecetaPage() {
  return (
    <PageContainer variant="default">
      <Link
        href="/recetas"
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Mis recetas
      </Link>
      <h1 className="mb-1 font-heading text-2xl font-semibold tracking-tight text-balance">
        Nueva receta
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Añade los datos del plato y sus ingredientes.
      </p>
      <RecipeForm />
    </PageContainer>
  );
}
