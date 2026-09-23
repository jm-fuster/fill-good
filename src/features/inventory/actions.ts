"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import { isKnownIcon } from "@/lib/product-icons/catalog";
import { trackUsage } from "@/lib/usage";
import { getCurrentHousehold } from "@/features/household/queries";
import { refreshPriceInsights } from "@/features/prices/materialize";
import { getProductCatalog } from "@/features/shopping-list/queries";
import type { LocationType, UnitType } from "@/lib/supabase/types";
import {
  addStockQuantity,
  formatQuantity,
  LOCATION_LABELS,
  UNIT_LABELS,
  type UnitContent,
} from "@/lib/units";
import {
  addInventorySchema,
  editInventorySchema,
  expiryReviewSchema,
  starterItemsSchema,
} from "./schemas";
import { recordStockEvent } from "./events";
import { answerToQuantity, type PantryAnswer } from "./pantry-review";

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
    contentSize: formData.get("contentSize") || undefined,
    contentUnit: formData.get("contentUnit") || undefined,
    contentIsEstimate: formData.get("contentIsEstimate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  if (d.contentSize !== null && d.contentUnit === null) {
    return { error: "Elige la unidad del contenido (ml, l, g o kg)." };
  }
  const supabase = createServerSupabaseClient();
  const normalized = normalizeName(d.name);

  // Resolver el producto: reutilizar si ya existe en el catálogo, si no crearlo.
  // El contenido del catálogo hace de puente ud↔medida al sumar existencias.
  const { data: existing, error: selErr } = await supabase
    .from("products")
    .select("id, content_size, content_unit, content_is_estimate")
    .eq("household_id", household.id)
    .eq("normalized_name", normalized)
    .maybeSingle();
  if (selErr) return { error: "Error al buscar el producto." };

  // Pack (F4): solo aplica a productos contables (ud). El multiplicador de
  // entrada se usa en la compra (checkout / ticket), no en el alta manual: aquí
  // solo se PERSISTE el tamaño de pack para futuras compras.
  const packSize = d.unit === "ud" ? d.packSize : null;

  // Contenido por unidad: describe el envase de un producto que se CUENTA, así
  // que solo tiene sentido en 'ud' (en kg la medida ya es la cantidad). Se
  // guarda en pareja o no se guarda.
  const content =
    d.unit === "ud" && d.contentSize !== null && d.contentUnit !== null
      ? {
          content_size: d.contentSize,
          content_unit: d.contentUnit,
          content_is_estimate: d.contentIsEstimate,
        }
      : {
          content_size: null,
          content_unit: null,
          content_is_estimate: false,
        };

  let productId: string;
  if (existing) {
    productId = existing.id;
    const updates: {
      min_quantity?: number | null;
      category_id?: string;
      pack_size?: number | null;
      content_size?: number | null;
      content_unit?: UnitType | null;
      content_is_estimate?: boolean;
    } = {};
    if (d.minQuantity !== null) updates.min_quantity = d.minQuantity;
    if (d.categoryId) updates.category_id = d.categoryId;
    if (d.unit === "ud") {
      updates.pack_size = packSize;
      // Solo si el alta trae contenido: un alta rápida sin ese campo no debe
      // borrar el que ya tenía el producto del catálogo.
      if (content.content_size !== null) Object.assign(updates, content);
    }
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
        ...content,
      })
      .select("id")
      .single();
    if (insErr || !created) return { error: "No se pudo crear el producto." };
    productId = created.id;
  }

  // Existencias: si ya hay una fila en esa ubicación, sumar; si no, crearla.
  const { data: invExisting } = await supabase
    .from("inventory_items")
    .select("id, quantity, unit, expiry_date")
    .eq("household_id", household.id)
    .eq("product_id", productId)
    .eq("location", d.location)
    .maybeSingle();

  if (invExisting) {
    // La política de reposición (addStockQuantity): sumar solo lo que se puede
    // convertir honestamente, y siempre en la unidad que YA tiene la fila —
    // antes «500 g» + alta de «1 kg» dejaba la fila en 501 kg.
    const bridgeContent: UnitContent =
      d.contentSize !== null && d.contentUnit !== null
        ? { size: d.contentSize, unit: d.contentUnit, estimate: d.contentIsEstimate }
        : existing?.content_size != null && existing.content_unit != null
          ? {
              size: Number(existing.content_size),
              unit: existing.content_unit,
              estimate: existing.content_is_estimate,
            }
          : null;
    const merged = addStockQuantity(
      Number(invExisting.quantity),
      invExisting.unit,
      d.quantity,
      d.unit,
      bridgeContent,
    );
    if (merged === null) {
      return {
        error: `En esa ubicación ya lo tienes en ${UNIT_LABELS[invExisting.unit]}: añade en esa unidad, o edita la fila si quieres cambiarla.`,
      };
    }
    // De las caducidades, la MÁS PRÓXIMA: el aviso de «caduca pronto» no se
    // pierde porque el lote nuevo dure más (mismo criterio que la fusión).
    const expiry =
      d.expiryDate && invExisting.expiry_date
        ? d.expiryDate < invExisting.expiry_date
          ? d.expiryDate
          : invExisting.expiry_date
        : (d.expiryDate ?? invExisting.expiry_date);
    const { error: updErr } = await supabase
      .from("inventory_items")
      .update({
        quantity: merged,
        updated_by: userId,
        expiry_date: expiry,
      })
      .eq("id", invExisting.id);
    if (updErr) return { error: "No se pudo añadir al inventario." };
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

  const { data: tocadas, error } = await supabase
    .from("inventory_items")
    .update({ quantity, updated_by: userId })
    .eq("household_id", household.id)
    .eq("id", id)
    .select("id");
  if (error) return { error: "No se pudo actualizar la cantidad." };
  // Un update sin filas no es un error para Supabase, y aquí no revalidamos
  // nada (el stepper es optimista), así que sin este recuento el número que se
  // quedaba en pantalla no lo respaldaba ninguna fila: el otro móvil había
  // borrado el producto y este seguía sumando y restando sobre un fantasma
  // hasta la siguiente recarga.
  if (!tocadas || tocadas.length === 0) {
    return { error: "Ese producto ya no está en tu inventario." };
  }

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
    // OJO al quitar esta línea: sin ella el esquema da la categoría por ausente
    // y la resuelve a null, así que el update de abajo no es que ignore el
    // cambio, es que BORRA la categoría en cada guardado del panel.
    categoryId: formData.get("categoryId") || undefined,
    location: formData.get("location"),
    quantity: formData.get("quantity"),
    expiryDate: formData.get("expiryDate") || undefined,
    useSoon: formData.get("useSoon") || undefined,
    minQuantity: formData.get("minQuantity") || undefined,
    packSize: formData.get("packSize") || undefined,
    contentSize: formData.get("contentSize") || undefined,
    contentUnit: formData.get("contentUnit") || undefined,
    contentIsEstimate: formData.get("contentIsEstimate") || undefined,
    unit: formData.get("unit") || undefined,
    preferredChain: formData.get("preferredChain") || undefined,
    icon: formData.get("icon") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  if (d.contentSize !== null && d.contentUnit === null) {
    return { error: "Elige la unidad del contenido (ml, l, g o kg)." };
  }
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
    content_size?: number | null;
    content_unit?: UnitType | null;
    content_is_estimate?: boolean;
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
  // Contenido por unidad: mismo trato. Aquí el campo SÍ está en el formulario,
  // así que vaciarlo limpia el contenido (a diferencia del alta rápida).
  if (d.unit === "ud") {
    const hasContent = d.contentSize !== null && d.contentUnit !== null;
    productUpdate.content_size = hasContent ? d.contentSize : null;
    productUpdate.content_unit = hasContent ? d.contentUnit : null;
    // Sin contenido la bandera no puede quedar en true (lo impide la
    // restricción `products_content_estimate_needs_content`).
    productUpdate.content_is_estimate = hasContent && d.contentIsEstimate;
  }
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
  const { data: occupant } = await supabase
    .from("inventory_items")
    .select("id, quantity, unit, expiry_date, use_soon")
    .eq("household_id", household.id)
    .eq("product_id", d.productId)
    .eq("location", d.location)
    .neq("id", d.inventoryId)
    .maybeSingle();

  // Sumar magnitudes de unidades distintas (2 ud + 0,7 kg) daría un número sin
  // significado, así que se rechaza en vez de fusionar a ciegas. Pero solo hay
  // conflicto REAL si ambas filas tienen stock: una fila a cero no aporta
  // magnitud, así que se elimina y el movimiento sigue (su historial vive en
  // inventory_events, no se pierde). Sin esto, la fila agotada que dejaba una
  // fusión de duplicados bloqueaba el movimiento sin nada visible que unificar.
  let target = occupant;
  if (target && d.unit && target.unit !== d.unit) {
    if (Number(target.quantity) === 0) {
      const { error: delErr } = await supabase
        .from("inventory_items")
        .delete()
        .eq("household_id", household.id)
        .eq("id", target.id);
      if (delErr) return { error: "No se pudo mover el producto." };
      target = null;
    } else if (d.quantity === 0) {
      // La fila movida es la vacía: quitarla y dejar intacta la del destino.
      const { error: delErr } = await supabase
        .from("inventory_items")
        .delete()
        .eq("household_id", household.id)
        .eq("id", d.inventoryId);
      if (delErr) return { error: "No se pudo mover el producto." };
      revalidatePath("/inventario");
      return { ok: true };
    } else {
      return {
        error: `En ${LOCATION_LABELS[d.location].toLowerCase()} ya tienes ${formatQuantity(Number(target.quantity), target.unit)} de este producto, y esta fila va en ${UNIT_LABELS[d.unit]}. Unifica las unidades antes de moverlo.`,
      };
    }
  }

  if (target) {
    // De las caducidades, la MÁS PRÓXIMA, y «gastar pronto» sobrevive si
    // cualquiera de las dos filas lo tenía: fusionar no puede apagar un aviso
    // (mismo criterio que mergeInventoryRowsAction). Antes los valores del
    // formulario pisaban los del destino: mover una fila sin fecha encima de
    // «caduca el sábado» borraba la fecha.
    const expiry =
      d.expiryDate && target.expiry_date
        ? d.expiryDate < target.expiry_date
          ? d.expiryDate
          : target.expiry_date
        : (d.expiryDate ?? target.expiry_date);
    const { error: mergeErr } = await supabase
      .from("inventory_items")
      .update({
        quantity: Number(target.quantity) + d.quantity,
        expiry_date: expiry,
        use_soon: d.useSoon || target.use_soon,
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
    const { data: tocadas, error: invErr } = await supabase
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
      .eq("id", d.inventoryId)
      .select("id");
    if (invErr) return { error: "No se pudo guardar." };
    /*
      Aquí el «ok» sobre cero filas era peor que en el stepper, porque este
      formulario ya ha escrito ANTES en `products` (nombre, unidad, mínimo,
      envase). Si la fila de inventario desapareció entre tanto, el producto
      quedaba renombrado y la fila sin actualizar —un guardado a medias— y la
      pantalla decía «Cambios guardados» sobre las dos cosas.

      No se puede deshacer lo de `products` (no hay transacción), así que lo que
      toca es decir exactamente qué pasó en vez de fingir que todo fue bien.
    */
    if (!tocadas || tocadas.length === 0) {
      return {
        error:
          "Ese producto ya no está en tu inventario: se guardaron sus datos, pero no la cantidad ni la caducidad.",
      };
    }
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

  // El productId llega del cliente: comprobamos que es del hogar activo antes de
  // anclarlo (la RLS del pin solo mira user_id + membresía, no que el producto
  // sea de ESTE hogar), para no crear pines inconsistentes entre hogares.
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("household_id", household.id)
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { error: "Producto no válido." };

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

/** Fila del MISMO producto viviendo en otra ubicación. */
export type SameProductRow = {
  id: string;
  location: LocationType;
  quantity: number;
  unit: UnitType;
};

/**
 * Otras filas del mismo producto, en otras ubicaciones.
 *
 * El inventario es POR ubicación (unique household_id, product_id, location),
 * así que ver «Plátano» dos veces en la lista no significa que haya dos
 * productos en el catálogo: casi siempre es uno solo repartido entre la nevera
 * y la despensa. Y esa lectura no se puede hacer desde la ficha, porque el
 * combobox de «Fusionar con otro producto» —que arregla el otro problema, el
 * del catálogo duplicado— excluye precisamente el producto que se está mirando.
 * El resultado era un callejón sin salida: dos filas idénticas y un buscador
 * que nunca encuentra la de al lado.
 */
export async function getSameProductRowsAction(
  productId: string,
  excludeInventoryId: string,
): Promise<SameProductRow[]> {
  const household = await getCurrentHousehold();
  if (!household) return [];
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("inventory_items")
    .select("id, location, quantity, unit")
    .eq("household_id", household.id)
    .eq("product_id", productId)
    .neq("id", excludeInventoryId);
  return (data ?? []).map((r) => ({
    id: r.id,
    location: r.location,
    quantity: Number(r.quantity),
    unit: r.unit,
  }));
}

/**
 * Junta en UNA sola fila el mismo producto repartido por varias ubicaciones:
 * todo se acumula en la de `targetInventoryId` y las demás desaparecen. No es
 * una fusión de catálogo (el producto siempre fue uno), así que no toca precios
 * ni aliases; tampoco anota un evento de stock, porque el total del hogar no
 * cambia — solo deja de estar en dos sitios.
 */
export async function mergeInventoryRowsAction(
  targetInventoryId: string,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const { data: target } = await supabase
    .from("inventory_items")
    .select("id, product_id, location, quantity, unit, expiry_date, use_soon")
    .eq("household_id", household.id)
    .eq("id", targetInventoryId)
    .maybeSingle();
  if (!target) return { error: "Producto no encontrado." };

  const { data: othersData, error: othersErr } = await supabase
    .from("inventory_items")
    .select("id, location, quantity, unit, expiry_date, use_soon")
    .eq("household_id", household.id)
    .eq("product_id", target.product_id)
    .neq("id", target.id);
  if (othersErr) return { error: "No se pudo juntar el producto." };
  const others = othersData ?? [];
  if (others.length === 0) return { ok: true };

  // Sumar magnitudes de unidades distintas (2 ud + 0,7 kg) daría un número sin
  // significado. Pero solo hay conflicto REAL entre filas CON stock: una a cero
  // no aporta magnitud, así que se absorbe sin mirar su unidad (su historial
  // vive en inventory_events, no se pierde). Ese detalle importa porque la fila
  // agotada es justo el residuo que dejan las compras y los ajustes.
  const stocked = [target, ...others].filter((r) => Number(r.quantity) > 0);
  const units = new Set(stocked.map((r) => r.unit));
  if (units.size > 1) {
    const detail = stocked
      .map(
        (r) =>
          `${formatQuantity(Number(r.quantity), r.unit)} en ${LOCATION_LABELS[
            r.location
          ].toLowerCase()}`,
      )
      .join(" y ");
    return {
      error: `No se pueden sumar unidades distintas (${detail}). Unifica las unidades antes de juntarlo.`,
    };
  }

  // Caducidad y avisos los ponen SOLO las filas con stock: la fecha de una fila
  // agotada describe un lote que ya no existe, y heredarla dejaría 10 plátanos
  // recién comprados marcados como caducados. Con todo a cero no hay nada que
  // heredar y sobrevive lo que ya tenía el destino.
  const contributing = stocked.length > 0 ? stocked : [target];
  // La unidad la manda el stock, que puede no ser la del destino: absorber 2 kg
  // en una fila vacía marcada en «ud» la dejaría mintiendo.
  const mergedUnit = contributing[0].unit;
  const mergedQuantity = stocked.reduce((sum, r) => sum + Number(r.quantity), 0);
  // De las fechas, la MÁS PRÓXIMA: quedarse la del destino escondería el lote
  // que caduca esta semana, que es el aviso por el que existe la pantalla.
  const mergedExpiry = contributing
    .map((r) => r.expiry_date)
    .filter((d): d is string => d !== null)
    .sort()[0];
  const mergedUseSoon = contributing.some((r) => r.use_soon);

  const { error: updErr } = await supabase
    .from("inventory_items")
    .update({
      quantity: mergedQuantity,
      unit: mergedUnit,
      expiry_date: mergedExpiry ?? null,
      use_soon: mergedUseSoon,
      updated_by: userId,
    })
    .eq("household_id", household.id)
    .eq("id", target.id);
  if (updErr) return { error: "No se pudo juntar el producto." };

  const { error: delErr } = await supabase
    .from("inventory_items")
    .delete()
    .eq("household_id", household.id)
    .in(
      "id",
      others.map((r) => r.id),
    );
  if (delErr) return { error: "No se pudo juntar el producto." };

  revalidatePath("/inventario");
  return { ok: true };
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
 * Elimina un ítem del inventario y registra la baja. Toda baja desde la app se
 * anota como 'consumed': la app ya no distingue si lo que quedaba se consumió o
 * se tiró, así que tampoco se pregunta. El valor 'discarded' sigue existiendo en
 * la base porque hay eventos antiguos y porque la skill de Alexa lo usa, pero
 * ninguna pantalla lo cuenta aparte. Solo se registra evento si quedaba
 * cantidad > 0.
 */
export async function deleteInventoryAction(id: string): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
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
      kind: "consumed",
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
  let guardadas = 0;
  for (const u of parsed.data.updates) {
    const { data, error } = await supabase
      .from("inventory_items")
      .update({
        expiry_date: u.expiryDate,
        use_soon: u.useSoon,
        updated_by: userId,
      })
      .eq("household_id", household.id)
      .eq("id", u.id)
      .select("id");
    if (error) return { error: "No se pudieron guardar los cambios." };
    if (data && data.length > 0) guardadas += 1;
  }

  /*
    Esta pantalla llega desde la confirmación de un ticket con una lista de ids
    en la URL, así que entre que se abre y se pulsa «Guardar» cabe de todo: que
    el otro móvil borre esos productos, o que la URL se haya compartido y lleve
    ids de otro hogar. Con el bucle sin contar nada, el usuario repasaba veinte
    caducidades, veía «Caducidades guardadas» y volvía al inventario con las
    fechas sin poner.

    No se exige que se guarden TODAS —que una fila de las veinte haya
    desaparecido no invalida las otras diecinueve— pero cero de veinte no es un
    éxito, es no haber hecho nada.
  */
  if (parsed.data.updates.length > 0 && guardadas === 0) {
    return {
      error: "Esos productos ya no están en tu inventario. Vuelve a abrir la revisión.",
    };
  }

  revalidatePath("/inventario");
  return { ok: true };
}

/**
 * Guarda UNA respuesta del repaso semanal de despensa.
 *
 * Va de una en una y no en lote a propósito: el repaso son ocho preguntas que se
 * contestan de un toque, y quien abandona a la cuarta no debe perder las tres
 * anteriores. En lote, cerrar el sheet a medias tiraría todo el trabajo — y este
 * es un ritual que se gana o se pierde por lo que cuesta la primera vez.
 *
 * Las tres respuestas sellan `reviewed_at`, incluida «queda», que no cambia
 * ningún otro valor de la fila: ese sello es lo único que impide que la semana
 * siguiente vuelva la misma pregunta (ver `pantry-review.ts` y
 * `npm run check:repaso`). Solo «se acabó» toca la cantidad.
 */
export async function savePantryReviewAction(
  id: string,
  answer: PantryAnswer,
): Promise<ActionState> {
  if (answer !== "have" && answer !== "low" && answer !== "out") {
    return { error: "Respuesta no válida." };
  }
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  // Se lee antes de escribir por dos motivos: el evento necesita el producto, la
  // unidad y la cantidad que había (el delta se calcula SIEMPRE en el servidor),
  // y hace falta saber si la fila sigue existiendo en ESTE hogar. Sin la lectura,
  // un update que no encuentra fila no es un error para Supabase y la pantalla
  // daría por guardada una respuesta que no se escribió en ninguna parte —basta
  // que el otro móvil haya borrado el producto mientras tenías el repaso abierto.
  const { data: prev } = await supabase
    .from("inventory_items")
    .select("product_id, quantity, unit")
    .eq("household_id", household.id)
    .eq("id", id)
    .maybeSingle();
  if (!prev) return { error: "Ese producto ya no está en tu inventario." };

  const nueva = answerToQuantity(answer);
  const { data: tocadas, error } = await supabase
    .from("inventory_items")
    .update({
      reviewed_at: new Date().toISOString(),
      updated_by: userId,
      ...(nueva === null ? {} : { quantity: nueva }),
    })
    .eq("household_id", household.id)
    .eq("id", id)
    .select("id");
  if (error) return { error: "No se pudo guardar la respuesta." };
  if (!tocadas || tocadas.length === 0) {
    return { error: "Ese producto ya no está en tu inventario." };
  }

  // Lo que se ha acabado salió de casa de verdad, aunque nadie sepa cuándo: se
  // anota igual que el borrado de una fila con stock. SIN `fold`, porque agrupar
  // esta corrección con el último movimiento del stepper mezclaría dos cosas
  // distintas (ver el aviso de `events.ts`).
  if (answer === "out" && Number(prev.quantity) > 0) {
    await recordStockEvent(supabase, {
      householdId: household.id,
      productId: prev.product_id,
      quantity: Number(prev.quantity),
      unit: prev.unit,
      kind: "consumed",
      userId,
    });
  }

  // El sello del hogar se pone en CADA respuesta, no al cerrar el repaso: es lo
  // que hace que la tarjeta no vuelva a salir esta semana, y si dependiera de un
  // paso final, quien contesta cuatro y se va se encontraría la pregunta otra
  // vez. Es un timestamp, así que reescribirlo ocho veces no cuesta nada.
  //
  // Su fallo NO se devuelve como error: la respuesta ya está guardada en su
  // fila, y revertirla en pantalla por el sello del hogar sería mentir al
  // revés. Pero tampoco se calla: sin sello la tarjeta vuelve con los ocho
  // siguientes. Así estuvo en producción desde el primer día sin que nada lo
  // dijera: faltaba el grant de la columna (migración
  // `20260923085437_repaso_despensa_permisos.sql`) y este `await` tiraba el
  // error.
  const { error: selloErr } = await supabase
    .from("households")
    .update({ pantry_reviewed_at: new Date().toISOString() })
    .eq("id", household.id);
  if (selloErr) {
    console.error("Repaso de despensa: no se pudo sellar la semana:", selloErr);
  }

  // Medición de uso: una respuesta por evento, y es de ahí de donde sale si el
  // repaso se termina (respuestas frente a los productos ofrecidos al abrirlo).
  // Solo la respuesta, no el producto: el informe cuenta, no mira qué hay en
  // casa de nadie.
  trackUsage(household.id, {
    name: "pantry_review_answered",
    props: { answer },
  });

  // Sin revalidatePath: el repaso vive en el shell y pinta lo que ya tiene en
  // memoria; refrescar en cada respuesta haría desaparecer el sheet a media
  // pregunta (el mismo motivo por el que el repaso de platos aplaza el refresco
  // al cierre). Lo refresca el cliente al cerrar.
  return { ok: true };
}

/**
 * "No volver a preguntar" del repaso de despensa: lo apaga para todo el hogar.
 * Por hogar y no por usuario, igual que el repaso de platos — la despensa es de
 * la casa, y si uno decide que no quiere la pregunta el otro tampoco tiene que
 * contestarla. Se reactiva en Ajustes.
 */
export async function setPantryReviewEnabledAction(
  enabled: boolean,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("households")
    .update({ pantry_review_enabled: enabled })
    .eq("id", household.id)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "No se pudo guardar la preferencia." };
  }
  trackUsage(household.id, {
    name: enabled ? "pantry_review_enabled" : "pantry_review_disabled",
  });
  revalidatePath("/ajustes");
  revalidatePath("/inventario");
  return { ok: true };
}
