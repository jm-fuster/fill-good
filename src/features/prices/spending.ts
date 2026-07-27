import "server-only";

import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { roundCents } from "@/lib/money";
import { baseUnitFactor, unitFamily } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";
import { CHAIN_LABELS } from "./chains";
import { getLatestUnitPrices } from "./queries";

export type SpendingBreakdownItem = {
  key: string;
  label: string;
  total: number;
};

export type MonthlySpending = {
  /** Mes objetivo en formato "yyyy-MM". */
  month: string;
  /** Etiqueta legible, p. ej. "Julio 2026". */
  monthLabel: string;
  /** Mes anterior navegable ("yyyy-MM"). */
  prevMonth: string;
  /** Mes siguiente navegable, o null si el objetivo ya es el mes en curso. */
  nextMonth: string | null;
  total: number;
  prevTotal: number;
  /** total − prevTotal (positivo = has gastado más que el mes anterior). */
  delta: number;
  receiptCount: number;
  discountTotal: number;
  /**
   * Hucha (G1): saldo NETO del mes por haber pagado por encima o por debajo de la
   * referencia reciente de cada producto. Puede ser negativo.
   */
  savingsByPrice: number;
  /** discountTotal + savingsByPrice: lo que el mes ha aportado a la hucha. */
  savingsTotal: number;
  budget: number | null;
  byCategory: SpendingBreakdownItem[];
  byChain: SpendingBreakdownItem[];
  /** Desperdicio del mes valorado en € (M8); 0 si no hay eventos valorables. */
  discardedTotal: number;
  discardedByProduct: SpendingBreakdownItem[];
};

const OTHER_KEY = "otros";

export type MonthlySavingsBadge = { total: number };

/**
 * Versión ligera de la hucha del mes en curso, para la tira de /inventario
 * (G1): una sola query sobre `receipts`, sin las agregaciones de categoría,
 * cadena o desperdicio que solo hacen falta en /precios. null = sin ningún
 * ticket confirmado este mes (la tira no se muestra: un "0,00 €" sin contexto
 * es peor que no mostrar nada).
 */
export async function getMonthlySavingsBadge(): Promise<MonthlySavingsBadge | null> {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const supabase = createServerSupabaseClient();
  const today = new Date();
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const nextMonthStart = format(startOfMonth(addMonths(today, 1)), "yyyy-MM-dd");

  const { data, error } = await supabase
    .from("receipts")
    .select("discount_total, savings_amount")
    .eq("status", "confirmed")
    .gte("purchased_at", monthStart)
    .lt("purchased_at", nextMonthStart);
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const total = data.reduce(
    (sum, r) => sum + (Number(r.discount_total) || 0) + (Number(r.savings_amount) || 0),
    0,
  );
  return { total: roundCents(total) };
}

/** Normaliza un "yyyy-MM" arbitrario a uno válido; si no lo es, usa el actual. */
function resolveMonth(month: string | undefined, today: Date): string {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const d = parseISO(`${month}-01`);
    if (!Number.isNaN(d.getTime())) return month;
  }
  return format(today, "yyyy-MM");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Resumen de gasto de un mes (M1). Todo el dato ya existe en receipts /
 * receipt_items; es solo lectura y agregación en memoria. La RLS por hogar
 * filtra las filas, así que no hace falta pasar household_id a las consultas.
 */
export async function getMonthlySpending(
  month?: string,
): Promise<MonthlySpending | null> {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const supabase = createServerSupabaseClient();
  const today = new Date();
  const targetMonth = resolveMonth(month, today);

  const monthStart = parseISO(`${targetMonth}-01`);
  const prevStart = subMonths(monthStart, 1);
  const nextStart = addMonths(monthStart, 1);
  const currentMonthStart = startOfMonth(today);

  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const monthStartStr = fmt(monthStart);
  const nextStartStr = fmt(nextStart);
  const prevStartStr = fmt(prevStart);

  // Una sola tanda: receipts (mes objetivo + anterior), líneas por categoría,
  // eventos de desperdicio del mes y el mapa de precios para valorarlos.
  const [{ data: receiptRows }, { data: itemRows }, { data: discardRows }, prices] =
    await Promise.all([
      supabase
        .from("receipts")
        .select(
          "total_amount, discount_total, savings_amount, store_chain, purchased_at",
        )
        .eq("status", "confirmed")
        .gte("purchased_at", prevStartStr)
        .lt("purchased_at", nextStartStr),
      supabase
        .from("receipt_items")
        .select(
          // 2 FKs a products → hay que nombrar la relación (PGRST201). El embed
          // products → categories es no ambiguo (una sola FK).
          "total_price, purchased_at, product:products!receipt_items_product_id_fkey(category:categories(name))",
        )
        .not("total_price", "is", null)
        .gte("purchased_at", monthStartStr)
        .lt("purchased_at", nextStartStr),
      supabase
        .from("inventory_events")
        .select("product_id, quantity, unit, product:products(name)")
        .eq("kind", "discarded")
        .gte("created_at", monthStartStr)
        .lt("created_at", nextStartStr),
      getLatestUnitPrices(),
    ]);

  // Totales y desglose por cadena a partir de receipts.
  let total = 0;
  let prevTotal = 0;
  let receiptCount = 0;
  let discountTotal = 0;
  let savingsByPrice = 0;
  const chainTotals = new Map<string, number>();

  for (const r of receiptRows ?? []) {
    const amount = Number(r.total_amount) || 0;
    const inTarget =
      r.purchased_at !== null &&
      r.purchased_at >= monthStartStr &&
      r.purchased_at < nextStartStr;
    if (inTarget) {
      total += amount;
      receiptCount += 1;
      discountTotal += Number(r.discount_total) || 0;
      savingsByPrice += Number(r.savings_amount) || 0;
      const chain = r.store_chain ?? OTHER_KEY;
      chainTotals.set(chain, (chainTotals.get(chain) ?? 0) + amount);
    } else {
      // Mes anterior (solo para el delta).
      prevTotal += amount;
    }
  }

  // Desglose por categoría a partir de receipt_items (sin categoría → "Otros").
  type ItemRow = {
    total_price: number | null;
    product: { category: { name: string } | null } | null;
  };
  const catTotals = new Map<string, number>();
  for (const it of (itemRows ?? []) as unknown as ItemRow[]) {
    const price = Number(it.total_price) || 0;
    const name = it.product?.category?.name ?? "Otros";
    catTotals.set(name, (catTotals.get(name) ?? 0) + price);
  }

  const byCategory: SpendingBreakdownItem[] = [...catTotals.entries()]
    .map(([label, t]) => ({ key: label, label, total: t }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const byChain: SpendingBreakdownItem[] = [...chainTotals.entries()]
    .map(([key, t]) => ({ key, label: CHAIN_LABELS[key] ?? key, total: t }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // Desperdicio valorado en € (M8): cantidad tirada × último precio del producto,
  // solo dentro de la misma familia de unidad (sin conversión ud↔peso).
  type DiscardRow = {
    product_id: string | null;
    quantity: number;
    unit: UnitType;
    product: { name: string } | null;
  };
  const discardTotals = new Map<string, number>();
  let discardedTotal = 0;
  for (const e of (discardRows ?? []) as unknown as DiscardRow[]) {
    if (!e.product_id) continue;
    const price = prices.get(e.product_id);
    if (!price || unitFamily(price.unit) !== unitFamily(e.unit)) continue;
    const value =
      (price.price / baseUnitFactor(price.unit)) *
      (Number(e.quantity) * baseUnitFactor(e.unit));
    if (!(value > 0)) continue;
    discardedTotal += value;
    const name = e.product?.name ?? "Producto";
    discardTotals.set(name, (discardTotals.get(name) ?? 0) + value);
  }
  const discardedByProduct: SpendingBreakdownItem[] = [...discardTotals.entries()]
    .map(([label, t]) => ({ key: label, label, total: t }))
    .sort((a, b) => b.total - a.total);

  const canGoForward = nextStart <= currentMonthStart;

  return {
    month: targetMonth,
    monthLabel: cap(format(monthStart, "LLLL yyyy", { locale: es })),
    prevMonth: format(prevStart, "yyyy-MM"),
    nextMonth: canGoForward ? format(nextStart, "yyyy-MM") : null,
    total,
    prevTotal,
    delta: total - prevTotal,
    receiptCount,
    discountTotal,
    savingsByPrice: roundCents(savingsByPrice),
    savingsTotal: roundCents(discountTotal + savingsByPrice),
    budget: household.monthlyBudget,
    byCategory,
    byChain,
    discardedTotal,
    discardedByProduct,
  };
}
