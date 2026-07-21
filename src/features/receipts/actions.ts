"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateObject } from "ai";

import { getModel } from "@/lib/ai/models";
import { receiptSchema } from "@/lib/ai/receipt-schema";
import type { ReceiptItemExtraction } from "@/lib/ai/receipt-schema";
import { buildReceiptPrompt } from "@/lib/ai/receipt-prompt";
import { loadHouseholdMatchData, matchLineExact } from "@/lib/matching";
import { normalizeName } from "@/lib/normalize";
import { formatQuantity, UNIT_LABELS } from "@/lib/units";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LocationType, UnitType } from "@/lib/supabase/types";
import { getCurrentHousehold } from "@/features/household/queries";

export type ScanState = {
  error?: string;
  receiptId?: string;
  warnings?: string[];
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Tope del catálogo embebido en el prompt (los más habituales); el resto lo
 *  cubre el fuzzy de la revisión (E6). Evita prompts enormes si el catálogo crece. */
const MAX_CATALOG_FOR_PROMPT = 300;

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
  const supabase = createServerSupabaseClient();

  // Catálogo del hogar para la sugerencia de la IA (E7, coste cero: va en la
  // misma llamada). Los más habituales primero, capado para no inflar el prompt.
  const { data: catalogRows } = await supabase
    .from("products")
    .select("id, name")
    .eq("household_id", household.id)
    .order("purchase_count", { ascending: false })
    .order("name", { ascending: true })
    .limit(MAX_CATALOG_FOR_PROMPT);
  const promptCatalog = (catalogRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
  }));
  const catalogIds = new Set(promptCatalog.map((p) => p.id));

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
            { type: "text", text: buildReceiptPrompt(promptCatalog) },
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

  // Líneas de producto (ignorando descuentos), con matching EXACTO. El catálogo
  // + aliases del hogar se cargan una sola vez por ticket (antes: 2 queries por
  // línea). El fuzzy no se aplica aquí: solo sugiere en la revisión (E6).
  const products = extraction.items.filter((it) => !it.is_discount);
  const matchData = await loadHouseholdMatchData(supabase, household.id);
  let position = 0;
  for (const item of products) {
    const match = matchLineExact(matchData, item.raw_text, item.description);
    // Sugerencia de la IA (E7), SIEMPRE validada server-side (la IA alucina ids):
    // solo se guarda si el id existe en el catálogo mostrado y la línea NO tiene
    // ya match exacto (precedencia: alias > exacto > IA). Nunca auto-asocia.
    const suggestedProductId =
      match.matchStatus === "new_product" &&
      item.suggested_product_id &&
      catalogIds.has(item.suggested_product_id)
        ? item.suggested_product_id
        : null;
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
      suggested_product_id: suggestedProductId,
      match_status: match.matchStatus,
      position: position++,
    });
  }

  return { receiptId: receipt.id, warnings: extraction.warnings ?? [] };
}

export type ProductAlias = { id: string; alias: string };

/**
 * Aliases aprendidos que apuntan a un producto (E8). Se cargan bajo demanda al
 * abrir el drawer de edición. La RLS de `product_aliases` restringe al hogar.
 */
export async function getProductAliasesAction(
  productId: string,
): Promise<ProductAlias[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("product_aliases")
    .select("id, alias")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((a) => ({ id: a.id, alias: a.alias }));
}

/**
 * Borra un alias aprendido (E8). No toca historial de precios ni inventario:
 * solo hace que el siguiente escaneo de esa línea vuelva a pedir decisión.
 */
export async function deleteAliasAction(
  aliasId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("product_aliases")
    .delete()
    .eq("id", aliasId);
  if (error) return { error: "No se pudo borrar el nombre." };
  revalidatePath("/inventario");
  return { ok: true };
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
): Promise<{
  error?: string;
  ok?: boolean;
  added?: number;
  inventoryItemIds?: string[];
  warnings?: string[];
}> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, household_id, store_chain, purchased_at, raw_extraction")
    .eq("id", payload.receiptId)
    .maybeSingle();
  if (!receipt || receipt.household_id !== household.id) {
    return { error: "Ticket no encontrado." };
  }

  const purchasedAt = payload.purchaseDate ?? receipt.purchased_at;
  const storeChain = receipt.store_chain;

  // Descuentos (M1): las líneas is_discount se filtran al escanear y no viven en
  // receipt_items; su total sí se conserva aquí, sumando desde la extracción.
  // Positivo = € ahorrados. abs() por si el modelo emite el importe con signo.
  const rawItems =
    (receipt.raw_extraction as { items?: ReceiptItemExtraction[] } | null)
      ?.items ?? [];
  const discountTotal = rawItems.reduce(
    (sum, it) =>
      it.is_discount && it.total_price != null
        ? sum + Math.abs(Number(it.total_price))
        : sum,
    0,
  );
  let added = 0;
  const inventoryItemIds: string[] = [];
  const warnings: string[] = [];

  // Robustez transaccional (E10): en vez de ~3 SELECTs por línea (N×8 round-trips
  // en un ticket de 40 líneas), se cargan por LOTE una sola vez el catálogo, el
  // inventario y las líneas del ticket, y se resuelve todo en memoria. Se
  // mantiene la política de unidades y la normalización en TS (un solo sitio,
  // coordinado con E3) en vez de reimplementar normalizeName en SQL (divergencia
  // arriesgada para la unicidad de productos y el historial de precios).
  // Idempotencia: la confirmación solo marca el ticket `confirmed` al final; si
  // falla a mitad, el ticket sigue `needs_review` y al reintentar se saltan las
  // líneas ya procesadas (`added_to_inventory`), sin duplicar stock.
  const [
    { data: itemRows },
    { data: productRows },
    { data: invRows },
  ] = await Promise.all([
    supabase
      .from("receipt_items")
      .select("id, raw_text, added_to_inventory")
      .eq("receipt_id", payload.receiptId),
    supabase
      .from("products")
      .select("id, normalized_name, default_location")
      .eq("household_id", household.id),
    supabase
      .from("inventory_items")
      .select("id, product_id, location, quantity, unit")
      .eq("household_id", household.id),
  ]);

  const itemById = new Map((itemRows ?? []).map((r) => [r.id, r]));
  const productByNorm = new Map(
    (productRows ?? []).map((p) => [p.normalized_name, p]),
  );
  const productById = new Map((productRows ?? []).map((p) => [p.id, p]));
  const invKey = (pid: string, loc: LocationType) => `${pid}::${loc}`;
  const invByKey = new Map(
    (invRows ?? []).map((r) => [invKey(r.product_id, r.location), r]),
  );

  for (const dec of payload.items) {
    if (dec.skip) {
      await supabase
        .from("receipt_items")
        .update({ match_status: "skipped" })
        .eq("id", dec.itemId);
      continue;
    }

    // Reintento idempotente: si esta línea ya se procesó en un intento previo
    // (el ticket quedó a medias), no volver a añadirla al stock.
    const itemRow = itemById.get(dec.itemId);
    if (itemRow?.added_to_inventory) {
      added += 1;
      continue;
    }

    // Resolver producto (enlazado, existente por nombre o nuevo) desde los mapas.
    let productId = dec.productId;
    let location: LocationType = "pantry";
    let matchStatus = "manual";

    if (productId) {
      location = productById.get(productId)?.default_location ?? "pantry";
    } else {
      const normalized = normalizeName(dec.description);
      const existing = productByNorm.get(normalized);
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
          .select("id, normalized_name, default_location")
          .single();
        if (!created) continue;
        productId = created.id;
        matchStatus = "new_product";
        // Mantener los mapas al día: otra línea del mismo ticket con el mismo
        // nombre reutiliza el producto recién creado (dedup dentro del ticket).
        productById.set(created.id, created);
        productByNorm.set(created.normalized_name, created);
      }
    }

    // Aprender el alias (texto crudo del ticket → producto), con el raw_text ya
    // cargado por lote.
    const rawText = itemRow?.raw_text ?? null;
    const aliasKey = normalizeName(rawText || dec.description);
    if (aliasKey && productId) {
      await supabase.from("product_aliases").upsert(
        {
          household_id: household.id,
          product_id: productId,
          alias: rawText || dec.description,
          alias_normalized: aliasKey,
        },
        { onConflict: "household_id,alias_normalized", ignoreDuplicates: true },
      );
    }

    // Fijar la línea del ticket (historial de precios) y marcarla procesada.
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

    // Inventario con la política de unidades de E3 (única, en TS).
    const key = invKey(productId, location);
    const inv = invByKey.get(key);
    let addedToInventory = false;
    if (inv) {
      // NO sumar magnitudes de unidades distintas (ud + l = disparate). Si
      // difieren, se conserva la unidad y cantidad del inventario y se avisa.
      if (inv.unit === dec.unit) {
        const newQty = Number(inv.quantity) + dec.quantity;
        await supabase
          .from("inventory_items")
          .update({ quantity: newQty, updated_by: userId })
          .eq("id", inv.id);
        invByKey.set(key, { ...inv, quantity: newQty });
        inventoryItemIds.push(inv.id);
        addedToInventory = true;
      } else {
        warnings.push(
          `«${dec.description}»: compraste ${formatQuantity(
            dec.quantity,
            dec.unit,
          )} pero en tu inventario está en ${UNIT_LABELS[inv.unit]}. No se sumó automáticamente; ajústalo a mano.`,
        );
      }
    } else {
      const { data: created } = await supabase
        .from("inventory_items")
        .insert({
          household_id: household.id,
          product_id: productId,
          location,
          quantity: dec.quantity,
          unit: dec.unit,
          updated_by: userId,
        })
        .select("id")
        .single();
      if (created) {
        invByKey.set(key, {
          id: created.id,
          product_id: productId,
          location,
          quantity: dec.quantity,
          unit: dec.unit,
        });
        inventoryItemIds.push(created.id);
        addedToInventory = true;
      }
    }

    // Memoria de habitualidad: este producto se ha comprado (aunque el stock no
    // se sumara por conflicto de unidades, la compra sí ocurrió).
    if (productId) {
      await supabase.rpc("bump_product_purchase", { pid: productId });
    }
    if (addedToInventory) added += 1;
  }

  await supabase
    .from("receipts")
    .update({
      store_name: payload.storeName,
      purchased_at: purchasedAt,
      total_amount: payload.total,
      discount_total: discountTotal,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", payload.receiptId);

  revalidatePath("/inventario");
  revalidatePath("/precios");
  revalidatePath("/escanear");
  return { ok: true, added, inventoryItemIds, warnings };
}
