"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
import { refreshPriceInsights } from "@/features/prices/materialize";
import { notifyPriceRises } from "@/features/push/notify";

export type ScanState = {
  error?: string;
  receiptId?: string;
  warnings?: string[];
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Tope del catálogo embebido en el prompt (los más habituales); el resto lo
 *  cubre el fuzzy de la revisión (E6). Evita prompts enormes si el catálogo crece. */
const MAX_CATALOG_FOR_PROMPT = 300;

/** Tamaño de tanda para los updates que no tienen equivalente masivo en PostgREST
 *  (valores distintos por fila). Pasan de N secuenciales a ~N/10 tandas paralelas. */
const WRITE_CHUNK = 10;

/** Ejecuta `fn` sobre `items` en tandas paralelas de {@link WRITE_CHUNK}. El
 *  callback puede devolver un builder de PostgREST (thenable), no solo Promise. */
async function inChunks<T>(
  items: T[],
  fn: (item: T) => PromiseLike<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += WRITE_CHUNK) {
    await Promise.all(items.slice(i, i + WRITE_CHUNK).map((item) => fn(item)));
  }
}

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
  // El matching exacto es síncrono en memoria: se construye el array completo y
  // se inserta en UNA sola llamada (antes: un insert por línea). `position` es el
  // índice del array.
  const lineRows = products.map((item, position) => {
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
    return {
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
      position,
    };
  });
  if (lineRows.length) {
    await supabase.from("receipt_items").insert(lineRows);
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
  const affectedProductIds = new Set<string>();

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
      .select("id, normalized_name, default_location, pack_size")
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
  // Pack (F4): unidades por compra por producto (solo aplica a movimientos en ud).
  const packByProduct = new Map<string, number | null>(
    (productRows ?? []).map((p) => [p.id, p.pack_size]),
  );
  const invKey = (pid: string, loc: LocationType) => `${pid}::${loc}`;
  const invByKey = new Map(
    (invRows ?? []).map((r) => [invKey(r.product_id, r.location), r]),
  );

  // ── PASADA 1 — resolución en memoria (sin ningún await) ──────────────────
  // Recorre las decisiones reutilizando los mapas ya cargados y clasifica cada
  // línea: saltada / ya procesada (idempotencia) / producto enlazado / existente
  // por nombre / producto NUEVO (acumulado y deduplicado por normalized_name
  // dentro del propio ticket). No se toca la BD todavía: las escrituras van en
  // la pasada 2, por lotes. La semántica (unidades E3, pack F4, dedup, contadores)
  // es idéntica al bucle por-línea anterior; solo se sacan los await de dentro.
  type Resolved = {
    itemId: string;
    rawText: string | null;
    description: string;
    quantity: number;
    unit: UnitType;
    /** Resuelto ya (enlazado/existente) o null hasta insertar el producto nuevo. */
    productId: string | null;
    /** normalized_name para re-resolver tras insertar los productos nuevos. */
    normKey: string | null;
    location: LocationType;
    matchStatus: string;
    isNew: boolean;
  };

  const skippedIds: string[] = [];
  const resolved: Resolved[] = [];
  // Productos nuevos deduplicados por normalized_name dentro del ticket: la
  // primera aparición fija nombre y unidad por defecto.
  const newProductsByNorm = new Map<
    string,
    { name: string; normalized_name: string; default_unit: UnitType }
  >();

  for (const dec of payload.items) {
    if (dec.skip) {
      skippedIds.push(dec.itemId);
      continue;
    }

    // Reintento idempotente: si esta línea ya se procesó en un intento previo
    // (el ticket quedó a medias), no volver a añadirla al stock; cuenta igual.
    const itemRow = itemById.get(dec.itemId);
    if (itemRow?.added_to_inventory) {
      added += 1;
      continue;
    }

    const rawText = itemRow?.raw_text ?? null;

    if (dec.productId) {
      resolved.push({
        itemId: dec.itemId,
        rawText,
        description: dec.description,
        quantity: dec.quantity,
        unit: dec.unit,
        productId: dec.productId,
        normKey: null,
        location: productById.get(dec.productId)?.default_location ?? "pantry",
        matchStatus: "manual",
        isNew: false,
      });
      continue;
    }

    const normalized = normalizeName(dec.description);
    const existing = productByNorm.get(normalized);
    if (existing) {
      resolved.push({
        itemId: dec.itemId,
        rawText,
        description: dec.description,
        quantity: dec.quantity,
        unit: dec.unit,
        productId: existing.id,
        normKey: null,
        location: existing.default_location,
        matchStatus: "manual",
        isNew: false,
      });
    } else {
      if (!newProductsByNorm.has(normalized)) {
        newProductsByNorm.set(normalized, {
          name: dec.description,
          normalized_name: normalized,
          default_unit: dec.unit,
        });
      }
      resolved.push({
        itemId: dec.itemId,
        rawText,
        description: dec.description,
        quantity: dec.quantity,
        unit: dec.unit,
        productId: null,
        normKey: normalized,
        location: "pantry",
        matchStatus: "new_product",
        isNew: true,
      });
    }
  }

  // ── PASADA 2 — escrituras por lotes ──────────────────────────────────────

  // 2.1 Productos nuevos: un único insert; vuelca ids a los mapas y re-resuelve
  //     las líneas que dependían de ellos (por normalized_name).
  const newProducts = [...newProductsByNorm.values()];
  if (newProducts.length) {
    const { data: created } = await supabase
      .from("products")
      .insert(
        newProducts.map((np) => ({
          household_id: household.id,
          name: np.name,
          normalized_name: np.normalized_name,
          default_unit: np.default_unit,
          default_location: "pantry" as LocationType,
        })),
      )
      .select("id, normalized_name, default_location, pack_size");
    const createdByNorm = new Map(
      (created ?? []).map((c) => [c.normalized_name, c]),
    );
    for (const c of created ?? []) {
      productById.set(c.id, c);
      productByNorm.set(c.normalized_name, c);
      packByProduct.set(c.id, c.pack_size);
    }
    for (const r of resolved) {
      if (r.isNew && r.productId === null && r.normKey) {
        const c = createdByNorm.get(r.normKey);
        if (c) {
          r.productId = c.id;
          r.location = c.default_location;
        }
      }
    }
  }

  // Líneas cuyo producto nuevo no llegó a crearse quedan fuera (equivale al
  // `continue` del código anterior cuando el insert de producto fallaba).
  const processable = resolved.filter(
    (r): r is Resolved & { productId: string } => r.productId !== null,
  );

  // 2.2 Aliases: un único upsert, deduplicado por alias_normalized (que es la
  //     clave del onConflict) antes de enviar.
  const aliasByNorm = new Map<
    string,
    { household_id: string; product_id: string; alias: string; alias_normalized: string }
  >();
  for (const r of processable) {
    const alias = r.rawText || r.description;
    const aliasKey = normalizeName(alias);
    if (aliasKey && !aliasByNorm.has(aliasKey)) {
      aliasByNorm.set(aliasKey, {
        household_id: household.id,
        product_id: r.productId,
        alias,
        alias_normalized: aliasKey,
      });
    }
  }
  if (aliasByNorm.size) {
    await supabase
      .from("product_aliases")
      .upsert([...aliasByNorm.values()], {
        onConflict: "household_id,alias_normalized",
        ignoreDuplicates: true,
      });
  }

  // 2.3 Líneas de ticket (historial de precios): valores distintos por fila y
  //     PostgREST no tiene update masivo → tandas paralelas de ~10.
  await inChunks(processable, (r) =>
    supabase
      .from("receipt_items")
      .update({
        product_id: r.productId,
        description: r.description,
        quantity: r.quantity,
        unit: r.unit,
        match_status: r.matchStatus,
        added_to_inventory: true,
        purchased_at: purchasedAt,
        store_chain: storeChain,
      })
      .eq("id", r.itemId),
  );
  // Líneas saltadas: un solo update (mismo valor para todas).
  if (skippedIds.length) {
    await supabase
      .from("receipt_items")
      .update({ match_status: "skipped" })
      .in("id", skippedIds);
  }

  // 2.4 Inventario: simular en memoria (misma política E3/pack F4 que antes) y
  //     separar en updates de filas existentes e insert único de filas nuevas.
  type InvSim = {
    id: string | null;
    product_id: string;
    location: LocationType;
    quantity: number;
    unit: UnitType;
    existing: boolean;
    dirty: boolean;
  };
  const invSim = new Map<string, InvSim>();
  for (const [k, r] of invByKey) {
    invSim.set(k, {
      id: r.id,
      product_id: r.product_id,
      location: r.location,
      quantity: Number(r.quantity),
      unit: r.unit,
      existing: true,
      dirty: false,
    });
  }

  // Clave de inventario tocada por cada línea (null si no se sumó por conflicto
  // de unidad), en orden de payload → reconstruye inventoryItemIds al final.
  const lineKeys: (string | null)[] = [];
  const events: {
    household_id: string;
    product_id: string;
    quantity: number;
    unit: UnitType;
    kind: "restocked";
    created_by: string | null;
  }[] = [];
  const bumpIds: string[] = [];

  for (const r of processable) {
    // Pack (F4): si el producto tiene pack y la compra es en ud, entran
    // `cantidad × pack` unidades al inventario (la línea del ticket conserva la
    // cantidad de compra).
    const packSize =
      r.unit === "ud" ? (packByProduct.get(r.productId) ?? null) : null;
    const invQty = packSize ? r.quantity * packSize : r.quantity;

    const key = invKey(r.productId, r.location);
    const inv = invSim.get(key);
    let addedToInventory = false;
    if (inv) {
      // NO sumar magnitudes de unidades distintas (ud + l = disparate).
      if (inv.unit === r.unit) {
        inv.quantity += invQty;
        inv.dirty = true;
        addedToInventory = true;
      } else {
        warnings.push(
          `«${r.description}»: compraste ${formatQuantity(
            r.quantity,
            r.unit,
          )} pero en tu inventario está en ${UNIT_LABELS[inv.unit]}. No se sumó automáticamente; ajústalo a mano.`,
        );
      }
    } else {
      invSim.set(key, {
        id: null,
        product_id: r.productId,
        location: r.location,
        quantity: invQty,
        unit: r.unit,
        existing: false,
        dirty: true,
      });
      addedToInventory = true;
    }

    lineKeys.push(addedToInventory ? key : null);
    // Historial (F5): evento "repuesto" solo por línea realmente sumada, con la
    // cantidad ya convertida por pack (mismo criterio que recordStockEvent).
    if (addedToInventory && invQty > 0) {
      events.push({
        household_id: household.id,
        product_id: r.productId,
        quantity: invQty,
        unit: r.unit,
        kind: "restocked",
        created_by: userId ?? null,
      });
    }
    // Habitualidad: la compra ocurrió aunque el stock no se sumara por conflicto.
    bumpIds.push(r.productId);
    affectedProductIds.add(r.productId);
    if (addedToInventory) added += 1;
  }

  // (a) filas existentes con cantidad final distinta → updates chunked.
  const invUpdates = [...invSim.values()].filter((s) => s.existing && s.dirty);
  await inChunks(invUpdates, (s) =>
    supabase
      .from("inventory_items")
      .update({ quantity: s.quantity, updated_by: userId })
      .eq("id", s.id as string),
  );
  // (b) filas nuevas → un único insert.
  const invInserts = [...invSim.values()].filter((s) => !s.existing);
  let insertedInv: { id: string; product_id: string; location: LocationType }[] =
    [];
  if (invInserts.length) {
    const { data } = await supabase
      .from("inventory_items")
      .insert(
        invInserts.map((s) => ({
          household_id: household.id,
          product_id: s.product_id,
          location: s.location,
          quantity: s.quantity,
          unit: s.unit,
          updated_by: userId,
        })),
      )
      .select("id, product_id, location");
    insertedInv = data ?? [];
  }

  // Reconstruir inventoryItemIds en el orden de las líneas del payload (lo que
  // espera /inventario/revision), mapeando por product_id + location. Duplicar
  // ids repetidos es aceptable.
  const idByKey = new Map<string, string>();
  for (const s of invSim.values()) {
    if (s.existing && s.id) idByKey.set(invKey(s.product_id, s.location), s.id);
  }
  for (const row of insertedInv) {
    idByKey.set(invKey(row.product_id, row.location), row.id);
  }
  for (const key of lineKeys) {
    if (!key) continue;
    const id = idByKey.get(key);
    if (id) inventoryItemIds.push(id);
  }

  // 2.5 Historial: un único insert de todos los eventos restocked. Best-effort
  //     (igual que recordStockEvent): un fallo aquí no tumba la confirmación.
  if (events.length) {
    try {
      await supabase.from("inventory_events").insert(events);
    } catch {
      // El historial no debe romper la operación principal.
    }
  }

  // 2.6 Habitualidad: una sola RPC por lote con el array de productIds (una
  //     entrada por línea, con duplicados → suma correcta).
  if (bumpIds.length) {
    await supabase.rpc("bump_product_purchases", { pids: bumpIds });
  }

  // 2.7 Cierre del ticket. Al confirmar, `raw_extraction` (el JSON completo de la
  //     IA, ~5–15 KB/fila) ya no se lee nunca más: los descuentos quedan
  //     materializados en `discount_total` justo arriba. Se vacía para no acumular
  //     el dato más pesado de la BD. El cierre es el último paso, así que si la
  //     confirmación falla a mitad el ticket sigue `needs_review` con su JSON
  //     intacto y el reintento idempotente funciona igual.
  await supabase
    .from("receipts")
    .update({
      store_name: payload.storeName,
      purchased_at: purchasedAt,
      total_amount: payload.total,
      discount_total: discountTotal,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      raw_extraction: null,
    })
    .eq("id", payload.receiptId);

  revalidatePath("/inventario");
  revalidatePath("/precios");
  revalidatePath("/escanear");

  // Trabajo posterior FUERA del camino crítico: el cliente recibe la respuesta al
  // cerrar el ticket; esto sale después vía after().
  //  1. Rematerializar las señales de precio (cadena inferida + aviso de ahorro)
  //     de los productos afectados: solo cambian cuando cambia el histórico.
  //  2. Aviso push de subidas de precio (M10c). Inerte sin claves VAPID; jamás
  //     rompe la confirmación (try/catch dentro).
  const notifyIds = [...affectedProductIds];
  const notifyUserId = userId ?? null;
  after(async () => {
    await refreshPriceInsights(supabase, household.id, notifyIds);
    await notifyPriceRises(household.id, notifyIds, notifyUserId);
  });

  return { ok: true, added, inventoryItemIds, warnings };
}
