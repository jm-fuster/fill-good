import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/features/household/queries";
import type { UnitType } from "@/lib/supabase/types";

/**
 * Avisos de precio sobre productos habituales (M3). Dos señales proactivas
 * calculadas SOLO con los tickets del hogar, deterministas (sin IA, sin tabla
 * nueva, sin cron): se recalculan en el Server Component de /precios.
 *
 *  · "up"   — el último precio ha subido ≥ RISE_THRESHOLD sobre la mediana de las
 *             últimas compras anteriores. Color de UI: warning.
 *  · "good" — el último precio conocido está en el percentil 25 más barato o por
 *             debajo. Color de UI: success.
 *
 * Se compara el precio por unidad (total/cantidad, el mismo que muestra la
 * gráfica de detalle a la que enlaza el aviso), nunca el total de la línea.
 */

export const MIN_PURCHASES = 3;
/** Compras anteriores mínimas para evaluar una subida (además de la última). */
export const MIN_PRIOR_FOR_RISE = 3;
/** Ventana de compras anteriores para la mediana de referencia. */
export const RISE_WINDOW = 5;
/** Umbral estricto de subida (10%). */
export const RISE_THRESHOLD = 0.1;
/** Percentil por debajo del cual el último precio se considera "buen precio". */
export const GOOD_PERCENTILE = 25;

export type PriceAlert = {
  productId: string;
  productName: string;
  kind: "up" | "good";
  /** % de subida (kind "up") o % por debajo de lo habitual (kind "good"). */
  pct: number;
  unit: UnitType;
};

type Row = {
  product_id: string | null;
  total_price: number | null;
  quantity: number;
  unit: UnitType;
  purchased_at: string | null;
  product: { name: string } | null;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Percentil por interpolación lineal (p en 0..100). */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export async function getPriceAlerts(): Promise<PriceAlert[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipt_items")
    .select(
      "product_id, total_price, quantity, unit, purchased_at, product:products!receipt_items_product_id_fkey(name)",
    )
    .eq("household_id", householdId)
    .not("product_id", "is", null)
    .not("total_price", "is", null)
    .not("purchased_at", "is", null)
    .order("purchased_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];

  // Serie de precio por unidad por producto, en orden cronológico.
  type Series = { name: string; unit: UnitType; prices: number[] };
  const byProduct = new Map<string, Series>();
  for (const r of rows) {
    if (!r.product_id || r.total_price === null) continue;
    const qty = Number(r.quantity) || 1;
    const unitPrice = Number(r.total_price) / qty;
    if (!(unitPrice > 0)) continue;
    const s = byProduct.get(r.product_id);
    if (s) {
      s.prices.push(unitPrice);
      s.unit = r.unit;
    } else {
      byProduct.set(r.product_id, {
        name: r.product?.name ?? "Producto",
        unit: r.unit,
        prices: [unitPrice],
      });
    }
  }

  const alerts: PriceAlert[] = [];
  for (const [productId, s] of byProduct) {
    if (s.prices.length < MIN_PURCHASES) continue;
    const latest = s.prices[s.prices.length - 1];
    const prior = s.prices.slice(0, -1);

    // Subida: último ≥ +10% sobre la mediana de las últimas RISE_WINDOW anteriores.
    if (prior.length >= MIN_PRIOR_FOR_RISE) {
      const ref = median(prior.slice(-RISE_WINDOW));
      if (ref > 0 && latest >= ref * (1 + RISE_THRESHOLD)) {
        alerts.push({
          productId,
          productName: s.name,
          kind: "up",
          pct: Math.round((latest / ref - 1) * 100),
          unit: s.unit,
        });
        continue; // subida y buen precio son excluyentes
      }
    }

    // Buen precio: último ≤ percentil 25 del histórico Y estrictamente por
    // debajo de la mediana. La condición estricta evita falsos positivos con
    // histórico plano (donde p25 == último == mediana). Se exige además ≥1% por
    // debajo para no avisar por ruido de redondeo.
    const p25 = percentile(s.prices, GOOD_PERCENTILE);
    const ref = median(s.prices);
    if (p25 > 0 && ref > 0 && latest <= p25 && latest < ref) {
      const pct = Math.round((1 - latest / ref) * 100);
      if (pct >= 1) {
        alerts.push({
          productId,
          productName: s.name,
          kind: "good",
          pct,
          unit: s.unit,
        });
      }
    }
  }

  // Subidas primero (más accionables), luego por magnitud.
  return alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "up" ? -1 : 1;
    return b.pct - a.pct;
  });
}
