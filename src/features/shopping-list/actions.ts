"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import { formatQuantity } from "@/lib/units";
import { getCurrentHousehold } from "@/features/household/queries";
import { recordStockEvent } from "@/features/inventory/events";
import type { UnitType } from "@/lib/supabase/types";
import { getActiveList } from "./queries";
import { addListItemSchema, updateListItemSchema } from "./schemas";

export type ActionState = { error?: string; ok?: boolean; warning?: string };

/** Siguiente `position` al final de la lista (max + 1); 1 si está vacía. */
async function nextListPosition(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  listId: string,
): Promise<number> {
  const { data: last } = await supabase
    .from("shopping_list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last?.position ?? 0) + 1;
}

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

  const position = await nextListPosition(supabase, list.id);

  const { error } = await supabase.from("shopping_list_items").insert({
    list_id: list.id,
    household_id: household.id,
    product_id: product?.id ?? null,
    name: d.name,
    quantity: d.quantity,
    unit: d.unit ?? product?.default_unit ?? null,
    added_by: userId,
    position,
  });
  if (error) return { error: "No se pudo añadir a la lista." };

  revalidatePath("/lista");
  return { ok: true, warning };
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

  const { data: product } = await supabase
    .from("products")
    .select("id, name, default_unit")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { error: "Producto no encontrado." };

  const qty =
    typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
      ? quantity
      : null;

  const position = await nextListPosition(supabase, list.id);

  const { error } = await supabase.from("shopping_list_items").insert({
    list_id: list.id,
    household_id: household.id,
    product_id: product.id,
    name: product.name,
    quantity: qty,
    unit: unit ?? product.default_unit,
    added_by: userId,
    position,
  });
  if (error) return { error: "No se pudo añadir a la lista." };

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
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("shopping_list_items")
    .update({
      name: d.name,
      quantity: d.quantity,
      unit: d.unit ?? null,
    })
    .eq("id", d.itemId);
  if (error) return { error: "No se pudo guardar." };

  revalidatePath("/lista");
  return { ok: true };
}

export async function toggleItemAction(
  itemId: string,
  isChecked: boolean,
): Promise<ActionState> {
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({
      is_checked: isChecked,
      checked_by: isChecked ? userId : null,
      checked_at: isChecked ? new Date().toISOString() : null,
    })
    .eq("id", itemId);
  if (error) return { error: "No se pudo actualizar." };
  // Sin revalidatePath: optimista en cliente + Realtime para el resto.
  return { ok: true };
}

export async function deleteListItemAction(
  itemId: string,
): Promise<ActionState> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", itemId);
  if (error) return { error: "No se pudo eliminar." };
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
    }
  }

  const ids = checked.map((c) => c.id);
  await supabase.from("shopping_list_items").delete().in("id", ids);

  revalidatePath("/lista");
  revalidatePath("/inventario");
  return { ok: true, added: checked.length, inventoryItemIds };
}
