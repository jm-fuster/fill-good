import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UnitType } from "@/lib/supabase/types";

export type PriceOverviewRow = {
  productId: string;
  name: string;
  purchases: number;
  totalSpent: number;
  lastUnitPrice: number;
  unit: UnitType;
  lastDate: string;
};

export type PricePoint = {
  date: string;
  unitPrice: number;
  totalPrice: number;
  quantity: number;
  unit: UnitType;
  storeChain: string;
};

type Row = {
  product_id: string | null;
  total_price: number | null;
  quantity: number;
  unit: UnitType;
  purchased_at: string | null;
  store_chain: string | null;
  product: { name: string } | null;
};

/** Productos con historial de precios, ordenados por gasto total. */
export async function getPriceOverview(): Promise<PriceOverviewRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipt_items")
    .select(
      "product_id, total_price, quantity, unit, purchased_at, store_chain, product:products(name)",
    )
    .not("product_id", "is", null)
    .not("total_price", "is", null)
    .not("purchased_at", "is", null)
    .order("purchased_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  const byProduct = new Map<string, PriceOverviewRow>();

  for (const r of rows) {
    if (!r.product_id || r.total_price === null || !r.purchased_at) continue;
    const qty = Number(r.quantity) || 1;
    const unitPrice = Number(r.total_price) / qty;
    const existing = byProduct.get(r.product_id);
    if (existing) {
      existing.purchases += 1;
      existing.totalSpent += Number(r.total_price);
      // rows están ordenadas por fecha asc → la última pisa a la anterior.
      existing.lastUnitPrice = unitPrice;
      existing.unit = r.unit;
      existing.lastDate = r.purchased_at;
    } else {
      byProduct.set(r.product_id, {
        productId: r.product_id,
        name: r.product?.name ?? "Producto",
        purchases: 1,
        totalSpent: Number(r.total_price),
        lastUnitPrice: unitPrice,
        unit: r.unit,
        lastDate: r.purchased_at,
      });
    }
  }

  return [...byProduct.values()].sort((a, b) => b.totalSpent - a.totalSpent);
}

export async function getProductPriceHistory(
  productId: string,
): Promise<{ name: string; points: PricePoint[] } | null> {
  const supabase = createServerSupabaseClient();

  const [{ data: product }, { data, error }] = await Promise.all([
    supabase.from("products").select("name").eq("id", productId).maybeSingle(),
    supabase
      .from("receipt_items")
      .select("purchased_at, total_price, quantity, unit, store_chain")
      .eq("product_id", productId)
      .not("purchased_at", "is", null)
      .not("total_price", "is", null)
      .order("purchased_at", { ascending: true }),
  ]);
  if (error) throw error;
  if (!product) return null;

  const points: PricePoint[] = (data ?? []).map((r) => {
    const qty = Number(r.quantity) || 1;
    return {
      date: r.purchased_at as string,
      unitPrice: Number(r.total_price) / qty,
      totalPrice: Number(r.total_price),
      quantity: qty,
      unit: r.unit,
      storeChain: r.store_chain ?? "otro",
    };
  });

  return { name: product.name, points };
}
