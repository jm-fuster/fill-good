import "server-only";

import { auth } from "@clerk/nextjs/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";
import type { LocationType, UnitType } from "@/lib/supabase/types";

export type ActiveList = { id: string; name: string };

export type ListItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  isChecked: boolean;
  productId: string | null;
  addedByMe: boolean;
};

export type Suggestion = {
  productId: string;
  name: string;
  unit: UnitType;
};

/** Catálogo ligero para el autocompletado (filtrado en cliente). */
export type CatalogProduct = {
  id: string;
  name: string;
  normalizedName: string;
  defaultUnit: UnitType;
  defaultLocation: LocationType;
  purchaseCount: number;
};

/** Producto habitual sugerido como chip de un toque. */
export type HabitualProduct = {
  id: string;
  name: string;
  defaultUnit: UnitType;
  defaultLocation: LocationType;
  purchaseCount: number;
};

export async function getActiveList(): Promise<ActiveList | null> {
  const supabase = createServerSupabaseClient();
  const query = () =>
    supabase
      .from("shopping_lists")
      .select("id, name")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  let { data } = await query();
  if (!data) {
    const household = await getCurrentHousehold();
    if (!household) return null;
    await supabase.rpc("ensure_active_list", { hid: household.id });
    ({ data } = await query());
  }
  return data ? { id: data.id, name: data.name } : null;
}

export async function getListItems(listId: string): Promise<ListItem[]> {
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("id, name, quantity, unit, is_checked, product_id, added_by")
    .eq("list_id", listId)
    .order("is_checked", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity === null ? null : Number(i.quantity),
    unit: i.unit,
    isChecked: i.is_checked,
    productId: i.product_id,
    addedByMe: i.added_by === userId,
  }));
}

/**
 * Sugerencias de compra: productos con mínimo definido cuyo stock total está
 * por debajo del mínimo y que no están ya en la lista.
 */
export async function getSuggestions(listId: string): Promise<Suggestion[]> {
  const supabase = createServerSupabaseClient();
  const [{ data: products }, { data: inventory }, { data: items }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, min_quantity, default_unit")
        .not("min_quantity", "is", null),
      supabase.from("inventory_items").select("product_id, quantity"),
      supabase
        .from("shopping_list_items")
        .select("product_id")
        .eq("list_id", listId)
        .not("product_id", "is", null),
    ]);

  const stockByProduct = new Map<string, number>();
  for (const row of inventory ?? []) {
    stockByProduct.set(
      row.product_id,
      (stockByProduct.get(row.product_id) ?? 0) + Number(row.quantity),
    );
  }
  const onList = new Set((items ?? []).map((i) => i.product_id));

  return (products ?? [])
    .filter((p) => {
      if (p.min_quantity === null) return false;
      if (onList.has(p.id)) return false;
      const stock = stockByProduct.get(p.id) ?? 0;
      return stock < Number(p.min_quantity);
    })
    .map((p) => ({
      productId: p.id,
      name: p.name,
      unit: p.default_unit,
    }));
}

/**
 * Catálogo ligero del hogar para el autocompletado en cliente. Ordenado por
 * habitualidad (más comprados primero) y luego alfabético como desempate.
 */
export async function getProductCatalog(): Promise<CatalogProduct[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, normalized_name, default_unit, default_location, purchase_count",
    )
    .order("purchase_count", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    normalizedName: p.normalized_name,
    defaultUnit: p.default_unit,
    defaultLocation: p.default_location,
    purchaseCount: p.purchase_count,
  }));
}

/**
 * Productos habituales (comprados ≥ 2 veces) que no están ya en la lista ni
 * tienen stock en el inventario. Se ofrecen como chips de un toque.
 */
export async function getHabitualProducts(
  listId: string,
): Promise<HabitualProduct[]> {
  const supabase = createServerSupabaseClient();
  const [{ data: products }, { data: inventory }, { data: items }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, default_unit, default_location, purchase_count")
        .gte("purchase_count", 2)
        .order("purchase_count", { ascending: false })
        .order("name", { ascending: true }),
      supabase.from("inventory_items").select("product_id, quantity"),
      supabase
        .from("shopping_list_items")
        .select("product_id")
        .eq("list_id", listId)
        .not("product_id", "is", null),
    ]);

  const stockByProduct = new Map<string, number>();
  for (const row of inventory ?? []) {
    stockByProduct.set(
      row.product_id,
      (stockByProduct.get(row.product_id) ?? 0) + Number(row.quantity),
    );
  }
  const onList = new Set((items ?? []).map((i) => i.product_id));

  return (products ?? [])
    .filter((p) => !onList.has(p.id) && (stockByProduct.get(p.id) ?? 0) <= 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      defaultUnit: p.default_unit,
      defaultLocation: p.default_location,
      purchaseCount: p.purchase_count,
    }));
}
