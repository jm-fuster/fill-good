import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { computeInferredChains } from "./infer-chain";
import { computeChainSavings, type ChainSavingsTip } from "./chain-savings";

type Supabase = SupabaseClient<Database>;

/**
 * Recalcula y PERSISTE en `products` la cadena inferida (L15 f2) y el aviso de
 * ahorro (L15 f3) de los productos indicados. Antes se recomputaban en cada
 * render escaneando TODO el histórico; ahora estas señales solo se recalculan
 * cuando cambia el histórico (confirmar ticket, fusionar, cambiar preferencia)
 * y los renders leen la columna materializada.
 *
 * Lee SOLO el histórico de esos productos (`.in`), no todo el hogar. Reutiliza
 * las funciones neutras existentes (`computeInferredChains`, `computeChainSavings`)
 * — no duplica lógica. Best-effort: un fallo aquí NO debe romper la acción
 * llamante (la confirmación del ticket ya respondió al cliente).
 */
export async function refreshPriceInsights(
  supabase: Supabase,
  householdId: string,
  productIds: string[],
): Promise<void> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return;

  try {
    const [{ data: rows }, { data: products }] = await Promise.all([
      supabase
        .from("receipt_items")
        .select("product_id, total_price, quantity, store_chain")
        .in("product_id", ids)
        .not("product_id", "is", null)
        .not("total_price", "is", null)
        .not("store_chain", "is", null),
      supabase
        .from("products")
        .select("id, preferred_chain")
        .in("id", ids),
    ]);

    // Cadena manual por producto e inferida del histórico de esos productos.
    const manual = new Map(
      (products ?? []).map((p) => [p.id, p.preferred_chain]),
    );
    const inferred = computeInferredChains(rows ?? []);

    // Puntos de precio por producto (precio unitario = total / cantidad).
    const pointsByProduct = new Map<
      string,
      { unitPrice: number; storeChain: string }[]
    >();
    for (const r of rows ?? []) {
      if (!r.product_id || r.total_price === null || !r.store_chain) continue;
      const qty = Number(r.quantity) || 1;
      const point = {
        unitPrice: Number(r.total_price) / qty,
        storeChain: r.store_chain,
      };
      const arr = pointsByProduct.get(r.product_id);
      if (arr) arr.push(point);
      else pointsByProduct.set(r.product_id, [point]);
    }

    // Persistir por producto: cadena efectiva = manual ?? inferida (igual que
    // getChainSavingsTips). Escribimos TODOS los ids pedidos (incluidos los que
    // se quedan sin señal → null), para limpiar señales obsoletas.
    await Promise.all(
      ids.map((productId) => {
        const inferredChain = inferred.get(productId) ?? null;
        const effective = manual.get(productId) ?? inferredChain ?? null;
        let savingsTip: ChainSavingsTip | null = null;
        const points = pointsByProduct.get(productId);
        if (effective && points) {
          savingsTip = computeChainSavings(points, effective);
        }
        return supabase
          .from("products")
          .update({ inferred_chain: inferredChain, savings_tip: savingsTip })
          .eq("id", productId);
      }),
    );
  } catch (err) {
    console.error("refreshPriceInsights falló (best-effort):", err);
  }
}
