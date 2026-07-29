"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import { defaultListQuantity, formatQuantity } from "@/lib/units";
import { getCurrentHousehold } from "@/features/household/queries";
import { recordStockEvent } from "@/features/inventory/events";
import type { UnitType } from "@/lib/supabase/types";
import { getActiveList } from "./queries";
import { mergeIntoExisting, nextListPosition } from "./items";
import { addListItemSchema, updateListItemSchema } from "./schemas";

export type ActionState = {
  error?: string;
  ok?: boolean;
  warning?: string;
  /** Id de la fila recién insertada (para reconciliar el alta optimista). */
  itemId?: string;
  /** Presente cuando el alta se fusionó con un ítem existente (L3). */
  merged?: { name: string; quantity: number | null; unit: UnitType | null };
};

export async function addListItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const parsed = addListItemSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;

  const supabase = createServerSupabaseClient();
  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  // Enlazar con el catálogo si el nombre coincide (para checkout y avisos).
  const normalized = normalizeName(d.name);
  const { data: product } = await supabase
    .from("products")
    .select("id, default_unit")
    .eq("household_id", household.id)
    .eq("normalized_name", normalized)
    .maybeSingle();

  // Aviso si ya tienes existencias de ese producto.
  let warning: string | undefined;
  if (product) {
    const { data: inv } = await supabase
      .from("inventory_items")
      .select("quantity, unit")
      .eq("product_id", product.id);
    const total = (inv ?? []).reduce((s, r) => s + Number(r.quantity), 0);
    if (total > 0) {
      const unit = inv?.[0]?.unit ?? product.default_unit;
      warning = `Ya tienes ${formatQuantity(total, unit)} en el inventario`;
    }
  }

  const unit = d.unit ?? product?.default_unit ?? null;
  const quantity = d.quantity ?? defaultListQuantity(unit);

  // L3: si ya está en la lista (sin marcar), fusionar en vez de duplicar.
  const merged = await mergeIntoExisting(
    supabase,
    list.id,
    { productId: product?.id ?? null, normalized },
    { quantity, unit },
  );
  if (merged) {
    revalidatePath("/lista");
    return {
      ok: true,
      warning,
      itemId: merged.itemId,
      merged: {
        name: merged.name,
        quantity: merged.quantity,
        unit: merged.unit,
      },
    };
  }

  const position = await nextListPosition(supabase, list.id);

  const { data: inserted, error } = await supabase
    .from("shopping_list_items")
    .insert({
      list_id: list.id,
      household_id: household.id,
      product_id: product?.id ?? null,
      name: d.name,
      quantity,
      unit,
      added_by: userId,
      position,
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo añadir a la lista." };

  revalidatePath("/lista");
  return { ok: true, warning, itemId: inserted.id };
}

export async function addProductToListAction(
  productId: string,
  quantity?: number | null,
  unit?: UnitType | null,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  // El productId llega del cliente: acotarlo al hogar activo evita enlazar la
  // lista con un producto del OTRO hogar del usuario (la RLS lo permitiría).
  const { data: product } = await supabase
    .from("products")
    .select("id, name, default_unit")
    .eq("household_id", household.id)
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { error: "Producto no encontrado." };

  const resolvedUnit = unit ?? product.default_unit;
  const qty =
    typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
      ? quantity
      : defaultListQuantity(resolvedUnit);

  // L3: fusionar con el ítem existente (sin marcar) si ya está en la lista.
  const merged = await mergeIntoExisting(
    supabase,
    list.id,
    { productId: product.id, normalized: normalizeName(product.name) },
    { quantity: qty, unit: resolvedUnit },
  );
  if (merged) {
    revalidatePath("/lista");
    return {
      ok: true,
      itemId: merged.itemId,
      merged: {
        name: merged.name,
        quantity: merged.quantity,
        unit: merged.unit,
      },
    };
  }

  const position = await nextListPosition(supabase, list.id);

  const { data: inserted, error } = await supabase
    .from("shopping_list_items")
    .insert({
      list_id: list.id,
      household_id: household.id,
      product_id: product.id,
      name: product.name,
      quantity: qty,
      unit: resolvedUnit,
      added_by: userId,
      position,
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo añadir a la lista." };

  revalidatePath("/lista");
  return { ok: true, itemId: inserted.id };
}

/** Cuánto se calla una sugerencia descartada antes de volver a ofrecerse. */
const SUGGESTION_SNOOZE_DAYS = 30;

/**
 * «Descartar» una sugerencia de la lista: silencia ese producto un mes. Es un
 * silencio temporal y no un "nunca más" porque casi todo en una despensa es
 * cíclico — el bote que hoy no repones puede hacerte falta el mes que viene, y
 * un descarte permanente obligaría a acordarse de deshacerlo.
 *
 * Va en el producto (por hogar), no por usuario: la lista es compartida y lo que
 * uno descarta no debe reaparecerle al otro.
 */
export async function dismissSuggestionAction(
  productId: string,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const until = new Date();
  until.setDate(until.getDate() + SUGGESTION_SNOOZE_DAYS);

  const { error } = await supabase
    .from("products")
    .update({ suggestions_snoozed_until: until.toISOString() })
    .eq("household_id", household.id)
    .eq("id", productId);
  if (error) return { error: "No se pudo descartar la sugerencia." };

  revalidatePath("/lista");
  return { ok: true };
}

/** Deshace un «Descartar»: el producto vuelve a poder sugerirse ya mismo. */
export async function restoreSuggestionAction(
  productId: string,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("products")
    .update({ suggestions_snoozed_until: null })
    .eq("household_id", household.id)
    .eq("id", productId);
  if (error) return { error: "No se pudo recuperar la sugerencia." };

  revalidatePath("/lista");
  return { ok: true };
}

export async function updateListItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateListItemSchema.safeParse({
    itemId: formData.get("itemId"),
    name: formData.get("name"),
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const unit = d.unit ?? null;
  const { error } = await supabase
    .from("shopping_list_items")
    .update({
      name: d.name,
      // Sostiene el invariante «un contable siempre tiene cantidad»: vaciar el
      // campo en el editor vale 1, no el estado sin stepper. Cambiar la unidad a
      // granel sí devuelve el ítem a «sin cantidad» si se deja en blanco.
      quantity: d.quantity ?? defaultListQuantity(unit),
      unit,
    })
    .eq("id", d.itemId)
    .eq("household_id", household.id);
  if (error) return { error: "No se pudo guardar." };

  revalidatePath("/lista");
  return { ok: true };
}

/**
 * L9 — Ajuste ligero de solo la cantidad (stepper ±1). Optimista en cliente:
 * sin `revalidatePath`, Realtime reconcilia en el resto de dispositivos.
 */
export async function setListItemQuantityAction(
  itemId: string,
  quantity: number | null,
): Promise<ActionState> {
  // `quantity` llega del cliente: null (sin cantidad) o un número finito >= 0.
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    return { error: "Cantidad no válida." };
  }
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ quantity })
    .eq("id", itemId)
    .eq("household_id", household.id);
  if (error) return { error: "No se pudo actualizar." };
  return { ok: true };
}

/**
 * L14 — Reordenar la lista a mano: fija `position` = índice (0..n-1) según el
 * orden recibido de artículos pendientes. `getListItems` ordena por is_checked
 * y luego por position, así que basta con posicionar los pendientes. Optimista
 * en cliente (sin revalidatePath): Realtime reconcilia el resto de dispositivos.
 */
export async function reorderListItemsAction(
  orderedIds: string[],
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: "Datos no válidos." };
  }
  const supabase = createServerSupabaseClient();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("shopping_list_items")
        .update({ position: index })
        .eq("id", id)
        .eq("household_id", household.id),
    ),
  );
  if (results.some((r) => r.error)) {
    return { error: "No se pudo guardar el orden." };
  }
  return { ok: true };
}

export async function toggleItemAction(
  itemId: string,
  isChecked: boolean,
): Promise<ActionState> {
  const { userId } = await auth();
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({
      is_checked: isChecked,
      checked_by: isChecked ? userId : null,
      checked_at: isChecked ? new Date().toISOString() : null,
    })
    .eq("id", itemId)
    .eq("household_id", household.id);
  if (error) return { error: "No se pudo actualizar." };
  // Sin revalidatePath: optimista en cliente + Realtime para el resto.
  return { ok: true };
}

/** Instantánea de una fila borrada, suficiente para restaurarla tal cual. */
export type DeletedListItem = {
  id: string;
  list_id: string;
  household_id: string;
  product_id: string | null;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  added_by: string | null;
  position: number;
  created_at: string;
};

/**
 * Borra un ítem de la lista. El borrado se confirma en el servidor de inmediato
 * (así sobrevive a una recarga de la página; no depende de un temporizador en el
 * cliente). Devuelve una instantánea de la fila para poder deshacerlo con
 * `restoreListItemAction`, conservando id, posición y `added_by`.
 */
export async function deleteListItemAction(
  itemId: string,
): Promise<ActionState & { deleted?: DeletedListItem }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { data: row } = await supabase
    .from("shopping_list_items")
    .select(
      "id, list_id, household_id, product_id, name, quantity, unit, is_checked, checked_by, checked_at, added_by, position, created_at",
    )
    .eq("id", itemId)
    .eq("household_id", household.id)
    .maybeSingle();

  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", itemId)
    .eq("household_id", household.id);
  if (error) return { error: "No se pudo eliminar." };

  revalidatePath("/lista");
  return {
    ok: true,
    deleted: row
      ? { ...row, quantity: row.quantity === null ? null : Number(row.quantity) }
      : undefined,
  };
}

/**
 * Deshace un borrado re-insertando la fila exactamente como estaba (mismo id,
 * posición y `added_by`). RLS exige pertenecer al hogar de `household_id`, así
 * que no se puede restaurar en un hogar ajeno.
 */
export async function restoreListItemAction(
  item: DeletedListItem,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("shopping_list_items").insert({
    id: item.id,
    list_id: item.list_id,
    // Forzamos el hogar activo en lugar de fiarnos del payload del cliente: no se
    // puede reinsertar la fila con un household_id fabricado.
    household_id: household.id,
    product_id: item.product_id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    is_checked: item.is_checked,
    checked_by: item.checked_by,
    checked_at: item.checked_at,
    added_by: item.added_by,
    position: item.position,
    created_at: item.created_at,
  });
  if (error) return { error: "No se pudo restaurar." };
  revalidatePath("/lista");
  return { ok: true };
}

/**
 * Finalizar compra: los items marcados pasan al inventario y se quitan de la
 * lista. Los items de texto libre crean/actualizan su producto en el catálogo.
 */
export async function checkoutAction(): Promise<
  ActionState & { added?: number; inventoryItemIds?: string[] }
> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  const { data: checked, error: fetchErr } = await supabase
    .from("shopping_list_items")
    .select("id, name, quantity, unit, product_id")
    .eq("list_id", list.id)
    .eq("is_checked", true);
  if (fetchErr) return { error: "No se pudieron leer los productos." };
  if (!checked || checked.length === 0) {
    return { error: "No hay productos marcados." };
  }

  const inventoryItemIds: string[] = [];
  // Snapshot de la compra (G2): los productos que realmente se llevaron, ya
  // resueltos. Se acumula durante el bucle porque los items de texto libre no
  // tienen product_id hasta que se crean aquí.
  const tripProductIds: string[] = [];

  for (const item of checked) {
    // Resolver producto: enlazado, o resolver/crear por nombre normalizado.
    let productId = item.product_id;
    let defaultUnit = item.unit ?? "ud";
    let location: "pantry" | "fridge" | "freezer" | "other" = "pantry";
    let packSize: number | null = null;

    if (productId) {
      const { data: p } = await supabase
        .from("products")
        .select("default_unit, default_location, pack_size")
        .eq("household_id", household.id)
        .eq("id", productId)
        .maybeSingle();
      if (p) {
        defaultUnit = item.unit ?? p.default_unit;
        location = p.default_location;
        packSize = p.pack_size;
      }
    } else {
      const normalized = normalizeName(item.name);
      const { data: existing } = await supabase
        .from("products")
        .select("id, default_unit, default_location, pack_size")
        .eq("household_id", household.id)
        .eq("normalized_name", normalized)
        .maybeSingle();
      if (existing) {
        productId = existing.id;
        defaultUnit = item.unit ?? existing.default_unit;
        location = existing.default_location;
        packSize = existing.pack_size;
      } else {
        const { data: created } = await supabase
          .from("products")
          .insert({
            household_id: household.id,
            name: item.name,
            normalized_name: normalized,
            default_unit: item.unit ?? "ud",
            default_location: "pantry",
          })
          .select("id")
          .single();
        if (!created) continue;
        productId = created.id;
      }
    }

    // Pack (F4): con pack y movimiento en ud, entran `cantidad × pack` unidades.
    const baseQty = item.quantity ?? 1;
    const qty = defaultUnit === "ud" && packSize ? baseQty * packSize : baseQty;

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
          quantity: Number(inv.quantity) + qty,
          unit: defaultUnit,
          updated_by: userId,
        })
        .eq("id", inv.id);
      inventoryItemIds.push(inv.id);
    } else {
      const { data: created } = await supabase
        .from("inventory_items")
        .insert({
          household_id: household.id,
          product_id: productId,
          location,
          quantity: qty,
          unit: defaultUnit,
          updated_by: userId,
        })
        .select("id")
        .single();
      if (created) inventoryItemIds.push(created.id);
    }

    // Historial (F5): un evento "repuesto" por producto añadido, con la cantidad
    // ya convertida por pack. Sin folding (es una compra puntual, no el stepper).
    if (productId) {
      await recordStockEvent(supabase, {
        householdId: household.id,
        productId,
        quantity: qty,
        unit: defaultUnit,
        kind: "restocked",
        userId,
      });
    }

    // Memoria de habitualidad: este producto se ha comprado.
    if (productId) {
      await supabase.rpc("bump_product_purchase", { pid: productId });
      tripProductIds.push(productId);
    }
  }

  // Snapshot de la compra (G2) ANTES del borrado: es el único instante en que
  // existe la información de qué había en la lista. Best-effort — perder el
  // snapshot degrada una comparación futura, pero no puede impedir que el
  // usuario cierre su compra.
  try {
    // El cliente NO lanza en error de BD: devuelve { error }. Hay que mirarlo, o
    // un snapshot fallido pasaría desapercibido, que es justo el dato que esta
    // escritura existe para no perder.
    const { error: tripErr } = await supabase.from("shopping_trips").insert({
      household_id: household.id,
      closed_by: userId,
      product_ids: [...new Set(tripProductIds)],
      item_count: checked.length,
    });
    if (tripErr) {
      console.error("Snapshot de compra falló (best-effort):", tripErr);
    }
  } catch (err) {
    console.error("Snapshot de compra falló (best-effort):", err);
  }

  const ids = checked.map((c) => c.id);
  await supabase.from("shopping_list_items").delete().in("id", ids);

  revalidatePath("/lista");
  revalidatePath("/inventario");
  return { ok: true, added: checked.length, inventoryItemIds };
}
