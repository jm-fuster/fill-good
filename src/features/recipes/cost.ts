/**
 * Cálculo PURO del coste estimado de una receta (M7): por ingrediente con
 * producto vinculado, último precio por unidad × cantidad, normalizando dentro
 * de la misma familia de unidad (g↔kg, ml↔l). Ingredientes sin precio, sin match
 * o con unidad de otra familia (p. ej. ud contra precio por kg) cuentan como
 * "sin precio": el total resultante es PARCIAL y nunca se presenta como total.
 */
import { baseUnitFactor, unitFamily } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

export type PriceInfo = { price: number; unit: UnitType };

export type CostIngredient = {
  productId: string | null;
  quantity: number | null;
  unit: UnitType | null;
};

export type RecipeCost = {
  /** Suma de los ingredientes con precio conocido. */
  total: number;
  /** Ingredientes con precio (numerador de la parcialidad). */
  pricedCount: number;
  /** Ingredientes totales (denominador). */
  totalCount: number;
  /** true solo si TODOS los ingredientes tienen precio (total = total real). */
  complete: boolean;
};

export function computeRecipeCost(
  ingredients: CostIngredient[],
  priceByProduct: ReadonlyMap<string, PriceInfo>,
): RecipeCost {
  let total = 0;
  let pricedCount = 0;
  const totalCount = ingredients.length;

  for (const ing of ingredients) {
    if (!ing.productId || ing.quantity == null || ing.unit == null) continue;
    const price = priceByProduct.get(ing.productId);
    if (!price) continue;
    // Sin conversión entre familias distintas (ud ↔ peso/volumen).
    if (unitFamily(price.unit) !== unitFamily(ing.unit)) continue;

    const pricePerBase = price.price / baseUnitFactor(price.unit);
    const qtyBase = ing.quantity * baseUnitFactor(ing.unit);
    total += pricePerBase * qtyBase;
    pricedCount += 1;
  }

  return {
    total,
    pricedCount,
    totalCount,
    complete: totalCount > 0 && pricedCount === totalCount,
  };
}
