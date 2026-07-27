"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import { isKnownIcon } from "@/lib/product-icons/catalog";
import { getCurrentHousehold } from "@/features/household/queries";
import { refreshPriceInsights } from "@/features/prices/materialize";
import { getProductCatalog } from "@/features/shopping-list/queries";
import type {
  InventoryEventKind,
  LocationType,
  UnitType,
} from "@/lib/supabase/types";
import { UNIT_LABELS } from "@/lib/units";
import {
  addInventorySchema,
  editInventorySchema,
  expiryReviewSchema,
  starterItemsSchema,
} from "./schemas";
import { recordStockEvent } from "./events";

export type ActionState = { error?: string; ok?: boolean };

export async function addInventoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const parsed = addInventorySchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId") || undefined,
    location: formData.get("location"),
    unit: formData.get("unit"),
    quantity: formData.get("quantity"),
    expiryDate: formData.get("expiryDate") || undefined,
    minQuantity: formData.get("minQuantity") || undefined,
    packSize: formData.get("packSize") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  const supabase = createServerSupabaseClient();
  const normalized = normalizeName(d.name);

  // Resolver el producto: reutilizar si ya existe en el catálogo, si no crearlo.
  const { data: existing, error: selErr } = await supabase
    .from("products")
    .select("id")
    .eq("household_id", household.id)
    .eq("normalized_name", normalized)
    .maybeSingle();
  if (selErr) return { error: "Error al buscar el producto." };

  // Pack (F4): solo aplica a productos contables (ud). El multiplicador de
  // entrada se usa en la compra (checkout / ticket), no en el alta manual: aquí
  // solo se PERSISTE el tamaño de pack para futuras compras.
  const packSize = d.unit === "ud" ? d.packSize : null;

  let productId: string;
  if (existing) {
    productId = existing.id;
    const updates: {
      min_quantity?: number | null;
      category_id?: string;
      pack_size?: number | null;
    } = {};
    if (d.minQuantity !== null) updates.min_quantity = d.minQuantity;
    if (d.categoryId) updates.category_id = d.categoryId;
    if (d.unit === "ud") updates.pack_size = packSize;
    if (Object.keys(updates).length > 0) {
      await supabase
        .from("products")
        .update(updates)
        .eq("household_id", household.id)
        .eq("id", productId);
    }
  } else {
    const { data: created, error: insErr } = await supabase
      .from("products")
      .insert({
        household_id: household.id,
        name: d.name,
        normalized_name: normalized,
        category_id: d.categoryId,
        default_unit: d.unit,
        default_location: d.location,
        min_quantity: d.minQuantity,
        pack_size: packSize,
      })
      .select("id")
      .single();
    if (insErr || !created) return { error: "No se pudo crear el producto." };
    productId = created.id;
  }

  // Existencias: si ya hay una fila en esa ubicación, sumar; si no, crearla.
  const { data: invExisting } = await supabase
    .from("inventory_items")
    .select("id, quantity")
    .eq("household_id", household.id)
    .eq("product_id", productId)
    .eq("location", d.location)
    .maybeSingle();

  if (invExisting) {
    await supabase
      .from("inventory_items")
      .update({
        quantity: Number(invExisting.quantity) + d.quantity,
        unit: d.unit,
        updated_by: userId,
        ...(d.expiryDate ? { expiry_date: d.expiryDate } : {}),
      })
      .eq("id", invExisting.id);
  } else {
    const { error: invErr } = await supabase.from("inventory_items").insert({
      household_id: household.id,
      product_id: productId,
      location: d.location,
      quantity: d.quantity,
      unit: d.unit,
      expiry_date: d.expiryDate,
      updated_by: userId,
    });
    if (invErr) return { error: "No se pudo añadir al inventario." };
  }

  revalidatePath("/inventario");
  return { ok: true };
}

/**
 * Selector inicial "¿Qué tienes ya en casa?" (E12): crea en un gesto los
 * `inventory_items` reales de los productos que el usuario marca en el empty
 * state. Cantidad 1, unidad/ubicación por defecto del producto, sin caducidad —
 * mismo formato que el alta manual. `updated_by` = usuario actual.
 *
 * Los ids llegan del cliente pero se re-leen del catálogo del hogar (RLS +
 * filtro por household_id): el cliente solo dice QUÉ productos, nunca sus datos.
 * `on conflict (household_id, product_id, location) do nothing` lo hace
 * idempotente por si el producto ya tuviera existencias en esa ubicación.
 */
export async function addStarterItemsAction(
  productIds: string[],
): Promise<ActionState & { added?: number }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const parsed = starterItemsSchema.safeParse({ productIds });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const supabase = createServerSupabaseClient();
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, default_unit, default_location")
    .eq("household_id", household.id)
    .in("id", parsed.data.productIds);
  if (prodErr) return { error: "No se pudieron cargar los productos." };
  if (!products || products.length === 0) {
    return { error: "No hay productos que añadir." };
  }

  const rows = products.map((p) => ({
    household_id: household.id,
    product_id: p.id,
    location: p.default_location,
    quantity: 1,
    unit: p.default_unit,
    updated_by: userId,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("inventory_items")
    .upsert(rows, {
      onConflict: "household_id,product_id,location",
      ignoreDuplicates: true,
    })
    .select("id");
  if (insErr) return { error: "No se pudieron añadir los productos." };

  revalidatePath("/inventario");
  return { ok: true, added: inserted?.length ?? rows.length };
}

export async function setInventoryQuantityAction(
  id: string,
  quantity: number,
): Promise<ActionState> {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "Cantidad no válida." };
  }
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  // Cantidad previa para calcular el delta del evento (F5). El delta se calcula
  // SIEMPRE en el servidor (no confiamos en el cliente para el historial).
  const { data: prev } = await supabase
    .from("inventory_items")
    .select("household_id, product_id, quantity, unit")
    .eq("household_id", household.id)
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("inventory_items")
    .update({ quantity, updated_by: userId })
    .eq("household_id", household.id)
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar la cantidad." };

  // Evento de movimiento con folding anti-ruido (F5): delta<0 = consumido,
  // delta>0 = repuesto. Best-effort, no bloquea el stepper optimista.
  if (prev) {
    const delta = quantity - Number(prev.quantity);
    if (delta !== 0) {
      await recordStockEvent(supabase, {
        householdId: prev.household_id,
        productId: prev.product_id,
        quantity: Math.abs(delta),
        unit: prev.unit,
        kind: delta < 0 ? "consumed" : "restocked",
        userId,
        fold: true,
      });
    }
  }

  // Sin revalidatePath: el stepper es optimista en el cliente y persiste en
  // segundo plano; evita un refetch de toda la página en cada pulsación.
  return { ok: true };
}

export async function updateInventoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const parsed = editInventorySchema.safeParse({
    inventoryId: formData.get("inventoryId"),
    productId: formData.get("productId"),
    name: formData.get("name"),
    location: formData.get("location"),
    quantity: formData.get("quantity"),
    expiryDate: formData.get("expiryDate") || undefined,
    useSoon: formData.get("useSoon") || undefined,
    minQuantity: formData.get("minQuantity") || undefined,
    packSize: formData.get("packSize") || undefined,
    unit: formData.get("unit") || undefined,
    preferredChain: formData.get("preferredChain") || undefined,
    icon: formData.get("icon") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  // Icono manual (L16): solo se acepta un slug conocido del registro; cualquier
  // otra cosa se ignora (null = automático), nunca bloquea el guardado.
  const icon = isKnownIcon(d.icon) ? d.icon : null;
  const supabase = createServerSupabaseClient();

  // Renombrar el producto si cambió el nombre. La unicidad es por
  // (household_id, normalized_name): si el nuevo nombre choca con otro producto
  // del catálogo, rechazamos en vez de fusionar (evita perder datos enlazados).
  const normalized = normalizeName(d.name);
  const { data: clash } = await supabase
    .from("products")
    .select("id")
    .eq("household_id", household.id)
    .eq("normalized_name", normalized)
    .neq("id", d.productId)
    .maybeSingle();
  if (clash) {
    return { error: "Ya existe otro producto con ese nombre." };
  }
  const productUpdate: {
    name: string;
    normalized_name: string;
    category_id: string | null;
    min_quantity: number | null;
    preferred_chain: string | null;
    icon: string | null;
    pack_size?: number | null;
    default_unit?: UnitType;
  } = {
    name: d.name,
    normalized_name: normalized,
    category_id: d.categoryId,
    min_quantity: d.minQuantity,
    // Tienda preferida (L15); null lo limpia (sin preferencia).
    preferred_chain: d.preferredChain,
    // Icono manual (L16); null lo limpia (vuelve al automático).
    icon,
  };
  // Pack (F4): solo se toca para filas contables (ud); null lo limpia.
  if (d.unit === "ud") productUpdate.pack_size = d.packSize;
  // La unidad de la fila editada pasa a ser la del producto: es la que usarán
  // las próximas compras y sugerencias, y dejarlas desalineadas reproduciría el
  // conflicto de unidades en el siguiente ticket.
  if (d.unit) productUpdate.default_unit = d.unit;
  const { error: prodErr } = await supabase
    .from("products")
    .update(productUpdate)
    .eq("household_id", household.id)
    .eq("id", d.productId);
  if (prodErr) return { error: "No se pudo guardar el nombre." };

  // La tienda preferida entra en la cadena efectiva del aviso de ahorro; al poder
  // cambiar aquí, rematerializamos las señales de precio de este producto
  // (best-effort; el aviso reaparece igualmente al confirmar el próximo ticket).
  await refreshPriceInsights(supabase, household.id, [d.productId]);

  // Ubicación de destino: si ya existe una fila del mismo producto en esa
  // ubicación (unique household_id, product_id, location), fusionamos sumando
  // cantidades y borramos la fila movida; si no, movemos la fila.
  const { data: target } = await supabase
    .from("inventory_items")
    .select("id, quantity, unit")
    .eq("household_id", household.id)
    .eq("product_id", d.productId)
    .eq("location", d.location)
    .neq("id", d.inventoryId)
    .maybeSingle();

  if (target) {
    // Sumar magnitudes de unidades distintas (2 ud + 0,7 kg) daría un número sin
    // significado, así que se rechaza en vez de fusionar a ciegas.
    if (d.unit && target.unit !== d.unit) {
      return {
        error: `Ya tienes este producto en esa ubicación medido en ${UNIT_LABELS[target.unit]}. Unifica la unidad antes de moverlo.`,
      };
    }
    const { error: mergeErr } = await supabase
      .from("inventory_items")
      .update({
        quantity: Number(target.quantity) + d.quantity,
        expiry_date: d.expiryDate,
        use_soon: d.useSoon,
        updated_by: userId,
      })
      .eq("household_id", household.id)
      .eq("id", target.id);
    if (mergeErr) return { error: "No se pudo mover el producto." };
    await supabase
      .from("inventory_items")
      .delete()
      .eq("household_id", household.id)
      .eq("id", d.inventoryId);
  } else {
    const { error: invErr } = await supabase
      .from("inventory_items")
      .update({
        location: d.location,
        quantity: d.quantity,
        ...(d.unit ? { unit: d.unit } : {}),
        expiry_date: d.expiryDate,
        use_soon: d.useSoon,
        updated_by: userId,
      })
      .eq("household_id", household.id)
      .eq("id", d.inventoryId);
    if (invErr) return { error: "No se pudo guardar." };
  }

  revalidatePath("/inventario");
  return { ok: true };
}

/**
 * Ancla/desancla un producto en "Mis habituales" del usuario actual (E5). Es un
 * toggle: si ya está anclado lo quita, si no lo añade. La RLS garantiza que un
 * usuario solo toca sus propios pines dentro de su hogar.
 */
export async function togglePinAction(
  productId: string,
): Promise<ActionState & { pinned?: boolean }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  if (!userId) return { error: "No autenticado." };
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("user_pinned_products")
    .select("product_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_pinned_products")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", productId);
    if (error) return { error: "No se pudo desanclar." };
    revalidatePath("/inventario");
    return { ok: true, pinned: false };
  }

  const { error } = await supabase.from("user_pinned_products").insert({
    user_id: userId,
    household_id: household.id,
    product_id: productId,
  });
  if (error) return { error: "No se pudo anclar." };
  revalidatePath("/inventario");
  return { ok: true, pinned: true };
}

/** Producto candidato para fusionar (forma mínima del combobox). */
export type MergeCandidate = {
  id: string;
  name: string;
  normalizedName: string;
  defaultLocation: LocationType;
  defaultUnit: UnitType;
  purchaseCount: number;
};

/** Otros productos del hogar (todos menos el actual), para el combobox de fusión (E9). */
export async function getMergeCandidatesAction(
  excludeProductId: string,
): Promise<MergeCandidate[]> {
  const catalog = await getProductCatalog();
  return catalog
    .filter((p) => p.id !== excludeProductId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      normalizedName: p.normalizedName,
      defaultLocation: p.defaultLocation,
      defaultUnit: p.defaultUnit,
      purchaseCount: p.purchaseCount,
    }));
}

/**
 * Fusiona un producto (origen) en otro (destino) vía el RPC transaccional
 * `merge_products` (E9): repunta historial de precios, inventario, aliases,
 * recetas, lista y pines; suma habitualidad; borra el origen. Las guardas de
 * hogar viven en el RPC (security definer).
 */
export async function mergeProductsAction(
  sourceProductId: string,
  targetProductId: string,
): Promise<ActionState> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("merge_products", {
    p_source: sourceProductId,
    p_target: targetProductId,
  });
  if (error) {
    const messages: Record<string, string> = {
      same_product: "No puedes fusionar un producto consigo mismo.",
      product_not_found: "Producto no encontrado.",
      different_household: "Los productos son de hogares distintos.",
      not_a_member: "No perteneces a este hogar.",
      not_authenticated: "No autenticado.",
    };
    const key = Object.keys(messages).find((k) => error.message.includes(k));
    return { error: key ? messages[key] : "No se pudieron fusionar los productos." };
  }

  // El destino absorbe el histórico del origen → sus señales de precio cambian.
  // Rematerializamos solo el destino (best-effort).
  const household = await getCurrentHousehold();
  if (household) {
    await refreshPriceInsights(supabase, household.id, [targetProductId]);
  }

  revalidatePath("/inventario");
  revalidatePath("/precios");
  revalidatePath("/perfil");
  return { ok: true };
}

/**
 * Elimina un ítem del inventario y registra la baja (M8). `kind` distingue si
 * lo que quedaba se consumió o se tiró: el desperdicio ('discarded') se valora
 * en euros en el panel de gasto. Por defecto 'consumed' (caso feliz, sin
 * fricción). Solo se registra evento si quedaba cantidad > 0.
 */
export async function deleteInventoryAction(
  id: string,
  kind: InventoryEventKind = "consumed",
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  // `kind` llega del cliente: validarlo en runtime (no basta el tipo TS).
  if (kind !== "consumed" && kind !== "discarded" && kind !== "restocked") {
    return { error: "Tipo de baja no válido." };
  }
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  // Cantidad/unidad/producto antes de borrar, para el evento de baja.
  const { data: item } = await supabase
    .from("inventory_items")
    .select("product_id, quantity, unit")
    .eq("household_id", household.id)
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("household_id", household.id)
    .eq("id", id);
  if (error) return { error: "No se pudo eliminar." };

  if (item && Number(item.quantity) > 0) {
    await supabase.from("inventory_events").insert({
      household_id: household.id,
      product_id: item.product_id,
      quantity: Number(item.quantity),
      unit: item.unit,
      kind,
      created_by: userId,
    });
  }

  revalidatePath("/inventario");
  revalidatePath("/precios");
  revalidatePath("/perfil");
  return { ok: true };
}

export type ExpiryReviewUpdate = {
  id: string;
  expiryDate: string | null;
  useSoon: boolean;
};

/**
 * Revisión de caducidades tras la compra: fija `expiry_date` / `use_soon` en
 * lote para los items recién comprados. Solo escribe filas que cambian de
 * verdad, y solo del hogar activo. Es idempotente y opcional (omitir no llama a
 * esta acción).
 */
export async function saveExpiryReviewAction(
  updates: ExpiryReviewUpdate[],
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const parsed = expiryReviewSchema.safeParse({ updates });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const supabase = createServerSupabaseClient();
  for (const u of parsed.data.updates) {
    const { error } = await supabase
      .from("inventory_items")
      .update({
        expiry_date: u.expiryDate,
        use_soon: u.useSoon,
        updated_by: userId,
      })
      .eq("household_id", household.id)
      .eq("id", u.id);
    if (error) return { error: "No se pudieron guardar los cambios." };
  }

  revalidatePath("/inventario");
  return { ok: true };
}
