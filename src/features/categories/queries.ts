import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/features/household/queries";
import type { ChainAisleOrders } from "./aisle-order";

export type StoreCategory = {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
};

/**
 * Categorías del hogar en su orden de pasillo GENERAL (`sort_order`). Es el que
 * usan el editor, la vista agrupada de /lista y cualquier tienda que no tenga
 * un orden propio (`getChainAisleOrders`).
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

/**
 * Órdenes de pasillo propios de las tiendas del hogar, agrupados por cadena.
 * Vacío = ninguna tienda se ha separado del orden general (el caso normal en un
 * hogar que compra siempre en el mismo sitio).
 *
 * Se lee TODO el hogar de una vez, no la tienda activa: así el modo compra puede
 * reordenar al cambiar de chip sin volver al servidor. Son unas pocas decenas de
 * filas incluso con varias tiendas.
 */
export async function getChainAisleOrders(): Promise<ChainAisleOrders> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return {};
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("category_chain_order")
    .select("chain, category_id, sort_order")
    .eq("household_id", householdId);
  if (error) throw error;

  const orders: ChainAisleOrders = {};
  for (const row of data ?? []) {
    (orders[row.chain] ??= {})[row.category_id] = row.sort_order;
  }
  return orders;
}
