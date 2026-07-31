"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { generateObject } from "ai";

import { getModel } from "@/lib/ai/models";
import { classifyAiError } from "@/lib/ai/errors";
import { buildReceiptSchema } from "@/lib/ai/receipt-schema";
import type { ReceiptItemExtraction } from "@/lib/ai/receipt-schema";
import { buildReceiptPrompt } from "@/lib/ai/receipt-prompt";
import { loadHouseholdMatchData, matchLineExact } from "@/lib/matching";
import { normalizeName } from "@/lib/normalize";
import { formatQuantity, UNIT_LABELS } from "@/lib/units";
import { sniffUploadType, stripImageMetadata } from "@/lib/image-metadata";
import { enforceAiRateLimit } from "@/lib/ai/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LocationType, UnitType } from "@/lib/supabase/types";
import {
  getCurrentHousehold,
  getHouseholdChains,
} from "@/features/household/queries";
import {
  CHAIN_OPTIONS,
  chainLabel,
  chainOptions,
  isCustomChain,
} from "@/features/prices/chains";
import {
  computeSavingsForReceipt,
  refreshPriceInsights,
} from "@/features/prices/materialize";
import {
  summarizeReceiptSavings,
  type ReceiptSavingsSummary,
} from "@/features/prices/savings";
import { notifyPriceRises } from "@/features/push/notify";
import { linkReceiptToTrip } from "@/features/shopping-list/trips";
import {
  compareTripToReceipt,
  type TripComparison,
} from "@/features/shopping-list/trip-comparison";
import { getAiConsent } from "@/features/ai-consent/queries";
import { AI_CONSENT_REQUIRED_ERROR } from "@/features/ai-consent/version";
import { confirmPayloadSchema } from "./schemas";
import type { ConfirmPayload } from "./schemas";

export type ScanState = {
  error?: string;
  receiptId?: string;
  warnings?: string[];
  /** true si falta el consentimiento de IA: la UI debe pedirlo antes de reintentar. */
  needsAiConsent?: boolean;
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Tope de tamaño del fichero de ticket. Por debajo del bodySizeLimit (10 MB) de
 *  los Server Actions; acota memoria y coste de IA por petición. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Tope del catálogo embebido en el prompt (los más habituales); el resto lo
 *  cubre el fuzzy de la revisión (E6). Evita prompts enormes si el catálogo crece. */
const MAX_CATALOG_FOR_PROMPT = 300;

/** Tamaño de tanda para los updates que no tienen equivalente masivo en PostgREST
 *  (valores distintos por fila). Pasan de N secuenciales a ~N/10 tandas paralelas. */
const WRITE_CHUNK = 10;

/** Ejecuta `fn` sobre `items` en tandas paralelas de {@link WRITE_CHUNK}. El
 *  callback puede devolver un builder de PostgREST (thenable), no solo Promise.
 *  Devuelve los resultados en orden para poder comprobar `error` por respuesta. */
async function inChunks<T, R>(
  items: T[],
  fn: (item: T) => PromiseLike<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += WRITE_CHUNK) {
    const chunk = await Promise.all(
      items.slice(i, i + WRITE_CHUNK).map((item) => fn(item)),
    );
    results.push(...chunk);
  }
  return results;
}

export async function scanReceiptAction(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  // El archivo del ticket se envía a la IA de Google: no procesamos nada sin el
  // consentimiento explícito del usuario (barrera efectiva; cubre también el
  // Web Share Target, que llama a esta acción sin pasar por el gate de /escanear).
  const consent = await getAiConsent();
  if (!consent.consented) {
    return { error: AI_CONSENT_REQUIRED_ERROR, needsAiConsent: true };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No se recibió ningún archivo." };
  }
  if (!ACCEPTED.includes(file.type)) {
    return { error: "Formato no admitido. Usa una imagen o un PDF." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "El archivo es demasiado grande (máx. 8 MB)." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Comprobamos el tipo REAL por los magic bytes, no el que declara el cliente:
  // un binario arbitrario etiquetado como image/jpeg no debe llegar a la IA.
  const detectedType = sniffUploadType(bytes);
  if (!detectedType) {
    return { error: "El archivo no parece una imagen o un PDF válido." };
  }
  // Minimización: quita EXIF/GPS del JPEG antes de que la imagen salga hacia
  // Google (no afecta a la lectura; ver lib/image-metadata).
  const safeBytes = stripImageMetadata(bytes, detectedType);
  const supabase = createServerSupabaseClient();

  // Rate-limit: protege la cuota free-tier de Gemini frente al abuso de una sola
  // cuenta (una lectura de visión por escaneo).
  const rateError = await enforceAiRateLimit(supabase, "receipt");
  if (rateError) return { error: rateError };

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

  // Tiendas habituales del hogar (L15 f4): ayudan a normalizar store_chain
  // cuando el rótulo impreso no coincide con el nombre de la cadena. Las TIENDAS
  // PROPIAS (f5) van además al enum del esquema: sin eso el modelo no tiene
  // ningún valor con el que responder "esto es un ticket de Gadis" y lo único
  // que puede decir es "otro".
  const { chains: householdChains } = await getHouseholdChains();
  const promptChains = householdChains.map((key) => ({
    key,
    label: chainLabel(key),
  }));

  // El vocabulario COMPLETO del enum: las cadenas que la app conoce de serie más
  // las tiendas propias de este hogar. Se arma aquí y no en `lib/ai` porque el
  // vocabulario es de esta capa (ver `buildReceiptSchema`).
  const knownChains = CHAIN_OPTIONS.map((c) => c.value);
  const schemaChains = [...knownChains, ...householdChains.filter(isCustomChain)];

  // Extracción con IA (visión / documento). FilePart sirve tanto para imagen
  // como para PDF; el mediaType lo toma del propio archivo.
  let extraction;
  try {
    const { object } = await generateObject({
      model: getModel("receipts"),
      schema: buildReceiptSchema(schemaChains),
      abortSignal: AbortSignal.timeout(60_000),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildReceiptPrompt(
                promptCatalog,
                promptChains,
                knownChains,
              ),
            },
            { type: "file", data: safeBytes, mediaType: detectedType },
          ],
        },
      ],
    });
    extraction = object;
  } catch (err) {
    console.error("Error de extracción del ticket:", err);
    const kind = classifyAiError(err);
    return {
      error:
        kind === "rate_limit"
          ? "El servicio de IA está saturado ahora mismo. Espera un minuto y vuelve a intentarlo."
          : kind === "timeout"
            ? "La lectura del ticket tardó demasiado. Vuelve a intentarlo."
            : "No se pudo leer el ticket. Prueba con una foto más nítida o vuelve a intentarlo.",
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
    const { error: itemsErr } = await supabase
      .from("receipt_items")
      .insert(lineRows);
    if (itemsErr) {
      // Sin líneas, el ticket es un cascarón «Productos (0 de 0)» inservible:
      // se borra el recién creado para no dejar tickets huérfanos imposibles de usar.
      console.error("Error al guardar las líneas del ticket:", itemsErr);
      await supabase.from("receipts").delete().eq("id", receipt.id);
      return {
        error:
          "No se pudieron guardar las líneas del ticket. Vuelve a intentarlo.",
      };
    }
  }

  return { receiptId: receipt.id, warnings: extraction.warnings ?? [] };
}

/**
 * Descarta un ticket pendiente. Borra solo si NO está confirmado (`.neq` además
 * del `.eq` de id + hogar), para que nunca se pierda un ticket ya integrado en el
 * inventario. El FK de `receipt_items` es `on delete cascade`.
 */
export async function deleteReceiptAction(
  receiptId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("receipts")
    .delete()
    .eq("id", receiptId)
    .eq("household_id", household.id)
    .neq("status", "confirmed");
  if (error) {
    console.error("Error al descartar el ticket:", error);
    return { error: "No se pudo descartar el ticket. Inténtalo de nuevo." };
  }
  revalidatePath("/escanear");
  return { ok: true };
}

export type ProductAlias = {
  id: string;
  alias: string;
  /** Cadena donde se vio por última vez; null = origen desconocido (L17). */
  storeChain: string | null;
  lastSeenAt: string | null;
};

/**
 * Aliases aprendidos que apuntan a un producto (E8). Se cargan bajo demanda al
 * abrir el drawer de edición. La RLS de `product_aliases` restringe al hogar; el
 * filtro por household_id de abajo es defensa en profundidad, no sustitución.
 *
 * Trae también la cadena de origen (L17) para poder agruparlos por supermercado:
 * dos nombres en cadenas distintas son lo normal, dos en la MISMA son lo que hay
 * que limpiar. Degrada en suave mientras la migración no esté aplicada: si la
 * consulta falla por columna inexistente, se reintenta sin esos campos y el
 * gestor se comporta como antes (lista plana).
 */
export async function getProductAliasesAction(
  productId: string,
): Promise<ProductAlias[]> {
  // Defensa en profundidad (no sustituye a la RLS de product_aliases): se filtra
  // también por household_id, alineado con el patrón del resto de acciones.
  const household = await getCurrentHousehold();
  if (!household) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("product_aliases")
    .select("id, alias, store_chain, last_seen_at")
    .eq("product_id", productId)
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });
  if (!error) {
    return (data ?? []).map((a) => ({
      id: a.id,
      alias: a.alias,
      storeChain: a.store_chain,
      lastSeenAt: a.last_seen_at,
    }));
  }
  const { data: legacy } = await supabase
    .from("product_aliases")
    .select("id, alias")
    .eq("product_id", productId)
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });
  return (legacy ?? []).map((a) => ({
    id: a.id,
    alias: a.alias,
    storeChain: null,
    lastSeenAt: null,
  }));
}

/**
 * Borra un alias aprendido (E8). No toca historial de precios ni inventario:
 * solo hace que el siguiente escaneo de esa línea vuelva a pedir decisión.
 */
export async function deleteAliasAction(
  aliasId: string,
): Promise<{ ok?: boolean; error?: string }> {
  // Defensa en profundidad (no sustituye a la RLS de product_aliases): se filtra
  // también por household_id, alineado con el patrón del resto de acciones.
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("product_aliases")
    .delete()
    .eq("id", aliasId)
    .eq("household_id", household.id);
  if (error) return { error: "No se pudo borrar el nombre." };
  revalidatePath("/inventario");
  return { ok: true };
}

// Tipos de la confirmación: definidos y validados con zod en ./schemas. Se
// re-exportan aquí para que el cliente (receipt-review.tsx) los siga importando
// desde "../actions" sin cambios.
export type { ConfirmItemDecision, ConfirmPayload } from "./schemas";

export async function confirmReceiptAction(
  payload: ConfirmPayload,
): Promise<{
  error?: string;
  ok?: boolean;
  added?: number;
  /** Líneas que no sumaron stock por venir de una compra ya finalizada. */
  alreadyStocked?: number;
  inventoryItemIds?: string[];
  warnings?: string[];
  /** Aportación de este ticket a la hucha del hogar (G1). */
  savings?: ReceiptSavingsSummary;
  /** Lista vs. ticket (G2); ausente si no hay compra que emparejar. */
  trip?: TripComparison;
}> {
  // Validación de entrada (zod): acota cantidad, descripción y longitudes antes
  // de tocar inventario e historial de precios. Ver ./schemas.
  const parsed = confirmPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: "Los datos de la revisión no son válidos." };
  }
  payload = parsed.data;

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

  // Cadena corregida en la revisión (L15 f5). Solo se acepta si es una de las
  // que se le ofrecieron —conocidas, tiendas del hogar u "otro"—: el valor entra
  // en el historial de precios por tienda, así que texto libre del cliente aquí
  // ensuciaría las comparaciones para siempre.
  let storeChain = receipt.store_chain;
  if (payload.storeChain) {
    const { chains } = await getHouseholdChains();
    const allowed = new Set([
      ...chainOptions(chains).map((c) => c.value),
      "otro",
    ]);
    if (allowed.has(payload.storeChain)) storeChain = payload.storeChain;
  }

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
  let alreadyStocked = 0;
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
      // `total_price` viaja en este mismo lote (no cuesta un round-trip extra) para
      // poder valorar el ahorro del ticket (G1) sin volver a leer las líneas.
      .select("id, raw_text, added_to_inventory, total_price")
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
    /**
     * Cómo entra al inventario. Normalmente igual que `quantity`/`unit`, pero
     * los productos al peso pueden contarse por piezas en casa (0,72 kg → 1 ud)
     * sin tocar la línea, que es la que alimenta el historial de precios.
     */
    stockQuantity: number;
    stockUnit: UnitType;
    /** Resuelto ya (enlazado/existente) o null hasta insertar el producto nuevo. */
    productId: string | null;
    /** normalized_name para re-resolver tras insertar los productos nuevos. */
    normKey: string | null;
    location: LocationType;
    matchStatus: string;
    isNew: boolean;
    /** Su stock ya entró en el checkout de la lista: aquí solo cuenta el precio. */
    priceOnly: boolean;
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
    // Cómo entra al inventario: por defecto, tal cual lo dice el ticket.
    const stockUnit = dec.stockUnit ?? dec.unit;
    const stockQuantity = dec.stockQuantity ?? dec.quantity;

    // Solo se acepta el enlace si el producto pertenece al catálogo del hogar;
    // un id ajeno u obsoleto (merge/borrado) cae al camino por nombre.
    if (dec.productId && productById.has(dec.productId)) {
      resolved.push({
        itemId: dec.itemId,
        rawText,
        description: dec.description,
        quantity: dec.quantity,
        unit: dec.unit,
        stockQuantity,
        stockUnit,
        productId: dec.productId,
        normKey: null,
        location: productById.get(dec.productId)?.default_location ?? "pantry",
        matchStatus: "manual",
        isNew: false,
        priceOnly: dec.priceOnly,
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
        stockQuantity,
        stockUnit,
        productId: existing.id,
        normKey: null,
        location: existing.default_location,
        matchStatus: "manual",
        isNew: false,
        priceOnly: dec.priceOnly,
      });
    } else {
      if (!newProductsByNorm.has(normalized)) {
        newProductsByNorm.set(normalized, {
          name: dec.description,
          normalized_name: normalized,
          // La unidad del producto es la de su STOCK, no la de la línea: si esta
          // calabaza se cuenta por piezas, el producto nace en "ud" y el próximo
          // ticket en kg ya no chocará con el inventario.
          default_unit: stockUnit,
        });
      }
      resolved.push({
        itemId: dec.itemId,
        rawText,
        description: dec.description,
        quantity: dec.quantity,
        unit: dec.unit,
        stockQuantity,
        stockUnit,
        productId: null,
        normKey: normalized,
        location: "pantry",
        matchStatus: "new_product",
        isNew: true,
        // Un producto que no existía no pudo entrar en el checkout de la lista.
        priceOnly: false,
      });
    }
  }

  // ── PASADA 2 — escrituras por lotes ──────────────────────────────────────

  // 2.1 Productos nuevos: un único insert; vuelca ids a los mapas y re-resuelve
  //     las líneas que dependían de ellos (por normalized_name).
  const newProducts = [...newProductsByNorm.values()];
  if (newProducts.length) {
    const { data: created, error: createErr } = await supabase
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
    // Primera escritura de la pasada 2: abortar aquí es seguro (nada parcial).
    if (createErr) {
      console.error("Error al crear los productos nuevos del ticket:", createErr);
      return {
        error:
          "No se pudieron crear los productos nuevos del ticket. Vuelve a intentarlo.",
      };
    }
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
  //     clave del onConflict) antes de enviar. Cada nombre guarda la CADENA en la
  //     que se acaba de ver y la fecha de compra: de ahí sale el aviso de "en este
  //     supermercado ya lo llamabas de otra forma" (L17). Un ticket sin cadena
  //     identificada deja `store_chain` a null y simplemente no genera avisos.
  const aliasSeenAt = purchasedAt ?? new Date().toISOString();
  const aliasByNorm = new Map<
    string,
    {
      household_id: string;
      product_id: string;
      alias: string;
      alias_normalized: string;
      last_seen_at: string;
      store_chain?: string;
    }
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
        last_seen_at: aliasSeenAt,
        // Un ticket SIN cadena identificada no debe borrar la cadena que el
        // nombre ya tuviera: se omite la columna del upsert (PostgREST solo
        // actualiza las que van en el objeto) en vez de escribir null. La cadena
        // es la misma para todo el ticket, así que todas las filas del lote
        // tienen la misma forma y el upsert sigue siendo uno solo.
        ...(storeChain ? { store_chain: storeChain } : {}),
      });
    }
  }

  // Decisiones del aviso de renombrado (L17), indexadas por línea. Se resuelven
  // contra `processable` a propósito: una línea saltada no aprende ningún nombre
  // y por tanto no puede autorizar el borrado de otro.
  const renameByItem = new Map<
    string,
    { replaceAliasId: string | null; keepAliasId: string | null }
  >();
  for (const dec of payload.items) {
    if (dec.replaceAliasId || dec.keepAliasId) {
      renameByItem.set(dec.itemId, {
        replaceAliasId: dec.replaceAliasId ?? null,
        keepAliasId: dec.keepAliasId ?? null,
      });
    }
  }

  if (aliasByNorm.size) {
    // Best-effort deliberado: los aliases son capa de aprendizaje (E8), no datos
    // primarios. Un fallo aquí no debe abortar la confirmación ni comunicarse como
    // error al usuario; solo se registra para depuración.
    //
    // `ignoreDuplicates` pasa a false (upsert de verdad) porque `store_chain` y
    // `last_seen_at` tienen que refrescarse en los nombres que YA existían: si no,
    // un nombre aprendido hace meses nunca sabría en qué cadena sigue apareciendo.
    // El efecto secundario es deseable: reasociar a mano una línea cuyo nombre ya
    // apuntaba a otro producto ahora SÍ corrige el aprendizaje, en vez de que el
    // siguiente ticket vuelva a ignorar la decisión del usuario.
    const { error: aliasErr } = await supabase
      .from("product_aliases")
      .upsert([...aliasByNorm.values()], {
        onConflict: "household_id,alias_normalized",
      });
    if (aliasErr) {
      console.error("Error (no crítico) al guardar aliases del ticket:", aliasErr);
    } else if (renameByItem.size) {
      // Rótulos renombrados (L17). Solo después de que el nombre NUEVO esté
      // guardado: borrar antes podría dejar al producto sin ningún nombre que
      // reconocer. Se exige `product_id` además del id porque un id obsoleto o
      // manipulado no debe poder llevarse por delante el nombre de otro producto.
      const toDelete: { aliasId: string; productId: string }[] = [];
      const toDismiss: { aliasId: string; productId: string }[] = [];
      for (const r of processable) {
        const dec = renameByItem.get(r.itemId);
        if (!dec) continue;
        if (dec.replaceAliasId) {
          toDelete.push({ aliasId: dec.replaceAliasId, productId: r.productId });
        }
        if (dec.keepAliasId) {
          toDismiss.push({ aliasId: dec.keepAliasId, productId: r.productId });
        }
      }
      const renameResults = await inChunks(toDelete, (d) =>
        supabase
          .from("product_aliases")
          .delete()
          .eq("id", d.aliasId)
          .eq("product_id", d.productId)
          .eq("household_id", household.id),
      );
      const dismissResults = await inChunks(toDismiss, (d) =>
        supabase
          .from("product_aliases")
          .update({ rename_dismissed_at: new Date().toISOString() })
          .eq("id", d.aliasId)
          .eq("product_id", d.productId)
          .eq("household_id", household.id),
      );
      const renameErr = [...renameResults, ...dismissResults].find(
        (res) => res.error,
      )?.error;
      if (renameErr) {
        console.error(
          "Error (no crítico) al aplicar los renombrados de nombres:",
          renameErr,
        );
      }
    }
  }

  // 2.3 Líneas de ticket (historial de precios): valores distintos por fila y
  //     PostgREST no tiene update masivo → tandas paralelas de ~10.
  //
  // LIMITACIÓN ASUMIDA: estas escrituras NO son transaccionales. Un fallo entre el
  // marcado de `receipt_items.added_to_inventory` y las escrituras de inventario
  // (2.4) puede dejar líneas marcadas sin su stock sumado. Ese hueco ya existía en
  // el código por-línea original. La solución completa sería una RPC transaccional
  // (valores precomputados en TS), fuera del alcance de esta corrección. Lo que sí
  // garantizamos aquí es que un fallo se COMUNIQUE en vez de presentarse como éxito.
  // El orden de escrituras NO se reordena: cualquier alternativa tiene un modo de
  // fallo parcial simétrico y perdería la idempotencia por `added_to_inventory`.
  const itemUpdateResults = await inChunks(processable, (r) =>
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
      .eq("id", r.itemId)
      .eq("receipt_id", payload.receiptId),
  );
  if (itemUpdateResults.some((res) => res.error)) {
    console.error(
      "Error al actualizar líneas del ticket:",
      itemUpdateResults.find((res) => res.error)?.error,
    );
    return {
      error:
        "La confirmación falló a mitad. Vuelve a intentarlo: lo ya añadido no se duplicará.",
    };
  }
  // Líneas saltadas: un solo update (mismo valor para todas).
  if (skippedIds.length) {
    await supabase
      .from("receipt_items")
      .update({ match_status: "skipped" })
      .in("id", skippedIds)
      .eq("receipt_id", payload.receiptId);
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
      r.stockUnit === "ud" ? (packByProduct.get(r.productId) ?? null) : null;
    const invQty = packSize ? r.stockQuantity * packSize : r.stockQuantity;

    const key = invKey(r.productId, r.location);
    const inv = invSim.get(key);

    // Ya contabilizado en el checkout de la lista: esta línea aporta precio e
    // historial, pero NO existencias (sumarlas duplicaría el stock). Se exige
    // que la fila de inventario exista de verdad: si no está, el checkout no
    // llegó a crearla y saltarse la suma perdería stock en silencio, así que
    // cae al camino normal.
    if (r.priceOnly && inv) {
      // Se apunta igualmente su fila para que la revisión de caducidades siga
      // ofreciéndola: es lo recién comprado, y quien omitió las fechas al
      // finalizar la compra merece una segunda oportunidad de ponerlas.
      lineKeys.push(key);
      affectedProductIds.add(r.productId);
      alreadyStocked += 1;
      continue;
    }

    let addedToInventory = false;
    if (inv) {
      // NO sumar magnitudes de unidades distintas (ud + l = disparate).
      if (inv.unit === r.stockUnit) {
        inv.quantity += invQty;
        inv.dirty = true;
        addedToInventory = true;
      } else {
        warnings.push(
          `«${r.description}»: compraste ${formatQuantity(
            r.stockQuantity,
            r.stockUnit,
          )} pero en tu inventario está en ${UNIT_LABELS[inv.unit]}. No se sumó automáticamente; ajústalo a mano.`,
        );
      }
    } else {
      invSim.set(key, {
        id: null,
        product_id: r.productId,
        location: r.location,
        quantity: invQty,
        unit: r.stockUnit,
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
        unit: r.stockUnit,
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
  const invUpdateResults = await inChunks(invUpdates, (s) =>
    supabase
      .from("inventory_items")
      .update({ quantity: s.quantity, updated_by: userId })
      .eq("id", s.id as string),
  );
  if (invUpdateResults.some((res) => res.error)) {
    console.error(
      "Error al actualizar el inventario:",
      invUpdateResults.find((res) => res.error)?.error,
    );
    return {
      error:
        "La confirmación falló a mitad. Vuelve a intentarlo: lo ya añadido no se duplicará.",
    };
  }
  // (b) filas nuevas → un único insert.
  const invInserts = [...invSim.values()].filter((s) => !s.existing);
  let insertedInv: { id: string; product_id: string; location: LocationType }[] =
    [];
  if (invInserts.length) {
    const { data, error: invInsertErr } = await supabase
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
    if (invInsertErr) {
      console.error("Error al insertar en el inventario:", invInsertErr);
      return {
        error:
          "La confirmación falló a mitad. Vuelve a intentarlo: lo ya añadido no se duplicará.",
      };
    }
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

  // 2.65 Hucha del hogar (G1): saldo NETO de haber pagado por encima o por debajo
  //      de la referencia reciente de cada producto. Va en el camino crítico (una
  //      query) a propósito: el número se muestra al usuario justo al confirmar,
  //      que es el único momento en que le importa; calcularlo en `after()` lo
  //      dejaría llegar tarde a su propia pantalla. Nunca lanza (devuelve 0).
  //      En un reintento tras fallo parcial solo se valoran las líneas que queden
  //      por procesar, porque las ya marcadas no entran en `processable`.
  const savings = await computeSavingsForReceipt(supabase, {
    receiptId: payload.receiptId,
    purchasedAt,
    paid: processable.map((r) => ({
      productId: r.productId,
      totalPrice: (() => {
        const raw = itemById.get(r.itemId)?.total_price;
        return raw === null || raw === undefined ? null : Number(raw);
      })(),
      quantity: r.quantity,
      unit: r.unit,
      label: r.description,
    })),
  });

  // 2.66 Compra perfecta (G2): enlaza este ticket con la compra cerrada desde la
  //      lista y compara ambas. Sube al camino crítico —antes vivía en after()—
  //      porque ahora la tarjeta se muestra en la misma celebración: calcularlo
  //      después sería calcularlo tarde. Devuelve null si no hay compra que
  //      emparejar, que es lo normal en quien escanea tickets sin usar la lista.
  const tripProductIds = await linkReceiptToTrip(supabase, {
    receiptId: payload.receiptId,
    householdId: household.id,
    purchasedAt,
  });
  const trip = tripProductIds
    ? compareTripToReceipt(
        tripProductIds,
        processable.map((r) => ({
          productId: r.productId,
          label: r.description,
        })),
      )
    : null;

  // 2.7 Cierre del ticket. Al confirmar, `raw_extraction` (el JSON completo de la
  //     IA, ~5–15 KB/fila) ya no se lee nunca más: los descuentos quedan
  //     materializados en `discount_total` justo arriba. Se vacía para no acumular
  //     el dato más pesado de la BD. El cierre es el último paso, así que si la
  //     confirmación falla a mitad el ticket sigue `needs_review` con su JSON
  //     intacto y el reintento idempotente funciona igual.
  const { error: closeErr } = await supabase
    .from("receipts")
    .update({
      store_name: payload.storeName,
      store_chain: storeChain,
      purchased_at: purchasedAt,
      total_amount: payload.total,
      discount_total: discountTotal,
      savings_amount: savings.net,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      raw_extraction: null,
    })
    .eq("id", payload.receiptId);
  if (closeErr) {
    // El inventario ya se actualizó; el reintento es seguro porque las líneas
    // marcadas `added_to_inventory` se saltan (idempotencia).
    console.error("Error al cerrar el ticket:", closeErr);
    return {
      error:
        "El inventario se actualizó pero el ticket no quedó cerrado. Vuelve a confirmarlo.",
    };
  }

  revalidatePath("/inventario");
  revalidatePath("/precios");
  revalidatePath("/perfil");
  revalidatePath("/escanear");
  // `/lista` porque `linkReceiptToTrip` acaba de emparejar la compra con este
  // ticket: sin revalidar, el aviso «¿Tienes el ticket?» seguiría ahí ya escaneado.
  revalidatePath("/lista");

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

  return {
    ok: true,
    added,
    alreadyStocked,
    inventoryItemIds,
    warnings,
    savings: summarizeReceiptSavings(savings, discountTotal),
    trip: trip ?? undefined,
  };
}
