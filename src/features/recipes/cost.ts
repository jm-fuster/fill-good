/**
 * Cálculo PURO del coste estimado de una receta (M7): por ingrediente con
 * producto vinculado, último precio por unidad × cantidad, convertido a la unidad
 * del precio. La conversión es exacta dentro de la familia (g↔kg, ml↔l) y, entre
 * 'ud' y una medida, usa el contenido declarado del envase: una receta con 300 ml
 * de caldo ya sabe costear un producto que se compra por bricks de 500 ml.
 *
 * Ingredientes sin precio, sin match o que sigan sin poder convertirse (ud contra
 * un precio por kg sin contenido declarado) cuentan como "sin precio": el total
 * resultante es PARCIAL y nunca se presenta como total.
 */
import { convertQuantity, type UnitContent } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

export type PriceInfo = {
  price: number;
  unit: UnitType;
  /** Contenido por unidad del producto; permite costear ud↔medida. */
  content?: UnitContent;
};

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
    // La cantidad del ingrediente se lleva a la unidad del precio. null = no hay
    // forma honesta de convertir (familias distintas sin contenido declarado).
    const qtyInPriceUnit = convertQuantity(
      ing.quantity,
      ing.unit,
      price.unit,
      price.content ?? null,
    );
    if (qtyInPriceUnit === null) continue;

    total += price.price * qtyInPriceUnit;
    pricedCount += 1;
  }

  return {
    total,
    pricedCount,
    totalCount,
    complete: totalCount > 0 && pricedCount === totalCount,
  };
}
