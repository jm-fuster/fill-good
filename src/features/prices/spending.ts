import "server-only";

import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";
import { CHAIN_LABELS } from "./chains";

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
  budget: number | null;
  byCategory: SpendingBreakdownItem[];
  byChain: SpendingBreakdownItem[];
};

const OTHER_KEY = "otros";

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

  // Una sola consulta para el mes objetivo Y el anterior (para el delta).
  const [{ data: receiptRows }, { data: itemRows }] = await Promise.all([
    supabase
      .from("receipts")
      .select("total_amount, discount_total, store_chain, purchased_at")
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
  ]);

  // Totales y desglose por cadena a partir de receipts.
  let total = 0;
  let prevTotal = 0;
  let receiptCount = 0;
  let discountTotal = 0;
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
    budget: household.monthlyBudget,
    byCategory,
    byChain,
  };
}
