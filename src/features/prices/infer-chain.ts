/**
 * Inferencia de la tienda habitual de un producto (L15, fase 2) a partir del
 * histórico de tickets. Módulo neutro (sin I/O) para poder testearlo y usarlo en
 * cualquier frontera. La preferencia MANUAL (products.preferred_chain) siempre
 * gana; esto solo se usa cuando no hay preferencia manual.
 *
 * Regla ESTRICTA para no equivocarse: solo se infiere una cadena si hay ≥3
 * compras con cadena real (se ignoran null y "otro", que no son una preferencia),
 * la cadena dominante supone al menos el 60% de esas compras y va estrictamente
 * por delante de la segunda. Ante la duda, null (mejor sin pista que una mala).
 */

export const INFER_MIN_PURCHASES = 3;
export const INFER_DOMINANCE = 0.6;

/**
 * Cadena inferida de una lista de cadenas de compra (una por línea de ticket del
 * producto), o null si no hay señal suficiente. `null`/`"otro"` no cuentan.
 */
export function computeInferredChain(chains: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const c of chains) {
    if (!c || c === "otro") continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
    total += 1;
  }
  if (total < INFER_MIN_PURCHASES) return null;

  let topChain: string | null = null;
  let topCount = 0;
  let secondCount = 0;
  for (const [chain, count] of counts) {
    if (count > topCount) {
      secondCount = topCount;
      topChain = chain;
      topCount = count;
    } else if (count > secondCount) {
      secondCount = count;
    }
  }

  if (topChain === null) return null;
  if (topCount === secondCount) return null; // empate → ambiguo
  if (topCount / total < INFER_DOMINANCE) return null;
  return topChain;
}

/**
 * Versión por lotes: agrupa las líneas de ticket por producto y devuelve el mapa
 * productId → cadena inferida (solo los productos con inferencia clara).
 */
export function computeInferredChains(
  rows: { product_id: string | null; store_chain: string | null }[],
): Map<string, string> {
  const byProduct = new Map<string, (string | null)[]>();
  for (const r of rows) {
    if (!r.product_id) continue;
    const arr = byProduct.get(r.product_id);
    if (arr) arr.push(r.store_chain);
    else byProduct.set(r.product_id, [r.store_chain]);
  }

  const result = new Map<string, string>();
  for (const [productId, chains] of byProduct) {
    const inferred = computeInferredChain(chains);
    if (inferred) result.set(productId, inferred);
  }
  return result;
}
