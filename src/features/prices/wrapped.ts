import "server-only";

import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { roundCents } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { compareTripToReceipt } from "@/features/shopping-list/trip-comparison";
import { getMonthlySpending, getWasteInsight } from "./spending";

/**
 * Resumen mensual (G4): el envoltorio que empaqueta las tres mecánicas —hucha,
 * compra perfecta y desperdicio— en una sola pantalla al cerrar el mes.
 *
 * Todo son agregaciones sobre datos que ya existen: CERO coste de IA, que es
 * requisito del proyecto (Gemini free tier). Reutiliza `getMonthlySpending` y
 * `getWasteInsight` en vez de recalcular: comparten `getLatestUnitPrices`, que
 * está envuelta en `cache()`, así que el histórico de precios se lee una vez.
 *
 * Cada bloque se omite cuando no hay dato con el que sostenerlo. Un resumen que
 * rellena huecos con ceros y frases genéricas se lee como un formulario, no como
 * un resumen del mes.
 */

export type WrappedHighlight = { label: string; value: number };

export type MonthlyWrapped = {
  month: string;
  monthLabel: string;
  prevMonth: string;
  /** null si el mes objetivo ya es el actual (no hay "siguiente" navegable). */
  nextMonth: string | null;
  /** Falso = el mes no tiene ni una compra confirmada; la pantalla lo dice y ya. */
  hasData: boolean;

  spentTotal: number;
  /** spentTotal − mes anterior. Negativo = has gastado menos. */
  spentDelta: number;
  receiptCount: number;

  /** Lo que el mes aportó a la hucha (descuentos + precio). Puede ser negativo. */
  savingsTotal: number;
  /** Producto en el que más se gastó. */
  topProduct: WrappedHighlight | null;
  /** Cadena que más aportó a la hucha; null si ninguna aportó nada. */
  bestChain: WrappedHighlight | null;

  wastedTotal: number;
  /** wastedTotal − media habitual; null sin histórico suficiente. */
  wastedVsAverage: number | null;

  /** Compras cerradas desde la lista que se emparejaron con un ticket. */
  tripsMatched: number;
  /** De esas, cuántas no tuvieron ni un producto fuera de lista. */
  tripsPerfect: number;
  /** El extra que más veces se repitió en el mes. */
  topExtra: WrappedHighlight | null;
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function getMonthlyWrapped(
  month?: string,
): Promise<MonthlyWrapped | null> {
  const [spending, waste] = await Promise.all([
    getMonthlySpending(month),
    getWasteInsight(),
  ]);
  if (!spending) return null;

  const supabase = createServerSupabaseClient();
  const monthStart = parseISO(`${spending.month}-01`);
  const nextStart = addMonths(monthStart, 1);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const nextStartStr = format(nextStart, "yyyy-MM-dd");

  const [{ data: itemRows }, { data: tripRows }] = await Promise.all([
    supabase
      .from("receipt_items")
      // 2 FKs a products → hay que nombrar la relación o PostgREST da PGRST201.
      .select(
        "product_id, total_price, product:products!receipt_items_product_id_fkey(name)",
      )
      .not("product_id", "is", null)
      .not("total_price", "is", null)
      .gte("purchased_at", monthStartStr)
      .lt("purchased_at", nextStartStr),
    supabase
      .from("shopping_trips")
      .select("id, product_ids, receipt_id")
      .not("receipt_id", "is", null)
      .gte("closed_at", monthStartStr)
      .lt("closed_at", nextStartStr),
  ]);

  // Producto estrella: en el que más dinero se fue este mes.
  type ItemRow = {
    product_id: string | null;
    total_price: number | null;
    product: { name: string } | null;
  };
  const spentByProduct = new Map<string, number>();
  for (const it of (itemRows ?? []) as unknown as ItemRow[]) {
    const name = it.product?.name;
    if (!name) continue;
    spentByProduct.set(
      name,
      (spentByProduct.get(name) ?? 0) + (Number(it.total_price) || 0),
    );
  }
  const topProductEntry = [...spentByProduct.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];
  const topProduct = topProductEntry
    ? { label: topProductEntry[0], value: roundCents(topProductEntry[1]) }
    : null;

  // Compras perfectas y caprichos: se recalculan desde los snapshots en vez de
  // guardarse al confirmar, porque así una mejora futura del emparejamiento se
  // refleja también en los meses ya pasados.
  const trips = tripRows ?? [];
  const receiptIds = trips
    .map((t) => t.receipt_id)
    .filter((id): id is string => id !== null);

  let tripsPerfect = 0;
  const extraCounts = new Map<string, number>();

  if (receiptIds.length > 0) {
    const { data: boughtRows } = await supabase
      .from("receipt_items")
      .select(
        "receipt_id, product_id, description, product:products!receipt_items_product_id_fkey(name)",
      )
      .in("receipt_id", receiptIds)
      .not("product_id", "is", null);

    type BoughtRow = {
      receipt_id: string;
      product_id: string;
      description: string;
      product: { name: string } | null;
    };
    const byReceipt = new Map<string, BoughtRow[]>();
    for (const r of (boughtRows ?? []) as unknown as BoughtRow[]) {
      const arr = byReceipt.get(r.receipt_id);
      if (arr) arr.push(r);
      else byReceipt.set(r.receipt_id, [r]);
    }

    for (const trip of trips) {
      if (!trip.receipt_id) continue;
      const bought = byReceipt.get(trip.receipt_id) ?? [];
      const comparison = compareTripToReceipt(
        trip.product_ids ?? [],
        bought.map((b) => ({
          productId: b.product_id,
          // El nombre del catálogo agrupa mejor entre compras que la descripción
          // del ticket, que varía de una tienda a otra.
          label: b.product?.name ?? b.description,
        })),
      );
      if (comparison.perfect) tripsPerfect += 1;
      for (const extra of comparison.extras) {
        extraCounts.set(extra, (extraCounts.get(extra) ?? 0) + 1);
      }
    }
  }

  // Solo cuenta como "capricho" lo que se repite: una compra puntual fuera de
  // lista es la vida normal, no un patrón sobre el que valga la pena hablar.
  const topExtraEntry = [...extraCounts.entries()]
    .filter(([, times]) => times >= 2)
    .sort((a, b) => b[1] - a[1])[0];
  const topExtra = topExtraEntry
    ? { label: topExtraEntry[0], value: topExtraEntry[1] }
    : null;

  const bestChainEntry = spending.savingsByChain.find((c) => c.total > 0);
  const bestChain = bestChainEntry
    ? { label: bestChainEntry.label, value: bestChainEntry.total }
    : null;

  const today = new Date();
  const canGoForward = nextStart <= startOfMonth(today);

  return {
    month: spending.month,
    monthLabel: cap(format(monthStart, "LLLL yyyy", { locale: es })),
    prevMonth: format(subMonths(monthStart, 1), "yyyy-MM"),
    nextMonth: canGoForward ? format(nextStart, "yyyy-MM") : null,
    hasData: spending.receiptCount > 0,

    spentTotal: roundCents(spending.total),
    spentDelta: roundCents(spending.delta),
    receiptCount: spending.receiptCount,

    savingsTotal: spending.savingsTotal,
    topProduct,
    bestChain,

    wastedTotal: roundCents(spending.discardedTotal),
    wastedVsAverage:
      waste?.monthlyAverage != null
        ? roundCents(spending.discardedTotal - waste.monthlyAverage)
        : null,

    tripsMatched: trips.length,
    tripsPerfect,
    topExtra,
  };
}
