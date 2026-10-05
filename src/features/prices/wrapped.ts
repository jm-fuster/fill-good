import "server-only";

import { addMonths, format, parseISO, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { currentMonthInSpain } from "@/lib/dates";
import { roundCents } from "@/lib/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/features/household/queries";
import { getMonthlyTripStats } from "@/features/shopping-list/queries";
import { getMonthlySpending } from "./spending";

/**
 * Resumen mensual (G4): el envoltorio que empaqueta las mecánicas —hucha y
 * compra perfecta— en una sola pantalla al cerrar el mes.
 *
 * Todo son agregaciones sobre datos que ya existen: CERO coste de IA, que es
 * requisito del proyecto (Gemini free tier). Reutiliza `getMonthlySpending` y
 * `getMonthlyTripStats` en vez de recalcular. Aquí solo queda la consulta del
 * producto estrella, que no la necesita nadie más.
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
  /**
   * El mes ya terminó. Distingue "cerrasteis por debajo del objetivo" (un
   * resultado) de "vais por X" (un marcador en juego): dar por cumplido un
   * objetivo a mitad de mes sería felicitar antes de tiempo.
   */
  isClosed: boolean;
  /**
   * Objetivo de gasto del hogar (`households.monthly_budget`), si lo tiene.
   * Es el único "reto" del plan (G5) que se implementa, y a propósito sin
   * infraestructura propia: el objetivo ya existía y ya se configura en
   * Ajustes, así que esto solo le pone marco de reto al cerrar el mes.
   */
  budget: number | null;

  spentTotal: number;
  /** spentTotal − mes anterior. Negativo = has gastado menos. */
  spentDelta: number;
  /**
   * Lo que se gastó el mes anterior. Hace falta para saber si hay con qué
   * comparar: sin él, el primer mes de un hogar decía «Has gastado más» contra
   * un mes que no existía (el anterior contaba como cero).
   */
  prevSpent: number;
  receiptCount: number;

  /** Lo que el mes aportó a la hucha (descuentos + precio). Puede ser negativo. */
  savingsTotal: number;
  /**
   * Hubo con qué calcular la hucha: descuentos en los tickets o histórico de
   * precios. La misma regla que /perfil. Sin ella, un «0,00 €» en verde se leía
   * como un ahorro cuando solo quería decir que no había nada que medir.
   */
  hasSavings: boolean;
  /** Producto en el que más se gastó. */
  topProduct: WrappedHighlight | null;
  /** Cadena que más aportó a la hucha; null si ninguna aportó nada. */
  bestChain: WrappedHighlight | null;

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

/**
 * El último mes CERRADO («yyyy-MM»), en el calendario español. Es el que abre
 * /resumen sin `?mes`: el resumen es el veredicto de un mes terminado (el mes en
 * curso ya lo cuenta /perfil), y sin esto la entrada de la paleta de comandos
 * abría un mes a medias.
 */
export function lastClosedMonth(): string {
  return format(
    subMonths(parseISO(`${currentMonthInSpain()}-01`), 1),
    "yyyy-MM",
  );
}

export async function getMonthlyWrapped(
  month?: string,
): Promise<MonthlyWrapped | null> {
  const spending = await getMonthlySpending(month);
  if (!spending) return null;

  const supabase = createServerSupabaseClient();
  const monthStart = parseISO(`${spending.month}-01`);
  const nextStart = addMonths(monthStart, 1);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const nextStartStr = format(nextStart, "yyyy-MM-dd");

  const householdId = await getActiveHouseholdId();
  if (!householdId) return null;

  // El `error` se mira y se lanza: sin filas no hay «producto estrella», que es
  // indistinguible de un mes en el que no se compró nada. Ver el porqué largo en
  // `getMonthlySpending`, de donde sale el resto de este resumen.
  const [{ data: itemRows, error: itemErr }, tripStats] = await Promise.all([
    supabase
      .from("receipt_items")
      // 2 FKs a products → hay que nombrar la relación o PostgREST da PGRST201.
      .select(
        "product_id, total_price, product:products!receipt_items_product_id_fkey(name)",
      )
      .eq("household_id", householdId)
      .not("product_id", "is", null)
      .not("total_price", "is", null)
      .gte("purchased_at", monthStartStr)
      .lt("purchased_at", nextStartStr),
    getMonthlyTripStats(spending.month),
  ]);
  if (itemErr) throw itemErr;

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

  const bestChainEntry = spending.savingsByChain.find((c) => c.total > 0);
  const bestChain = bestChainEntry
    ? { label: bestChainEntry.label, value: bestChainEntry.total }
    : null;

  // Un mes está cerrado cuando ha empezado el siguiente EN ESPAÑA. Con el mes
  // del proceso, /resumen del mes recién terminado seguía diciendo «vais por
  // 412 €» en vez de dar el veredicto, durante las dos primeras horas del día 1.
  const currentMonthStart = parseISO(`${currentMonthInSpain()}-01`);
  const canGoForward = nextStart <= currentMonthStart;

  return {
    month: spending.month,
    monthLabel: cap(format(monthStart, "LLLL yyyy", { locale: es })),
    prevMonth: format(subMonths(monthStart, 1), "yyyy-MM"),
    nextMonth: canGoForward ? format(nextStart, "yyyy-MM") : null,
    hasData: spending.receiptCount > 0,
    isClosed: nextStart <= currentMonthStart,
    budget: spending.budget,

    spentTotal: roundCents(spending.total),
    spentDelta: roundCents(spending.delta),
    prevSpent: roundCents(spending.prevTotal),
    receiptCount: spending.receiptCount,

    savingsTotal: spending.savingsTotal,
    hasSavings: spending.discountTotal > 0 || spending.savingsByPrice !== 0,
    topProduct,
    bestChain,

    tripsMatched: tripStats.tripsMatched,
    tripsPerfect: tripStats.tripsPerfect,
    topExtra: tripStats.topExtra,
  };
}
