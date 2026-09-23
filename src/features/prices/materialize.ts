import "server-only";

import { format, subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { baseUnitFactor, unitFamily } from "@/lib/units";
import { computeInferredChains } from "./infer-chain";
import { computeChainSavings, type ChainSavingsTip } from "./chain-savings";
import {
  computeReceiptSavings,
  NO_SAVINGS,
  SAVINGS_WINDOW_DAYS,
  type PricedLine,
  type ReceiptSavings,
} from "./savings";

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
    // Todas las compras de esos productos, de mil en mil (`fetchAllRows`): un
    // ticket de treinta productos habituales pasa de mil líneas de historial en
    // menos de un año, y cortado ahí el consejo de cadena salía de las compras
    // más viejas.
    const [{ data: rows, error: rowsErr }, { data: products, error: prodErr }] =
      await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from("receipt_items")
            .select("product_id, total_price, quantity, unit, store_chain")
            .eq("household_id", householdId)
            .in("product_id", ids)
            .not("product_id", "is", null)
            .not("total_price", "is", null)
            .not("store_chain", "is", null)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        supabase
          .from("products")
          .select("id, preferred_chain")
          .eq("household_id", householdId)
          .in("id", ids),
      ]);
    // Sin esto, una lectura fallida se leía como «no hay historial» y la
    // escritura de abajo —que pone TODOS los ids pedidos, con null si no hay
    // señal— borraba la cadena inferida y el consejo de ahorro que había.
    if (rowsErr || prodErr) throw rowsErr ?? prodErr;

    // Cadena manual por producto e inferida del histórico de esos productos.
    const manual = new Map(
      (products ?? []).map((p) => [p.id, p.preferred_chain]),
    );
    const inferred = computeInferredChains(rows ?? []);

    // Puntos de precio por unidad BASE (g/ml/ud), por producto Y familia de
    // unidad — la misma normalización que la hucha (savings.ts): total/cantidad
    // a secas mezclaba compras en g con compras en kg y el consejo de cadena se
    // materializaba a partir de un disparate.
    const pointsByProduct = new Map<
      string,
      Map<string, { unitPrice: number; storeChain: string }[]>
    >();
    for (const r of rows ?? []) {
      if (!r.product_id || r.total_price === null || !r.store_chain) continue;
      const qty = Number(r.quantity);
      const price = Number(r.total_price);
      if (!(qty > 0) || !(price > 0)) continue;
      const point = {
        unitPrice: price / (qty * baseUnitFactor(r.unit)),
        storeChain: r.store_chain,
      };
      const family = unitFamily(r.unit);
      const families =
        pointsByProduct.get(r.product_id) ??
        new Map<string, { unitPrice: number; storeChain: string }[]>();
      const arr = families.get(family);
      if (arr) arr.push(point);
      else families.set(family, [point]);
      pointsByProduct.set(r.product_id, families);
    }

    // Persistir por producto: cadena efectiva = manual ?? inferida. Escribimos
    // TODOS los ids pedidos (incluidos los que se quedan sin señal → null),
    // para limpiar señales obsoletas.
    await Promise.all(
      ids.map((productId) => {
        const inferredChain = inferred.get(productId) ?? null;
        const effective = manual.get(productId) ?? inferredChain ?? null;
        let savingsTip: ChainSavingsTip | null = null;
        // Con líneas en ud Y a peso hay varias series: manda la dominante
        // (más compras), igual que en los avisos de precio.
        let points: { unitPrice: number; storeChain: string }[] | undefined;
        for (const arr of pointsByProduct.get(productId)?.values() ?? []) {
          if (!points || arr.length > points.length) points = arr;
        }
        if (effective && points) {
          savingsTip = computeChainSavings(points, effective);
        }
        return supabase
          .from("products")
          .update({ inferred_chain: inferredChain, savings_tip: savingsTip })
          .eq("household_id", householdId)
          .eq("id", productId);
      }),
    );
  } catch (err) {
    console.error("refreshPriceInsights falló (best-effort):", err);
  }
}

/**
 * Saldo de ahorro del ticket que se está confirmando (G1), listo para persistir
 * en `receipts.savings_amount`. Carga la referencia de precio de SOLO los
 * productos del ticket (`.in`) y dentro de la ventana, no todo el histórico del
 * hogar.
 *
 * Dos filtros hacen todo el trabajo fino:
 *  · `receipt_id != el actual` → el ticket no se compara consigo mismo (si no, su
 *    propio precio arrastraría la referencia y el saldo tendería a cero).
 *  · `purchased_at < la fecha de compra` → solo cuentan compras ANTERIORES, así
 *    escanear hoy un ticket de hace meses se valora con los precios de entonces.
 *    Además, `purchased_at` solo se rellena al confirmar (ver confirmReceiptAction),
 *    así que este filtro ya excluye por construcción los tickets sin confirmar.
 *
 * Si algo falla, devuelve un saldo de 0 en vez de propagar: la confirmación del
 * ticket no puede caerse porque no hayamos podido calcular una cifra decorativa.
 */
export async function computeSavingsForReceipt(
  supabase: Supabase,
  {
    receiptId,
    householdId,
    purchasedAt,
    paid,
  }: {
    receiptId: string;
    householdId: string;
    purchasedAt: string | null;
    paid: PricedLine[];
  },
): Promise<ReceiptSavings> {
  const productIds = [...new Set(paid.map((l) => l.productId))];
  if (productIds.length === 0) return NO_SAVINGS;

  try {
    // Sin fecha de compra en el ticket, la ventana se ancla a hoy.
    const reference = purchasedAt ? new Date(purchasedAt) : new Date();
    if (Number.isNaN(reference.getTime())) return NO_SAVINGS;
    const windowStart = format(
      subDays(reference, SAVINGS_WINDOW_DAYS),
      "yyyy-MM-dd",
    );
    const windowEnd = format(reference, "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("receipt_items")
      .select("product_id, total_price, quantity, unit")
      .eq("household_id", householdId)
      .in("product_id", productIds)
      .neq("receipt_id", receiptId)
      .not("total_price", "is", null)
      .gte("purchased_at", windowStart)
      .lt("purchased_at", windowEnd);
    if (error) throw error;

    const history: PricedLine[] = (data ?? []).flatMap((r) =>
      r.product_id
        ? [
            {
              productId: r.product_id,
              totalPrice: r.total_price === null ? null : Number(r.total_price),
              quantity: Number(r.quantity),
              unit: r.unit,
            },
          ]
        : [],
    );

    return computeReceiptSavings(paid, history);
  } catch (err) {
    console.error("computeSavingsForReceipt falló (best-effort):", err);
    return NO_SAVINGS;
  }
}
