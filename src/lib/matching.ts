import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeName } from "@/lib/normalize";
import { aliasKeyFor } from "@/lib/receipt-label";
import {
  DEFAULT_FUZZY_THRESHOLD,
  MIN_FUZZY_LENGTH,
  trigramSimilarity,
} from "@/lib/similarity";
import type { Database } from "@/lib/supabase/types";

export type MatchStatus = "auto" | "new_product";

export type MatchResult = {
  productId: string | null;
  matchStatus: MatchStatus;
};

/** Catálogo + aliases del hogar, cargados UNA sola vez por ticket. */
export type HouseholdMatchData = {
  products: { id: string; normalizedName: string }[];
  aliases: { productId: string; aliasNormalized: string }[];
};

/**
 * Umbral para PROPONER candidatos fuzzy en la revisión (nunca auto-asocia).
 * Calibrado con el 0,4 compartido (D3/E2); ajustar con tickets reales.
 */
export const SUGGEST_THRESHOLD = DEFAULT_FUZZY_THRESHOLD;

/**
 * Carga catálogo + aliases del hogar una sola vez (antes se hacían 2 queries por
 * línea del ticket). La RLS ya restringe al hogar; el filtro explícito es defensa.
 */
export async function loadHouseholdMatchData(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<HouseholdMatchData> {
  const [{ data: products }, { data: aliases }] = await Promise.all([
    supabase
      .from("products")
      .select("id, normalized_name")
      .eq("household_id", householdId),
    supabase
      .from("product_aliases")
      .select("product_id, alias_normalized")
      .eq("household_id", householdId),
  ]);
  return {
    products: (products ?? []).map((p) => ({
      id: p.id,
      normalizedName: p.normalized_name,
    })),
    aliases: (aliases ?? []).map((a) => ({
      productId: a.product_id,
      aliasNormalized: a.alias_normalized,
    })),
  };
}

/**
 * Match EXACTO para asociar automáticamente en el escaneo. Precedencia fija:
 *   1. alias aprendido idéntico → auto
 *   2. nombre normalizado idéntico → auto
 *   3. sin match → producto nuevo (el usuario decide en la revisión)
 * NUNCA usa fuzzy: el fuzzy solo SUGIERE (ver `suggestCandidates`).
 */
export function matchLineExact(
  data: HouseholdMatchData,
  rawText: string | null,
  description: string,
): MatchResult {
  // `aliasKeyFor` y no `normalizeName`: el texto impreso trae el peso y el
  // importe de ESA compra, y con ellos dentro la clave nunca vuelve a coincidir
  // (ver `lib/receipt-label.ts`). Tiene que ser la misma función con la que se
  // guardó el alias al confirmar el ticket.
  const aliasKey = aliasKeyFor(rawText || description);
  if (aliasKey) {
    const alias = data.aliases.find((a) => a.aliasNormalized === aliasKey);
    if (alias) return { productId: alias.productId, matchStatus: "auto" };
  }
  const descKey = normalizeName(description);
  if (descKey) {
    const product = data.products.find((p) => p.normalizedName === descKey);
    if (product) return { productId: product.id, matchStatus: "auto" };
  }
  return { productId: null, matchStatus: "new_product" };
}

export type ProductCandidate = { productId: string; score: number };

/**
 * Candidatos fuzzy (por trigramas) para una línea sin match exacto, comparando
 * el texto crudo y la descripción contra los nombres normalizados de productos
 * Y los aliases aprendidos del hogar. Devuelve top-N por score (mejor por
 * producto) por encima de `threshold`.
 *
 * NUNCA auto-asocia: es una SUGERENCIA para la revisión que el usuario confirma
 * con un toque (esa confirmación aprende el alias). Así "GAZPACHO HACEND."
 * casa aunque el alias aprendido fuera "GAZPACHO HACEND".
 */
export function suggestCandidates(
  data: HouseholdMatchData,
  rawText: string | null,
  description: string,
  { threshold = SUGGEST_THRESHOLD, topN = 3 }: { threshold?: number; topN?: number } = {},
): ProductCandidate[] {
  // El texto impreso entra recortado (sin peso ni importe): comparar
  // "platano canario 0,990 kg x 2,29 €/kg c 2,27 €" contra "platano canario"
  // hundía la similitud de trigramas con ruido que no dice nada del producto.
  const keys = [aliasKeyFor(rawText || ""), normalizeName(description)].filter(
    (k) => k.length >= MIN_FUZZY_LENGTH,
  );
  if (keys.length === 0) return [];

  const bestByProduct = new Map<string, number>();
  const consider = (productId: string, target: string) => {
    if (target.length < MIN_FUZZY_LENGTH) return;
    let score = 0;
    for (const k of keys) score = Math.max(score, trigramSimilarity(k, target));
    if (score < threshold) return;
    if (score > (bestByProduct.get(productId) ?? 0)) {
      bestByProduct.set(productId, score);
    }
  };

  for (const p of data.products) consider(p.id, p.normalizedName);
  for (const a of data.aliases) consider(a.productId, a.aliasNormalized);

  return [...bestByProduct.entries()]
    .map(([productId, score]) => ({ productId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
