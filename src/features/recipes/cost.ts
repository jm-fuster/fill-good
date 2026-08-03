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
 *
 * El PACK sí se aplica aquí, al contrario que en `lineCostOf` de la lista, y la
 * diferencia no es un descuido: una receta pide lo que se echa a la olla (dos
 * sobres, 300 ml), mientras que una línea de la lista cuenta lo que se mete en el
 * carro (dos cajas). El precio del histórico es el de la compra, así que aquí hay
 * que bajarlo a la unidad y allí no.
 */
import {
  convertQuantity,
  pricePerPackUnit,
  type UnitContent,
} from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

export type PriceInfo = {
  /** Importe de una unidad DE COMPRA: con pack, el de la caja entera. */
  price: number;
  unit: UnitType;
  /** Contenido por unidad del producto; permite costear ud↔medida. */
  content?: UnitContent;
  /**
   * `products.pack_size`: unidades que trae cada compra. Sin él, costear «2 ud»
   * de un producto que se compra en cajas de 30 cobraba dos cajas.
   */
  packSize?: number | null;
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
  /**
   * Raciones a las que corresponde `total`: las de la receta, que son las de sus
   * cantidades. Viaja con el importe porque un coste sin saber para cuántos es
   * no se puede comparar con nada —ni con otra receta, ni con el presupuesto de
   * la semana—.
   */
  servings: number;
};

export function computeRecipeCost(
  ingredients: CostIngredient[],
  priceByProduct: ReadonlyMap<string, PriceInfo>,
  servings: number,
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

    // `qtyInPriceUnit` está en unidades de las de casa (el brick, el sobre), que
    // es lo que sabe convertir el contenido declarado. El precio, en cambio, es
    // el de la compra: en un pack hay que bajarlo a la unidad o se cobra la caja
    // entera por cada sobre. Sin pack, `pricePerPackUnit` devuelve null y el
    // precio se usa tal cual.
    const perUnit =
      pricePerPackUnit(price.price, price.unit, price.packSize ?? null) ??
      price.price;

    total += perUnit * qtyInPriceUnit;
    pricedCount += 1;
  }

  return {
    total,
    pricedCount,
    totalCount,
    complete: totalCount > 0 && pricedCount === totalCount,
    // Una receta sin raciones declaradas no puede dividir por cero: cuenta como 1.
    servings: servings > 0 ? servings : 1,
  };
}
