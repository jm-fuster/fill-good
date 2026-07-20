import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LocationType, UnitType } from "@/lib/supabase/types";

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
};

export type InventoryEntry = {
  id: string;
  productId: string;
  productName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  location: LocationType;
  quantity: number;
  unit: UnitType;
  expiryDate: string | null;
  useSoon: boolean;
  minQuantity: number | null;
};

/** Item de inventario para la revisión de caducidades tras la compra. */
export type ReviewEntry = {
  id: string;
  productName: string;
  categoryIcon: string | null;
  location: LocationType;
  quantity: number;
  unit: UnitType;
  expiryDate: string | null;
  useSoon: boolean;
};

export type ProductOption = {
  id: string;
  name: string;
  defaultUnit: UnitType;
  defaultLocation: LocationType;
  categoryId: string | null;
};

export async function getCategories(): Promise<Category[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, icon, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    sortOrder: c.sort_order,
  }));
}

export async function getProducts(): Promise<ProductOption[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, default_unit, default_location, category_id")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    defaultUnit: p.default_unit,
    defaultLocation: p.default_location,
    categoryId: p.category_id,
  }));
}

type InventoryRow = {
  id: string;
  product_id: string;
  location: LocationType;
  quantity: number;
  unit: UnitType;
  expiry_date: string | null;
  use_soon: boolean;
  product: {
    name: string;
    min_quantity: number | null;
    category: { id: string; name: string; icon: string | null } | null;
  } | null;
};

export async function getInventory(): Promise<InventoryEntry[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      "id, product_id, location, quantity, unit, expiry_date, use_soon, product:products(name, min_quantity, category:categories(id, name, icon))",
    )
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as InventoryRow[];
  return rows
    .filter((r) => r.product)
    .map((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product!.name,
      categoryId: r.product!.category?.id ?? null,
      categoryName: r.product!.category?.name ?? null,
      categoryIcon: r.product!.category?.icon ?? null,
      location: r.location,
      quantity: Number(r.quantity),
      unit: r.unit,
      expiryDate: r.expiry_date,
      useSoon: r.use_soon,
      minQuantity:
        r.product!.min_quantity === null ? null : Number(r.product!.min_quantity),
    }));
}

type ReviewRow = {
  id: string;
  location: LocationType;
  quantity: number;
  unit: UnitType;
  expiry_date: string | null;
  use_soon: boolean;
  product: {
    name: string;
    category: { icon: string | null } | null;
  } | null;
};

/**
 * Items de inventario por id, para la revisión de caducidades tras la compra.
 * La RLS ya restringe a los del hogar del usuario; se conserva el orden de los
 * ids recibidos (el mismo en que se compraron/tocaron).
 */
export async function getInventoryItemsByIds(
  ids: string[],
): Promise<ReviewEntry[]> {
  if (ids.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      "id, location, quantity, unit, expiry_date, use_soon, product:products(name, category:categories(icon))",
    )
    .in("id", ids);
  if (error) throw error;

  const rows = (data ?? []) as unknown as ReviewRow[];
  const byId = new Map(
    rows
      .filter((r) => r.product)
      .map((r) => [
        r.id,
        {
          id: r.id,
          productName: r.product!.name,
          categoryIcon: r.product!.category?.icon ?? null,
          location: r.location,
          quantity: Number(r.quantity),
          unit: r.unit,
          expiryDate: r.expiry_date,
          useSoon: r.use_soon,
        } satisfies ReviewEntry,
      ]),
  );
  return ids.map((id) => byId.get(id)).filter((e): e is ReviewEntry => Boolean(e));
}
