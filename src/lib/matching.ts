import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeName } from "@/lib/normalize";
import type { Database } from "@/lib/supabase/types";

export type MatchResult = {
  productId: string | null;
  matchStatus: "auto" | "new_product";
};

/**
 * Empareja una línea de ticket con un producto del catálogo:
 * 1) alias aprendido (por el texto crudo) → coincidencia automática
 * 2) nombre normalizado idéntico → coincidencia automática
 * 3) sin match → producto nuevo (el usuario lo revisa)
 */
export async function matchProduct(
  supabase: SupabaseClient<Database>,
  householdId: string,
  rawText: string | null,
  description: string,
): Promise<MatchResult> {
  const aliasKey = normalizeName(rawText || description);
  if (aliasKey) {
    const { data: alias } = await supabase
      .from("product_aliases")
      .select("product_id")
      .eq("household_id", householdId)
      .eq("alias_normalized", aliasKey)
      .maybeSingle();
    if (alias) return { productId: alias.product_id, matchStatus: "auto" };
  }

  const descKey = normalizeName(description);
  if (descKey) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("household_id", householdId)
      .eq("normalized_name", descKey)
      .maybeSingle();
    if (product) return { productId: product.id, matchStatus: "auto" };
  }

  return { productId: null, matchStatus: "new_product" };
}
