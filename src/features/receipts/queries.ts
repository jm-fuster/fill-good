import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
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
      "id, raw_text, description, quantity, unit, is_weighted, total_price, price_per_kg, product_id, match_status, product:products(name)",
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
    matchStatus: r.match_status,
    matchedProductName: r.product?.name ?? null,
  }));
}
