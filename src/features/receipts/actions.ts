"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateObject } from "ai";

import { getModel } from "@/lib/ai/models";
import { receiptSchema } from "@/lib/ai/receipt-schema";
import { RECEIPT_PROMPT } from "@/lib/ai/receipt-prompt";
import { matchProduct } from "@/lib/matching";
import { normalizeName } from "@/lib/normalize";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LocationType, UnitType } from "@/lib/supabase/types";
import { getCurrentHousehold } from "@/features/household/queries";

export type ScanState = {
  error?: string;
  receiptId?: string;
  warnings?: string[];
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function scanReceiptAction(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No se recibió ningún archivo." };
  }
  if (!ACCEPTED.includes(file.type)) {
    return { error: "Formato no admitido. Usa una imagen o un PDF." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Extracción con IA (visión / documento). FilePart sirve tanto para imagen
  // como para PDF; el mediaType lo toma del propio archivo.
  let extraction;
  try {
    const { object } = await generateObject({
      model: getModel("receipts"),
      schema: receiptSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: RECEIPT_PROMPT },
            { type: "file", data: bytes, mediaType: file.type },
          ],
        },
      ],
    });
    extraction = object;
  } catch (err) {
    console.error("Error de extracción del ticket:", err);
    return {
      error:
        "No se pudo leer el ticket. Prueba con una foto más nítida o vuelve a intentarlo.",
    };
  }

  const supabase = createServerSupabaseClient();

  const { data: receipt, error: recErr } = await supabase
    .from("receipts")
    .insert({
      household_id: household.id,
      uploaded_by: userId,
      store_name: extraction.store_name,
      store_chain: extraction.store_chain,
      purchased_at: extraction.purchase_date,
      total_amount: extraction.total,
      status: "needs_review",
      raw_extraction: extraction,
    })
    .select("id")
    .single();
  if (recErr || !receipt) {
    return { error: "No se pudo guardar el ticket." };
  }

  // Líneas de producto (ignorando descuentos), con matching.
  const products = extraction.items.filter((it) => !it.is_discount);
  let position = 0;
  for (const item of products) {
    const match = await matchProduct(
      supabase,
      household.id,
      item.raw_text,
      item.description,
    );
    await supabase.from("receipt_items").insert({
      receipt_id: receipt.id,
      household_id: household.id,
      raw_text: item.raw_text,
      description: item.description,
      quantity: item.quantity || 1,
      unit: item.unit ?? "ud",
      is_weighted: item.is_weighted ?? false,
      total_price: item.total_price,
      unit_price: item.unit_price,
      price_per_kg: item.price_per_kg,
      product_id: match.productId,
      match_status: match.matchStatus,
      position: position++,
    });
  }

  return { receiptId: receipt.id, warnings: extraction.warnings ?? [] };
}

export type ConfirmItemDecision = {
  itemId: string;
  description: string;
  quantity: number;
  unit: UnitType;
  productId: string | null; // uuid = enlazar; null = crear nuevo
  skip: boolean;
};

export type ConfirmPayload = {
  receiptId: string;
  storeName: string | null;
  purchaseDate: string | null;
  total: number | null;
  items: ConfirmItemDecision[];
};

export async function confirmReceiptAction(
  payload: ConfirmPayload,
): Promise<{ error?: string; ok?: boolean; added?: number }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, household_id, store_chain, purchased_at")
    .eq("id", payload.receiptId)
    .maybeSingle();
  if (!receipt || receipt.household_id !== household.id) {
    return { error: "Ticket no encontrado." };
  }

  const purchasedAt = payload.purchaseDate ?? receipt.purchased_at;
  const storeChain = receipt.store_chain;
  let added = 0;

  for (const dec of payload.items) {
    if (dec.skip) {
      await supabase
        .from("receipt_items")
        .update({ match_status: "skipped" })
        .eq("id", dec.itemId);
      continue;
    }

    // Resolver producto: enlazado, existente por nombre, o crear nuevo.
    let productId = dec.productId;
    let location: LocationType = "pantry";
    let matchStatus = "manual";

    if (productId) {
      const { data: p } = await supabase
        .from("products")
        .select("default_location")
        .eq("id", productId)
        .maybeSingle();
      if (p) location = p.default_location;
    } else {
      const normalized = normalizeName(dec.description);
      const { data: existing } = await supabase
        .from("products")
        .select("id, default_location")
        .eq("household_id", household.id)
        .eq("normalized_name", normalized)
        .maybeSingle();
      if (existing) {
        productId = existing.id;
        location = existing.default_location;
      } else {
        const { data: created } = await supabase
          .from("products")
          .insert({
            household_id: household.id,
            name: dec.description,
            normalized_name: normalized,
            default_unit: dec.unit,
            default_location: "pantry",
          })
          .select("id")
          .single();
        if (!created) continue;
        productId = created.id;
        matchStatus = "new_product";
      }
    }

    // Aprender el alias (texto crudo del ticket → producto).
    const { data: item } = await supabase
      .from("receipt_items")
      .select("raw_text")
      .eq("id", dec.itemId)
      .maybeSingle();
    const aliasKey = normalizeName(item?.raw_text || dec.description);
    if (aliasKey && productId) {
      await supabase
        .from("product_aliases")
        .upsert(
          {
            household_id: household.id,
            product_id: productId,
            alias: item?.raw_text || dec.description,
            alias_normalized: aliasKey,
          },
          { onConflict: "household_id,alias_normalized", ignoreDuplicates: true },
        );
    }

    // Fijar la línea del ticket (historial de precios) y llevar al inventario.
    await supabase
      .from("receipt_items")
      .update({
        product_id: productId,
        description: dec.description,
        quantity: dec.quantity,
        unit: dec.unit,
        match_status: matchStatus,
        added_to_inventory: true,
        purchased_at: purchasedAt,
        store_chain: storeChain,
      })
      .eq("id", dec.itemId);

    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id, quantity")
      .eq("household_id", household.id)
      .eq("product_id", productId)
      .eq("location", location)
      .maybeSingle();
    if (inv) {
      await supabase
        .from("inventory_items")
        .update({
          quantity: Number(inv.quantity) + dec.quantity,
          unit: dec.unit,
          updated_by: userId,
        })
        .eq("id", inv.id);
    } else {
      await supabase.from("inventory_items").insert({
        household_id: household.id,
        product_id: productId,
        location,
        quantity: dec.quantity,
        unit: dec.unit,
        updated_by: userId,
      });
    }

    // Memoria de habitualidad: este producto se ha comprado.
    if (productId) {
      await supabase.rpc("bump_product_purchase", { pid: productId });
    }
    added += 1;
  }

  await supabase
    .from("receipts")
    .update({
      store_name: payload.storeName,
      purchased_at: purchasedAt,
      total_amount: payload.total,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", payload.receiptId);

  revalidatePath("/inventario");
  revalidatePath("/precios");
  revalidatePath("/escanear");
  return { ok: true, added };
}
