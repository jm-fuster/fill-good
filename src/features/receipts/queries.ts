import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";
import { suggestCandidates, type HouseholdMatchData } from "@/lib/matching";
import type { UnitType } from "@/lib/supabase/types";

export type ReceiptHeader = {
  id: string;
  storeName: string | null;
  storeChain: string | null;
  purchasedAt: string | null;
  total: number | null;
  status: string;
};

export type ReceiptItem = {
  id: string;
  rawText: string | null;
  description: string;
  quantity: number;
  unit: UnitType;
  isWeighted: boolean;
  totalPrice: number | null;
  pricePerKg: number | null;
  productId: string | null;
  suggestedProductId: string | null;
  matchStatus: string;
  matchedProductName: string | null;
};

type ItemRow = {
  id: string;
  raw_text: string | null;
  description: string;
  quantity: number;
  unit: UnitType;
  is_weighted: boolean;
  total_price: number | null;
  price_per_kg: number | null;
  product_id: string | null;
  suggested_product_id: string | null;
  match_status: string;
  product: { name: string } | null;
};

export async function getReceipt(
  receiptId: string,
): Promise<ReceiptHeader | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("id, store_name, store_chain, purchased_at, total_amount, status")
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    storeName: data.store_name,
    storeChain: data.store_chain,
    purchasedAt: data.purchased_at,
    total: data.total_amount === null ? null : Number(data.total_amount),
    status: data.status,
  };
}

export async function getReceiptItems(
  receiptId: string,
): Promise<ReceiptItem[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipt_items")
    .select(
      "id, raw_text, description, quantity, unit, is_weighted, total_price, price_per_kg, product_id, suggested_product_id, match_status, product:products(name)",
    )
    .eq("receipt_id", receiptId)
    .order("position", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ItemRow[];
  return rows.map((r) => ({
    id: r.id,
    rawText: r.raw_text,
    description: r.description,
    quantity: Number(r.quantity),
    unit: r.unit,
    isWeighted: r.is_weighted,
    totalPrice: r.total_price === null ? null : Number(r.total_price),
    pricePerKg: r.price_per_kg === null ? null : Number(r.price_per_kg),
    productId: r.product_id,
    suggestedProductId: r.suggested_product_id,
    matchStatus: r.match_status,
    matchedProductName: r.product?.name ?? null,
  }));
}

/** Sugerencia fuzzy (E6): id del producto candidato para una línea sin match. */
export type ReceiptSuggestion = { itemId: string; productId: string };

/**
 * Candidatos fuzzy (E6) para las líneas del ticket que quedaron como producto
 * nuevo: top-1 por similitud de trigramas contra el catálogo Y los aliases del
 * hogar. Se calcula al cargar la revisión (sin migración: recomputar es trivial)
 * y NUNCA auto-asocia — la UI lo ofrece como sugerencia de un toque.
 */
export async function getReceiptSuggestions(
  items: ReceiptItem[],
): Promise<ReceiptSuggestion[]> {
  const targets = items.filter(
    (i) => i.productId === null && i.matchStatus === "new_product",
  );
  if (targets.length === 0) return [];
  const household = await getCurrentHousehold();
  if (!household) return [];

  const supabase = createServerSupabaseClient();
  const [{ data: products }, { data: aliases }] = await Promise.all([
    supabase
      .from("products")
      .select("id, normalized_name")
      .eq("household_id", household.id),
    supabase
      .from("product_aliases")
      .select("product_id, alias_normalized")
      .eq("household_id", household.id),
  ]);
  const matchData: HouseholdMatchData = {
    products: (products ?? []).map((p) => ({
      id: p.id,
      normalizedName: p.normalized_name,
    })),
    aliases: (aliases ?? []).map((a) => ({
      productId: a.product_id,
      aliasNormalized: a.alias_normalized,
    })),
  };
  const productIds = new Set(matchData.products.map((p) => p.id));

  const out: ReceiptSuggestion[] = [];
  for (const it of targets) {
    // Precedencia del candidato: sugerencia de la IA persistida (E7), si sigue
    // siendo un producto válido del hogar; si no, top-1 fuzzy por trigramas (E6).
    if (it.suggestedProductId && productIds.has(it.suggestedProductId)) {
      out.push({ itemId: it.id, productId: it.suggestedProductId });
      continue;
    }
    const [top] = suggestCandidates(matchData, it.rawText, it.description, {
      topN: 1,
    });
    if (top) out.push({ itemId: it.id, productId: top.productId });
  }
  return out;
}
