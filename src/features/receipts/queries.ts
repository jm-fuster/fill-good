import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getActiveHouseholdId,
  getCurrentHousehold,
} from "@/features/household/queries";
import { suggestCandidates, type HouseholdMatchData } from "@/lib/matching";
import { findPendingTrip } from "@/features/shopping-list/trips";
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

export type PendingReceipt = {
  id: string;
  storeName: string | null;
  purchasedAt: string | null;
  createdAt: string;
  total: number | null;
  itemCount: number;
};

/**
 * Tickets del hogar aún sin confirmar (`needs_review`), más recientes primero.
 * Alimenta la sección «Pendientes de revisar» de /escanear para que un ticket
 * escaneado y abandonado no quede inaccesible. El count de líneas va embebido
 * (supabase-js lo devuelve como `[{ count: number }]`).
 */
export async function getPendingReceipts(): Promise<PendingReceipt[]> {
  const household = await getCurrentHousehold();
  if (!household) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "id, store_name, purchased_at, created_at, total_amount, receipt_items(count)",
    )
    .eq("household_id", household.id)
    .eq("status", "needs_review")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const counts = r.receipt_items as unknown as { count: number }[] | null;
    return {
      id: r.id,
      storeName: r.store_name,
      purchasedAt: r.purchased_at,
      createdAt: r.created_at,
      total: r.total_amount === null ? null : Number(r.total_amount),
      itemCount: counts?.[0]?.count ?? 0,
    };
  });
}

export async function getReceipt(
  receiptId: string,
): Promise<ReceiptHeader | null> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return null;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("id, store_name, store_chain, purchased_at, total_amount, status")
    .eq("household_id", householdId)
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
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipt_items")
    .select(
      // receipt_items tiene DOS FKs a products (product_id y suggested_product_id,
      // esta última de E7): hay que nombrar la relación o PostgREST da PGRST201.
      "id, raw_text, description, quantity, unit, is_weighted, total_price, price_per_kg, product_id, suggested_product_id, match_status, product:products!receipt_items_product_id_fkey(name)",
    )
    .eq("household_id", householdId)
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

/**
 * Productos que YA entraron al inventario al pulsar «Finalizar compra» en la
 * lista, y que por tanto este ticket no debe volver a sumar.
 *
 * El checkout de la lista (`checkoutAction`) y la confirmación de un ticket
 * (`confirmReceiptAction`) son dos vías independientes de entrada al inventario.
 * Quien sigue el aviso «¿Tienes el ticket?» las encadena, y sin esta lista el
 * stock entraría dos veces. Con ella, esas líneas se revisan igual —precio,
 * historial, hucha— pero no vuelven a sumar existencias.
 *
 * Devuelve vacío cuando el ticket no se corresponde con ninguna compra cerrada
 * desde la lista, que es lo normal en quien escanea tickets sin usarla.
 */
export async function getAlreadyStockedProductIds(
  receipt: ReceiptHeader,
): Promise<string[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const trip = await findPendingTrip(supabase, {
    householdId,
    purchasedAt: receipt.purchasedAt,
  });
  return trip?.productIds ?? [];
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
