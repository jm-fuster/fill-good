"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import { getCurrentHousehold } from "@/features/household/queries";
import {
  addInventorySchema,
  editInventorySchema,
  expiryReviewSchema,
} from "./schemas";

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

  let productId: string;
  if (existing) {
    productId = existing.id;
    const updates: { min_quantity?: number | null; category_id?: string } = {};
    if (d.minQuantity !== null) updates.min_quantity = d.minQuantity;
    if (d.categoryId) updates.category_id = d.categoryId;
    if (Object.keys(updates).length > 0) {
      await supabase.from("products").update(updates).eq("id", productId);
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

export async function setInventoryQuantityAction(
  id: string,
  quantity: number,
): Promise<ActionState> {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "Cantidad no válida." };
  }
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("inventory_items")
    .update({ quantity, updated_by: userId })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar la cantidad." };
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
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
  const { error: prodErr } = await supabase
    .from("products")
    .update({
      name: d.name,
      normalized_name: normalized,
      category_id: d.categoryId,
      min_quantity: d.minQuantity,
    })
    .eq("id", d.productId);
  if (prodErr) return { error: "No se pudo guardar el nombre." };

  // Ubicación de destino: si ya existe una fila del mismo producto en esa
  // ubicación (unique household_id, product_id, location), fusionamos sumando
  // cantidades y borramos la fila movida; si no, movemos la fila.
  const { data: target } = await supabase
    .from("inventory_items")
    .select("id, quantity")
    .eq("household_id", household.id)
    .eq("product_id", d.productId)
    .eq("location", d.location)
    .neq("id", d.inventoryId)
    .maybeSingle();

  if (target) {
    const { error: mergeErr } = await supabase
      .from("inventory_items")
      .update({
        quantity: Number(target.quantity) + d.quantity,
        expiry_date: d.expiryDate,
        use_soon: d.useSoon,
        updated_by: userId,
      })
      .eq("id", target.id);
    if (mergeErr) return { error: "No se pudo mover el producto." };
    await supabase.from("inventory_items").delete().eq("id", d.inventoryId);
  } else {
    const { error: invErr } = await supabase
      .from("inventory_items")
      .update({
        location: d.location,
        quantity: d.quantity,
        expiry_date: d.expiryDate,
        use_soon: d.useSoon,
        updated_by: userId,
      })
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

export async function deleteInventoryAction(id: string): Promise<ActionState> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar." };
  revalidatePath("/inventario");
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
 * verdad; la RLS restringe a los del hogar. Es idempotente y opcional (omitir
 * no llama a esta acción).
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
      .eq("id", u.id);
    if (error) return { error: "No se pudieron guardar los cambios." };
  }

  revalidatePath("/inventario");
  return { ok: true };
}
