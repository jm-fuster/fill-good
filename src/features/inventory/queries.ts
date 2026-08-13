import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/dates";
import type {
  InventoryEventKind,
  LocationType,
  UnitType,
} from "@/lib/supabase/types";
import { convertQuantity, roundQuantity, type UnitContent } from "@/lib/units";
import {
  getActiveHouseholdId,
  getCurrentHousehold,
  getHouseholdMembers,
} from "@/features/household/queries";
import type { ChainSavingsTip } from "@/features/prices/chain-savings";
import { pickPantryReview, type PantryReviewItem } from "./pantry-review";

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
  /** Icono manual del producto (L16); null = automático (se adivina). */
  productIcon: string | null;
  location: LocationType;
  quantity: number;
  unit: UnitType;
  expiryDate: string | null;
  useSoon: boolean;
  minQuantity: number | null;
  /** Unidades que entran por compra (F4); null = sin pack. */
  packSize: number | null;
  /**
   * Contenido de cada unidad (500 ml por brick); null = sin contenido definido.
   * Van en pareja y solo se usan en productos contables.
   */
  contentSize: number | null;
  contentUnit: UnitType | null;
  /** El contenido es un peso medio (fruta, carne): se muestra con «≈». */
  contentIsEstimate: boolean;
  /** Tienda preferida MANUAL de este producto (L15); null = sin preferencia. */
  preferredChain: string | null;
  /**
   * Tienda inferida del histórico de tickets (L15, fase 2); null si no hay señal
   * clara. Solo se usa como pista en la ficha cuando no hay preferencia manual.
   */
  inferredChain: string | null;
  /** Aviso de ahorro si otra cadena sale más barata (L15, fase 3); null si no. */
  savings: ChainSavingsTip | null;
};

/** Item de inventario para la revisión de caducidades tras la compra. */
export type ReviewEntry = {
  id: string;
  productName: string;
  categoryIcon: string | null;
  /** Icono manual del producto (L16); null = automático. */
  productIcon: string | null;
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

/** Producto del catálogo ofrecido como chip en el selector "¿Qué tienes ya en casa?". */
export type StarterProduct = {
  id: string;
  name: string;
};

/** Grupo de productos sembrados agrupados por su categoría, para el selector inicial. */
export type StarterGroup = {
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string | null;
  products: StarterProduct[];
};

export async function getCategories(): Promise<Category[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, icon, sort_order")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    sortOrder: c.sort_order,
  }));
}

/**
 * Ids de producto anclados por el usuario actual ("Mis habituales", E5). La RLS
 * de `user_pinned_products` restringe a los pines del propio usuario, pero un
 * usuario con varios hogares tiene pines en cada uno: hay que acotar al activo.
 */
export async function getPinnedProductIds(): Promise<Set<string>> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return new Set();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_pinned_products")
    .select("product_id")
    .eq("household_id", householdId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.product_id));
}

export async function getProducts(): Promise<ProductOption[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, default_unit, default_location, category_id")
    .eq("household_id", householdId)
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

type StarterCatalogRow = {
  id: string;
  name: string;
  category: {
    id: string;
    name: string;
    icon: string | null;
    sort_order: number;
  } | null;
};

/**
 * Catálogo para el selector "¿Qué tienes ya en casa?" del empty state: productos
 * del hogar que aún NO tienen fila en inventario, agrupados por categoría (con su
 * icono) y ordenados por `sort_order`. Los productos sin categoría caen en un
 * grupo final. Alfabético dentro de cada grupo.
 */
export async function getStarterCatalog(): Promise<StarterGroup[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const [{ data: products, error: prodErr }, { data: inv, error: invErr }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, category:categories(id, name, icon, sort_order)")
        .eq("household_id", householdId)
        .order("name", { ascending: true }),
      supabase
        .from("inventory_items")
        .select("product_id")
        .eq("household_id", householdId),
    ]);
  if (prodErr) throw prodErr;
  if (invErr) throw invErr;

  const inInventory = new Set((inv ?? []).map((r) => r.product_id));
  const rows = (products ?? []) as unknown as StarterCatalogRow[];

  // Agrupar por categoría conservando el sort_order para ordenar los grupos.
  const NO_CATEGORY = "__none__";
  const groups = new Map<
    string,
    StarterGroup & { sortOrder: number }
  >();
  for (const p of rows) {
    if (inInventory.has(p.id)) continue;
    const key = p.category?.id ?? NO_CATEGORY;
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId: p.category?.id ?? null,
        categoryName: p.category?.name ?? "Sin categoría",
        categoryIcon: p.category?.icon ?? null,
        sortOrder: p.category?.sort_order ?? Number.MAX_SAFE_INTEGER,
        products: [],
      };
      groups.set(key, group);
    }
    group.products.push({ id: p.id, name: p.name });
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.categoryName.localeCompare(b.categoryName, "es"),
    )
    .map((group) => ({
      categoryId: group.categoryId,
      categoryName: group.categoryName,
      categoryIcon: group.categoryIcon,
      products: group.products,
    }));
}

/** Stock agregado de un producto, expresado en su unidad por defecto. */
export type ProductStock = {
  quantity: number;
  unit: UnitType;
  /** Contenido de cada unidad; permite comparar "3 ud" contra "300 ml". */
  content: UnitContent;
};

/**
 * Stock total por producto (suma de todas las ubicaciones), expresado en la
 * unidad por defecto del producto. Las filas se convierten con `convertQuantity`:
 * exacto dentro de la familia (g↔kg, ml↔l) y, entre 'ud' y una medida, solo si el
 * producto declara el contenido de su envase — así una fila que entró de un ticket
 * en 0,5 l ya suma a un producto que se cuenta por bricks. Las que sigan sin poder
 * convertirse se ignoran, como antes. Solo devuelve productos con cantidad > 0.
 * Lo usa el formulario de recetas (F3) para el badge de stock por ingrediente.
 */
export async function getStockByProduct(): Promise<
  Record<string, ProductStock>
> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return {};
  const supabase = createServerSupabaseClient();
  const [{ data: inv, error: invErr }, { data: prods, error: prodErr }] =
    await Promise.all([
      supabase
        .from("inventory_items")
        .select("product_id, quantity, unit")
        .eq("household_id", householdId),
      supabase
        .from("products")
        .select("id, default_unit, content_size, content_unit, content_is_estimate")
        .eq("household_id", householdId),
    ]);
  if (invErr) throw invErr;
  if (prodErr) throw prodErr;

  const defaultUnit = new Map<string, UnitType>();
  const contentByProduct = new Map<string, UnitContent>();
  for (const p of prods ?? []) {
    defaultUnit.set(p.id, p.default_unit);
    contentByProduct.set(
      p.id,
      p.content_size === null || p.content_unit === null
        ? null
        : {
            size: Number(p.content_size),
            unit: p.content_unit,
            estimate: p.content_is_estimate,
          },
    );
  }

  const totals = new Map<string, number>();
  for (const row of inv ?? []) {
    const target = defaultUnit.get(row.product_id);
    if (!target) continue;
    const inTarget = convertQuantity(
      Number(row.quantity),
      row.unit,
      target,
      contentByProduct.get(row.product_id) ?? null,
    );
    if (inTarget === null) continue;
    totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + inTarget);
  }

  const result: Record<string, ProductStock> = {};
  for (const [pid, qty] of totals) {
    if (qty > 0) {
      result[pid] = {
        quantity: roundQuantity(qty),
        unit: defaultUnit.get(pid)!,
        content: contentByProduct.get(pid) ?? null,
      };
    }
  }
  return result;
}

/** Un movimiento de stock del historial (F5). */
export type InventoryEvent = {
  id: string;
  productName: string;
  quantity: number;
  unit: UnitType;
  kind: InventoryEventKind;
  createdAt: string;
  authorName: string | null;
};

/** Días que abarca el historial de movimientos (el índice ya cubre el rango). */
export const HISTORY_WINDOW_DAYS = 30;

type HistoryRow = {
  id: string;
  quantity: number;
  unit: UnitType;
  kind: InventoryEventKind;
  created_by: string | null;
  created_at: string;
  product: { name: string } | null;
};

/**
 * Movimientos de inventario de los últimos {@link HISTORY_WINDOW_DAYS} días
 * (F5), con el nombre del producto y quién lo hizo. Acotado al hogar activo (la
 * RLS solo comprueba membresía); el filtro usa el índice
 * `(household_id, created_at)`.
 * Devuelve también `nowMs` (referencia temporal calculada aquí, no en el
 * componente de render, para no romper la regla de pureza).
 */
export async function getInventoryHistory(): Promise<{
  events: InventoryEvent[];
  nowMs: number;
}> {
  const nowMs = Date.now();
  const household = await getCurrentHousehold();
  if (!household) return { events: [], nowMs };
  const supabase = createServerSupabaseClient();
  const since = new Date(
    nowMs - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data, error }, members] = await Promise.all([
    supabase
      .from("inventory_events")
      .select(
        "id, quantity, unit, kind, created_by, created_at, product:products(name)",
      )
      .eq("household_id", household.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    getHouseholdMembers(household.id),
  ]);
  if (error) throw error;

  const nameByUser = new Map(members.map((m) => [m.userId, m.displayName]));
  const rows = (data ?? []) as unknown as HistoryRow[];
  const events = rows.map((e) => ({
    id: e.id,
    productName: e.product?.name ?? "Producto",
    quantity: Number(e.quantity),
    unit: e.unit,
    kind: e.kind,
    createdAt: e.created_at,
    authorName: e.created_by ? (nameByUser.get(e.created_by) ?? null) : null,
  }));
  return { events, nowMs };
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
    pack_size: number | null;
    content_size: number | null;
    content_unit: UnitType | null;
    content_is_estimate: boolean;
    preferred_chain: string | null;
    inferred_chain: string | null;
    savings_tip: ChainSavingsTip | null;
    icon: string | null;
    category: { id: string; name: string; icon: string | null } | null;
  } | null;
};

export async function getInventory(): Promise<InventoryEntry[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  // Cadena inferida y aviso de ahorro se leen MATERIALIZADOS del embed de
  // products (se recalculan al confirmar ticket / fusionar / cambiar preferencia,
  // ver features/prices/materialize.ts) en vez de escanear todo el histórico de
  // receipt_items en cada render.
  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      "id, product_id, location, quantity, unit, expiry_date, use_soon, product:products(name, min_quantity, pack_size, content_size, content_unit, content_is_estimate, preferred_chain, inferred_chain, savings_tip, icon, category:categories(id, name, icon))",
    )
    .eq("household_id", householdId)
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
      productIcon: r.product!.icon ?? null,
      location: r.location,
      quantity: Number(r.quantity),
      unit: r.unit,
      expiryDate: r.expiry_date,
      useSoon: r.use_soon,
      minQuantity:
        r.product!.min_quantity === null ? null : Number(r.product!.min_quantity),
      packSize:
        r.product!.pack_size === null ? null : Number(r.product!.pack_size),
      contentSize:
        r.product!.content_size === null
          ? null
          : Number(r.product!.content_size),
      contentUnit: r.product!.content_unit,
      contentIsEstimate: r.product!.content_is_estimate,
      preferredChain: r.product!.preferred_chain,
      inferredChain: r.product!.inferred_chain,
      savings: (r.product!.savings_tip as ChainSavingsTip | null) ?? null,
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
    icon: string | null;
    category: { icon: string | null } | null;
  } | null;
};

/**
 * Items de inventario por id, para la revisión de caducidades tras la compra.
 * Acotado al hogar activo; se conserva el orden de los ids recibidos (el mismo
 * en que se compraron/tocaron).
 */
export async function getInventoryItemsByIds(
  ids: string[],
): Promise<ReviewEntry[]> {
  if (ids.length === 0) return [];
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      "id, location, quantity, unit, expiry_date, use_soon, product:products(name, icon, category:categories(icon))",
    )
    .eq("household_id", householdId)
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
          productIcon: r.product!.icon ?? null,
          location: r.location,
          quantity: Number(r.quantity),
          unit: r.unit,
          expiryDate: r.expiry_date,
          useSoon: r.use_soon,
        } satisfies ReviewEntry,
      ]),
  );
  // Sin duplicados: el checkout y el ticket pueden repetir la misma fila de
  // inventario (dos líneas del mismo producto+ubicación), y repetirla aquí
  // renderizaría dos tarjetas con la misma key editando el mismo estado.
  return [...new Set(ids)]
    .map((id) => byId.get(id))
    .filter((e): e is ReviewEntry => Boolean(e));
}

/** Fila del repaso semanal de despensa, con lo que hace falta para pintarla. */
export type PantryReviewEntry = PantryReviewItem & {
  categoryIcon: string | null;
  /** Icono manual del producto (L16); null = automático. */
  productIcon: string | null;
};

type PantryReviewRow = {
  id: string;
  product_id: string;
  location: LocationType;
  quantity: number;
  unit: UnitType;
  reviewed_at: string | null;
  updated_at: string;
  product: {
    name: string;
    min_quantity: number | null;
    purchase_count: number;
    icon: string | null;
    category: { id: string; icon: string | null } | null;
  } | null;
};

/**
 * Cuántas filas se traen para que elija `pickPantryReview`. Se piden más de las
 * ocho que caben porque la elección no es "las más viejas": pondera ubicación,
 * mínimo y habitualidad, y reparte por categoría. Con el tope justo, la despensa
 * de una casa grande decidiría por antigüedad y el resto de reglas no se notaría.
 * Sigue siendo una consulta acotada: no se lee el inventario entero.
 */
const PANTRY_REVIEW_POOL = 60;

/**
 * Candidatos al repaso semanal de despensa, ya elegidos y ordenados.
 *
 * El filtro por `quantity > 0` va en SQL (aprovecha el índice parcial
 * `inventory_review_idx`) aunque `pickPantryReview` también lo aplique: aquí
 * ahorra traer filas, y allí es una regla de producto que tiene que sostenerse
 * sola. El orden de la consulta es solo para quedarse con las más prometedoras
 * del pozo; el orden que se ve lo decide la función pura.
 */
export async function getPantryReviewCandidates(): Promise<PantryReviewEntry[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      "id, product_id, location, quantity, unit, reviewed_at, updated_at, product:products(name, min_quantity, purchase_count, icon, category:categories(id, icon))",
    )
    .eq("household_id", householdId)
    .gt("quantity", 0)
    .order("updated_at", { ascending: true })
    .limit(PANTRY_REVIEW_POOL);
  if (error) throw error;

  const rows = (data ?? []) as unknown as PantryReviewRow[];
  const entries = rows
    .filter((r) => r.product)
    .map(
      (r) =>
        ({
          id: r.id,
          productId: r.product_id,
          name: r.product!.name,
          quantity: Number(r.quantity),
          unit: r.unit,
          location: r.location,
          categoryId: r.product!.category?.id ?? null,
          categoryIcon: r.product!.category?.icon ?? null,
          productIcon: r.product!.icon ?? null,
          reviewedAt: r.reviewed_at,
          updatedAt: r.updated_at,
          purchaseCount: Number(r.product!.purchase_count),
          hasMinimum: r.product!.min_quantity !== null,
        }) satisfies PantryReviewEntry,
    );

  return pickPantryReview(entries, nowMs());
}

/** Ajustes del repaso de despensa que guarda el hogar. */
export type PantryReviewPrefs = {
  enabled: boolean;
  /** Último repaso hecho en esta casa (instante ISO); null = ninguno. */
  reviewedAt: string | null;
  /**
   * Cuándo se creó el hogar. Es la referencia de `shouldYieldToDishes` cuando no
   * hay repasos previos: sin ella, «nunca repasado» no se distingue de «recién
   * creado» y no se puede acotar cuánto lleva el repaso cediendo el sitio.
   */
  createdAt: string | null;
};

/**
 * Ajustes del repaso, en consulta propia y no en `getCurrentHousehold`: solo los
 * necesita el repaso, y `CurrentHousehold` lo lee el shell en cada página (mismo
 * criterio que `getConfiguredChains`). Sin fila, los valores por defecto de la
 * columna: activado y sin repasos.
 */
export const getPantryReviewPrefs = cache(
  async (): Promise<PantryReviewPrefs> => {
    const householdId = await getActiveHouseholdId();
    if (!householdId) {
      return { enabled: false, reviewedAt: null, createdAt: null };
    }
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("households")
      .select("pantry_review_enabled, pantry_reviewed_at, created_at")
      .eq("id", householdId)
      .maybeSingle();
    return {
      enabled: data?.pantry_review_enabled ?? true,
      reviewedAt: data?.pantry_reviewed_at ?? null,
      createdAt: data?.created_at ?? null,
    };
  },
);
