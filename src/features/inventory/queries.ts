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
  minQuantity: number | null;
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
      "id, product_id, location, quantity, unit, expiry_date, product:products(name, min_quantity, category:categories(id, name, icon))",
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
      minQuantity:
        r.product!.min_quantity === null ? null : Number(r.product!.min_quantity),
    }));
}
