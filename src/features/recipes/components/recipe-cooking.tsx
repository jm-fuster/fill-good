import { aiProvenanceAttrs } from "@/lib/ai/provenance";
import { formatQuantity, formatQuantityValue } from "@/lib/units";
import type { RecipeCooking } from "../queries";

type CookingIngredient = RecipeCooking["ingredients"][number];

/**
 * La cantidad de un ingrediente en palabras. Sin cantidad se dice «al gusto» y no
 * se deja el hueco en blanco: en la sal y en el aceite de engrasar la ausencia de
 * número no es un dato que falte, es el dato.
 */
function amountLabel(ing: CookingIngredient): string {
  if (ing.quantity === null) return "al gusto";
  return ing.unit
    ? formatQuantity(ing.quantity, ing.unit)
    : formatQuantityValue(ing.quantity);
}

/**
 * Los ingredientes con su cantidad, en una lista. Se comparte con el modo
 * cocinado, que los enseña en su panel desplegable: son los mismos ingredientes
 * de la misma receta, y con dos listas una podría acabar diciendo «al gusto»
 * donde la otra deja el hueco en blanco.
 */
export function RecipeIngredientList({
  ingredients,
}: {
  ingredients: CookingIngredient[];
}) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {ingredients.map((ing, i) => (
        <li key={`${ing.name}-${i}`} className="flex gap-2">
          <span className="min-w-16 shrink-0 tabular-nums text-muted-foreground">
            {amountLabel(ing)}
          </span>
          <span className="min-w-0 flex-1">
            {ing.name}
            {ing.optional ? (
              <span className="text-muted-foreground"> (opcional)</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cómo se cocina un plato, en modo LECTURA: ingredientes con su cantidad y pasos
 * numerados. Sin ningún control, a propósito — se lee con las manos ocupadas—, y
 * sin estado propio, para poder pintarlo igual dentro del panel de un plato del
 * menú que en una página de servidor.
 *
 * Es la lectura de un vistazo; guiar paso a paso es el modo cocinado
 * (`cooking-mode.tsx`), que se abre desde aquí cuando la receta tiene pasos.
 *
 * Las cantidades son las de la receta, para SUS raciones (el rótulo lo dice
 * arriba). No se reescalan a las raciones del hogar: la app no tiene modelo de
 * sobras, y un número reescalado que nadie ha comprobado se lee igual de firme
 * que uno bueno.
 */
export function RecipeCookingDetails({ recipe }: { recipe: RecipeCooking }) {
  const servings =
    recipe.servings === 1 ? "1 ración" : `${recipe.servings} raciones`;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Para {servings}
        {recipe.prepMinutes !== null ? ` · ${recipe.prepMinutes} min` : ""}
      </p>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Ingredientes</h3>
        {recipe.ingredients.length > 0 ? (
          <RecipeIngredientList ingredients={recipe.ingredients} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Este plato no tiene ingredientes apuntados.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Pasos</h3>
        {recipe.steps.length > 0 ? (
          <ol
            className="flex flex-col gap-2 text-sm"
            {...aiProvenanceAttrs(recipe.stepsFromAi)}
          >
            {recipe.steps.map((step, i) => (
              // El número va `aria-hidden`: la posición dentro de una lista
              // ordenada ya la anuncia el lector de pantalla, y leerla dos veces
              // convierte cada paso en «uno, uno, pica la cebolla».
              <li key={`${i}-${step.slice(0, 12)}`} className="flex gap-2">
                <span
                  aria-hidden
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía nadie ha escrito cómo se hace.
          </p>
        )}
      </section>
    </div>
  );
}
