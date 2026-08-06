import "server-only";

import { normalizeName } from "@/lib/normalize";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInventory } from "@/features/inventory/queries";
import { getProductCatalog } from "@/features/shopping-list/queries";
import { computeMissingIngredients, type MissingCandidate } from "./missing";

/**
 * El lado con I/O de «qué falta para cocinar esto»: reúne despensa, catálogo y
 * lista activa, y se lo da al cálculo puro de `missing.ts`.
 *
 * Vive aquí, en un módulo aparte, porque lo piden TRES sitios que tienen que
 * contestar exactamente lo mismo: «añadir a la lista lo que falte» del menú, el
 * mismo botón para una sola receta, y el repaso de ingredientes con el que
 * arranca el modo cocinado. Si cada uno reuniera los datos por su cuenta, el
 * modo cocinado podría decir «te falta comino» y la lista no apuntarlo, o al
 * revés — que es justo el desacuerdo que `check:menu` vigila entre el menú y la
 * lista, aquí extendido a la tercera pantalla.
 *
 * No filtra por receta guardada ni efímera: se cocina igual.
 */
export async function computeMissingForRecipes(
  householdId: string,
  listId: string,
  recipeIds: string[],
): Promise<MissingCandidate[]> {
  if (recipeIds.length === 0) return [];
  const supabase = createServerSupabaseClient();

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("name, quantity, unit, product_id")
    .eq("household_id", householdId)
    .in("recipe_id", recipeIds);

  const [inventory, catalog] = await Promise.all([
    getInventory(),
    getProductCatalog(),
  ]);

  // Stock real: suma por producto > 0 (no basta con que exista la fila).
  const stockByProduct = new Map<string, number>();
  for (const i of inventory) {
    stockByProduct.set(
      i.productId,
      (stockByProduct.get(i.productId) ?? 0) + i.quantity,
    );
  }
  const stockProductIds = new Set<string>();
  for (const [pid, qty] of stockByProduct) {
    if (qty > 0) stockProductIds.add(pid);
  }
  const stockNames = new Set<string>();
  for (const i of inventory) {
    if (i.quantity > 0) stockNames.add(normalizeName(i.productName));
  }

  // Lo que ya está en la lista activa (por producto y por nombre).
  const { data: listItems } = await supabase
    .from("shopping_list_items")
    .select("name, product_id")
    .eq("household_id", householdId)
    .eq("list_id", listId);
  const listProductIds = new Set<string>();
  const listNames = new Set<string>();
  for (const it of listItems ?? []) {
    if (it.product_id) listProductIds.add(it.product_id);
    listNames.add(normalizeName(it.name));
  }

  return computeMissingIngredients({
    ingredients: (ingredients ?? []).map((i) => ({
      name: i.name,
      productId: i.product_id,
      unit: i.unit,
    })),
    catalog: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      normalizedName: c.normalizedName,
      defaultUnit: c.defaultUnit,
    })),
    stockProductIds,
    stockNames,
    listProductIds,
    listNames,
  });
}
