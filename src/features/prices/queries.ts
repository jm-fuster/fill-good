import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UnitType } from "@/lib/supabase/types";
import { computeInferredChains } from "./infer-chain";
import { computeChainSavings, type ChainSavingsTip } from "./chain-savings";

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
      // receipt_items tiene DOS FKs a products (product_id y suggested_product_id,
      // esta última de E7): hay que nombrar la relación o PostgREST da PGRST201.
      "product_id, total_price, quantity, unit, purchased_at, store_chain, product:products!receipt_items_product_id_fkey(name)",
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

/**
 * Último precio por unidad conocido de cada producto (total/cantidad de la
 * compra más reciente) con su unidad. Base del coste por receta (M7). Coincide
 * con el `lastUnitPrice` que muestra el overview de precios.
 */
export const getLatestUnitPrices = cache(async (): Promise<
  Map<string, { price: number; unit: UnitType }>
> => {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipt_items")
    .select("product_id, total_price, quantity, unit, purchased_at")
    .not("product_id", "is", null)
    .not("total_price", "is", null)
    .not("purchased_at", "is", null)
    .order("purchased_at", { ascending: true });
  if (error) throw error;

  const map = new Map<string, { price: number; unit: UnitType }>();
  for (const r of data ?? []) {
    if (!r.product_id || r.total_price === null) continue;
    const qty = Number(r.quantity) || 1;
    // asc por fecha → la última compra pisa a las anteriores.
    map.set(r.product_id, { price: Number(r.total_price) / qty, unit: r.unit });
  }
  return map;
});

/**
 * Cadena inferida por producto (L15, fase 2) a partir del histórico de tickets:
 * mapa productId → cadena habitual, solo para productos con señal clara (ver
 * infer-chain.ts). Es la tienda "de facto"; la preferencia manual la sobrescribe
 * en quien consume este mapa. Sin embed de products → sin ambigüedad de FK.
 *
 * Sigue existiendo para /precios y el modo compra; las pestañas (inventario /
 * lista) leen la columna materializada. Envuelto en cache() para deduplicar
 * recomputaciones dentro de un mismo render.
 */
export const getInferredChains = cache(
  async (): Promise<Map<string, string>> => {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("receipt_items")
      .select("product_id, store_chain")
      .not("product_id", "is", null)
      .not("store_chain", "is", null);
    if (error) throw error;
    return computeInferredChains(data ?? []);
  },
);

/**
 * Aviso de ahorro por producto (L15, fase 3): mapa productId → tip cuando la
 * cadena donde compras el producto (efectiva = manual ?? inferida) NO es la más
 * barata de tu histórico y el ahorro es sustancial. Cruza la comparativa de
 * precios (M9) con la preferencia; sin embed de products → sin PGRST201.
 *
 * Sigue existiendo para /precios; las pestañas leen la columna materializada.
 * Envuelto en cache() para deduplicar recomputaciones dentro de un mismo render.
 */
export const getChainSavingsTips = cache(async (): Promise<
  Map<string, ChainSavingsTip>
> => {
  const supabase = createServerSupabaseClient();
  const [{ data: rows, error }, { data: products, error: prodErr }] =
    await Promise.all([
      supabase
        .from("receipt_items")
        .select("product_id, total_price, quantity, store_chain")
        .not("product_id", "is", null)
        .not("total_price", "is", null)
        .not("store_chain", "is", null),
      supabase.from("products").select("id, preferred_chain"),
    ]);
  if (error) throw error;
  if (prodErr) throw prodErr;

  // Cadena manual por producto e inferida del mismo histórico.
  const manual = new Map(
    (products ?? []).map((p) => [p.id, p.preferred_chain]),
  );
  const inferred = computeInferredChains(rows ?? []);

  // Puntos de precio por producto (precio unitario = total / cantidad, igual que
  // el resto de precios de la app).
  const pointsByProduct = new Map<
    string,
    { unitPrice: number; storeChain: string }[]
  >();
  for (const r of rows ?? []) {
    if (!r.product_id || r.total_price === null || !r.store_chain) continue;
    const qty = Number(r.quantity) || 1;
    const point = { unitPrice: Number(r.total_price) / qty, storeChain: r.store_chain };
    const arr = pointsByProduct.get(r.product_id);
    if (arr) arr.push(point);
    else pointsByProduct.set(r.product_id, [point]);
  }

  const tips = new Map<string, ChainSavingsTip>();
  for (const [productId, points] of pointsByProduct) {
    const effective = manual.get(productId) ?? inferred.get(productId) ?? null;
    if (!effective) continue;
    const tip = computeChainSavings(points, effective);
    if (tip) tips.set(productId, tip);
  }
  return tips;
});

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
