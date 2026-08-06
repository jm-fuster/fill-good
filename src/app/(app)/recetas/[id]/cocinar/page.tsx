import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChefHat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { CookingMode } from "@/features/recipes/components/cooking-mode";
import {
  getRecipeCookedCount,
  getRecipeForCooking,
  getRecipeRating,
} from "@/features/recipes/queries";
import { getMenuEntryForCooking } from "@/features/menus/queries";
import { computeMissingForRecipes } from "@/features/menus/missing-server";
import { getActiveHouseholdId } from "@/features/household/queries";
import { getActiveList } from "@/features/shopping-list/queries";
import { nowMs, todayLocalISO } from "@/lib/dates";

export const metadata: Metadata = { title: "Cocinar" };

/**
 * Modo cocinado a pantalla completa. Se entra desde el panel de un plato del
 * menú (llevando `entrada`, la entrada que se está cocinando), desde la tira de
 * «hoy» o desde la ficha de la receta, que cocina fuera de plan y no lleva nada.
 *
 * `entrada` viene de la URL, o sea que la escribe quien quiera:
 * `getMenuEntryForCooking` la valida contra el hogar activo y, además, se
 * comprueba que la entrada hable de ESTA receta. Sin lo segundo, pegar el id de
 * otro plato en la URL dejaría marcar como cocinado un plato distinto del que se
 * acaba de hacer — y la marca es de donde salen las veces cocinadas, el coste de
 * la semana y lo que el generador no repite.
 */
export default async function CocinarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entrada?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const recipe = await getRecipeForCooking(id);
  if (!recipe) notFound();

  const [rawEntry, timesCookedBefore, rating, householdId, list] =
    await Promise.all([
      sp.entrada ? getMenuEntryForCooking(sp.entrada) : Promise.resolve(null),
      getRecipeCookedCount(id),
      getRecipeRating(id),
      getActiveHouseholdId(),
      getActiveList(),
    ]);
  const entry = rawEntry && rawEntry.recipeId === id ? rawEntry : null;

  /*
    Lo que no está ni en la despensa ni apuntado, resuelto AQUÍ y no al abrir la
    pantalla: es lo primero que se lee del repaso de ingredientes, y un aviso de
    «te falta comino» que aparece tres segundos tarde llega cuando ya has pasado
    de pantalla. Sale de la misma cuenta que «añadir a la lista lo que falte»
    (`computeMissingForRecipes`), para que las dos pantallas no se contradigan.
  */
  const missing =
    householdId && list
      ? await computeMissingForRecipes(householdId, list.id, [id])
      : [];

  // Volver al menú solo si de ahí se vino. Una receta efímera no tiene ficha
  // (`/recetas/[id]` es solo para las guardadas), así que su salida es el menú.
  const backHref = entry || !recipe.isSaved ? "/menus" : `/recetas/${id}`;

  /*
    Sin pasos no hay nada que guiar. No es un 404 —la receta existe— sino el
    sitio donde se dice qué falta: las del pack curado y las que la IA inventó al
    planificar la semana nacen sin pasos, y escribirlos se hace en la ficha.

    Las puertas de entrada ya no ofrecen el modo en ese caso, así que aquí se
    llega tecleando la URL o porque alguien acaba de borrar los pasos desde otro
    móvil. Vale la pena contarlo igual: un callejón sin explicación se lee como
    que la app está rota.
  */
  if (recipe.steps.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title={recipe.name}
          description="Esta receta todavía no dice cómo se hace."
          backHref={backHref}
          backLabel={backHref === "/menus" ? "Menús" : "La receta"}
        />
        <p className="mb-4 text-sm text-muted-foreground">
          Para cocinarla paso a paso hacen falta sus pasos escritos. Puedes
          añadirlos a mano o pedírselos a la IA desde la receta.
        </p>
        {recipe.isSaved ? (
          <Button asChild>
            <Link href={`/recetas/${id}`}>
              <ChefHat aria-hidden />
              Escribir los pasos
            </Link>
          </Button>
        ) : null}
      </PageContainer>
    );
  }

  return (
    <CookingMode
      recipeId={id}
      recipe={recipe}
      entry={entry}
      // El «hoy» del SERVIDOR, el mismo con el que `toggleEntryCookedAction`
      // decide si un día ya ha pasado. Con el del dispositivo, un móvil en otra
      // zona horaria vería el botón de marcar justo cuando va a ser rechazado.
      today={todayLocalISO()}
      loadedAt={nowMs()}
      timesCookedBefore={timesCookedBefore}
      rating={rating}
      missing={missing}
      backHref={backHref}
    />
  );
}
