import "server-only";

import { auth } from "@clerk/nextjs/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";
import {
  getChainSavingsTips,
  getInferredChains,
  getLatestUnitPrices,
} from "@/features/prices/queries";
import type { ChainSavingsTip } from "@/features/prices/chain-savings";
import { baseUnitFactor, unitFamily } from "@/lib/units";
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
  /** Categoría del producto para agrupar en `/lista` (L10); ausente en altas optimistas. */
  categoryName?: string;
  categoryIcon?: string | null;
  categorySort?: number;
  /** Tienda preferida del producto (L15); null/ausente = sin preferencia. */
  preferredChain?: string | null;
  /** Aviso de ahorro si otra cadena sale más barata (L15, fase 3). */
  savings?: ChainSavingsTip | null;
};

export type SuggestionReason = "low_stock" | "restock";

export type Suggestion = {
  productId: string;
  name: string;
  unit: UnitType;
  reason: SuggestionReason;
  /** Cadencia habitual en días (solo en reason "restock"). */
  intervalDays?: number;
  /**
   * Cantidad sugerida a añadir a la lista (en unidades de lista). Para "low_stock"
   * cubre el déficit hasta el mínimo; para "restock" es una compra estándar.
   */
  suggestedQuantity: number;
};

/** Catálogo ligero para el autocompletado (filtrado en cliente). */
export type CatalogProduct = {
  id: string;
  name: string;
  normalizedName: string;
  defaultUnit: UnitType;
  defaultLocation: LocationType;
  purchaseCount: number;
  /** Unidades por compra (F4); null = sin pack. */
  packSize: number | null;
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

/**
 * Metadatos ligeros de la lista activa para el badge de la navbar: id (para la
 * suscripción Realtime) y nº de artículos pendientes (sin marcar). Es de solo
 * lectura —a diferencia de `getActiveList` NO crea una lista activa— porque se
 * llama en el layout de toda la app y no debe tener efectos secundarios.
 */
export async function getActiveListBadge(): Promise<{
  listId: string | null;
  pendingCount: number;
}> {
  const supabase = createServerSupabaseClient();
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!list) return { listId: null, pendingCount: 0 };

  const { count } = await supabase
    .from("shopping_list_items")
    .select("id", { count: "exact", head: true })
    .eq("list_id", list.id)
    .eq("is_checked", false);
  return { listId: list.id, pendingCount: count ?? 0 };
}

/**
 * Ids de producto del catálogo presentes en la lista activa. Se usa para mostrar
 * el estado "En la lista" en el inventario sin duplicar ítems. Solo lee (no crea
 * lista activa como `getActiveList`): si no hay lista, no hay nada que marcar.
 */
export async function getActiveListProductIds(): Promise<Set<string>> {
  const supabase = createServerSupabaseClient();
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!list) return new Set();

  const { data } = await supabase
    .from("shopping_list_items")
    .select("product_id")
    .eq("list_id", list.id)
    .not("product_id", "is", null);
  return new Set(
    (data ?? [])
      .map((i) => i.product_id)
      .filter((id): id is string => Boolean(id)),
  );
}

/** Ítem de la lista enriquecido para el modo compra (M4). */
export type ShoppingModeItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  isChecked: boolean;
  categoryName: string;
  categoryIcon: string | null;
  /** Orden de pasillo (sort_order de la categoría; sin categoría al final). */
  categorySort: number;
  /** Coste estimado de la línea (precio × cantidad) o null si no se conoce. */
  lineCost: number | null;
  /** Tienda preferida del producto (L15); null = sin preferencia. */
  preferredChain: string | null;
};

type ShoppingModeRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  is_checked: boolean;
  product_id: string | null;
  product: {
    preferred_chain: string | null;
    category: {
      name: string;
      icon: string | null;
      sort_order: number;
    } | null;
  } | null;
};

const NO_CATEGORY_SORT = 9_000;

/**
 * Ítems de la lista para el "Modo compra" (M4): con su categoría (para agrupar
 * por pasillo con el sort_order existente) y el coste estimado de cada línea
 * (último precio del producto × cantidad, solo dentro de la misma familia de
 * unidad). Una sola pasada + el mapa de precios; sin N+1.
 */
export async function getShoppingModeItems(
  listId: string,
): Promise<ShoppingModeItem[]> {
  const supabase = createServerSupabaseClient();
  const [{ data, error }, prices, inferredChains] = await Promise.all([
    supabase
      .from("shopping_list_items")
      .select(
        "id, name, quantity, unit, is_checked, product_id, product:products(preferred_chain, category:categories(name, icon, sort_order))",
      )
      .eq("list_id", listId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    getLatestUnitPrices(),
    getInferredChains(),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as unknown as ShoppingModeRow[];
  return rows.map((r) => {
    const qty = r.quantity === null ? null : Number(r.quantity);
    let lineCost: number | null = null;
    const price = r.product_id ? prices.get(r.product_id) : undefined;
    if (
      price &&
      qty !== null &&
      r.unit !== null &&
      unitFamily(price.unit) === unitFamily(r.unit)
    ) {
      lineCost =
        (price.price / baseUnitFactor(price.unit)) *
        (qty * baseUnitFactor(r.unit));
    }
    return {
      id: r.id,
      name: r.name,
      quantity: qty,
      unit: r.unit,
      isChecked: r.is_checked,
      categoryName: r.product?.category?.name ?? "Otros",
      categoryIcon: r.product?.category?.icon ?? null,
      categorySort: r.product?.category?.sort_order ?? NO_CATEGORY_SORT,
      lineCost,
      // Efectiva: la manual gana; si no hay, la inferida del histórico (fase 2).
      preferredChain:
        r.product?.preferred_chain ??
        (r.product_id ? (inferredChains.get(r.product_id) ?? null) : null),
    };
  });
}

type ListItemRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  is_checked: boolean;
  product_id: string | null;
  added_by: string | null;
  product: {
    preferred_chain: string | null;
    category: { name: string; icon: string | null; sort_order: number } | null;
  } | null;
};

export async function getListItems(listId: string): Promise<ListItem[]> {
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  const [{ data, error }, inferredChains, savingsTips] = await Promise.all([
    supabase
      .from("shopping_list_items")
      .select(
        "id, name, quantity, unit, is_checked, product_id, added_by, product:products(preferred_chain, category:categories(name, icon, sort_order))",
      )
      .eq("list_id", listId)
      .order("is_checked", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    getInferredChains(),
    getChainSavingsTips(),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as unknown as ListItemRow[];
  return rows.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity === null ? null : Number(i.quantity),
    unit: i.unit,
    isChecked: i.is_checked,
    productId: i.product_id,
    addedByMe: i.added_by === userId,
    categoryName: i.product?.category?.name ?? "Otros",
    categoryIcon: i.product?.category?.icon ?? null,
    categorySort: i.product?.category?.sort_order ?? NO_CATEGORY_SORT,
    // Efectiva: la manual gana; si no hay, la inferida del histórico (fase 2).
    preferredChain:
      i.product?.preferred_chain ??
      (i.product_id ? (inferredChains.get(i.product_id) ?? null) : null),
    savings: i.product_id ? (savingsTips.get(i.product_id) ?? null) : null,
  }));
}

/** Cadencia máxima (días) para sugerir reposición; por encima es compra esporádica. */
const RESTOCK_MAX_MEDIAN_DAYS = 60;
/** Compras mínimas para estimar una cadencia fiable. */
const RESTOCK_MIN_PURCHASES = 3;

/** Mediana de una lista de números (0 si está vacía). */
function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Días enteros entre dos fechas ISO (YYYY-MM-DD). */
function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  return Math.floor((to - from) / 86_400_000);
}

/**
 * Cantidad sugerida a añadir a la lista (M5). Para contables ("ud") devuelve
 * unidades de lista enteras: si hay pack, cuántos packs cubren el déficit hasta
 * el mínimo (en checkout cada pack aporta `pack_size` unidades); si no, el
 * déficit redondeado hacia arriba. Sin déficit conocido, una compra estándar (1).
 * Para no contables (kg/g/l/ml) devuelve el déficit (1 decimal) o 1 por defecto.
 */
function suggestedQuantityFor(
  unit: UnitType,
  stock: number,
  min: number | null,
  packSize: number | null,
): number {
  const deficit = min !== null ? Math.max(0, min - stock) : 0;
  if (unit === "ud") {
    if (packSize && packSize > 1) {
      return deficit > 0 ? Math.max(1, Math.ceil(deficit / packSize)) : 1;
    }
    return deficit > 0 ? Math.max(1, Math.ceil(deficit)) : 1;
  }
  return deficit > 0 ? Math.round(deficit * 10) / 10 : 1;
}

/**
 * Sugerencias de compra con dos fuentes (M5), en una sola consulta agregada
 * (sin N+1):
 *  · "low_stock" — productos con mínimo definido cuyo stock total está por
 *    debajo del mínimo (comportamiento original).
 *  · "restock" — productos con ≥3 compras cuya cadencia habitual (mediana de
 *    intervalos entre compras) ya se ha cumplido desde la última y que no tienen
 *    stock (o están por debajo del mínimo). Cadencias > 60 días se descartan.
 * Ninguna sugiere algo que ya esté en la lista. low_stock tiene precedencia.
 */
export async function getSuggestions(listId: string): Promise<Suggestion[]> {
  const supabase = createServerSupabaseClient();
  const [
    { data: products },
    { data: inventory },
    { data: items },
    { data: history },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, min_quantity, default_unit, purchase_count, pack_size",
      ),
    supabase.from("inventory_items").select("product_id, quantity"),
    supabase
      .from("shopping_list_items")
      .select("product_id")
      .eq("list_id", listId)
      .not("product_id", "is", null),
    supabase
      .from("receipt_items")
      .select("product_id, purchased_at")
      .not("product_id", "is", null)
      .not("purchased_at", "is", null)
      .order("purchased_at", { ascending: true }),
  ]);

  const stockByProduct = new Map<string, number>();
  for (const row of inventory ?? []) {
    stockByProduct.set(
      row.product_id,
      (stockByProduct.get(row.product_id) ?? 0) + Number(row.quantity),
    );
  }
  const onList = new Set((items ?? []).map((i) => i.product_id));

  // Fechas de compra por producto, en orden cronológico.
  const datesByProduct = new Map<string, string[]>();
  for (const row of history ?? []) {
    if (!row.product_id || !row.purchased_at) continue;
    const arr = datesByProduct.get(row.product_id);
    if (arr) arr.push(row.purchased_at);
    else datesByProduct.set(row.product_id, [row.purchased_at]);
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const suggestions: Suggestion[] = [];

  for (const p of products ?? []) {
    if (onList.has(p.id)) continue;
    const stock = stockByProduct.get(p.id) ?? 0;
    const min = p.min_quantity === null ? null : Number(p.min_quantity);
    const packSize = p.pack_size === null ? null : Number(p.pack_size);

    // Fuente 1: por debajo del mínimo (precedencia).
    if (min !== null && stock < min) {
      suggestions.push({
        productId: p.id,
        name: p.name,
        unit: p.default_unit,
        reason: "low_stock",
        suggestedQuantity: suggestedQuantityFor(
          p.default_unit,
          stock,
          min,
          packSize,
        ),
      });
      continue;
    }

    // Fuente 2: reposición por cadencia.
    if (p.purchase_count < RESTOCK_MIN_PURCHASES) continue;
    const dates = datesByProduct.get(p.id) ?? [];
    if (dates.length < RESTOCK_MIN_PURCHASES) continue;

    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push(daysBetween(dates[i - 1], dates[i]));
    }
    const median = medianOf(intervals);
    if (median <= 0 || median > RESTOCK_MAX_MEDIAN_DAYS) continue;

    const daysSinceLast = daysBetween(dates[dates.length - 1], todayISO);
    const belowMin = min !== null && stock < min;
    const noStock = stock <= 0;
    if (daysSinceLast >= median && (noStock || belowMin)) {
      suggestions.push({
        productId: p.id,
        name: p.name,
        unit: p.default_unit,
        reason: "restock",
        intervalDays: Math.round(median),
        suggestedQuantity: suggestedQuantityFor(
          p.default_unit,
          stock,
          min,
          packSize,
        ),
      });
    }
  }

  return suggestions;
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
      "id, name, normalized_name, default_unit, default_location, purchase_count, pack_size",
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
    packSize: p.pack_size === null ? null : Number(p.pack_size),
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
