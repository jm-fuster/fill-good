import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/features/household/queries";

export type StoreCategory = {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
};

/**
 * Categorías del hogar en su orden de pasillo (`sort_order`), para el editor de
 * "Orden de la tienda". El mismo `sort_order` es el que usan la vista agrupada
 * de /lista y el modo compra para ordenar por pasillos.
 */
export async function getStoreCategories(): Promise<StoreCategory[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, icon, sort_order")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    sortOrder: c.sort_order,
  }));
}
