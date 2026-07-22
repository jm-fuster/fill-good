import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LocationType, UnitType } from "@/lib/supabase/types";
import { baseUnitFactor, unitFamily } from "@/lib/units";

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

/**
 * Ids de producto anclados por el usuario actual ("Mis habituales", E5). La RLS
 * de `user_pinned_products` ya restringe a los pines del propio usuario, así que
 * un select simple devuelve solo los suyos.
 */
export async function getPinnedProductIds(): Promise<Set<string>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_pinned_products")
    .select("product_id");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.product_id));
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
  const supabase = createServerSupabaseClient();
  const [{ data: products, error: prodErr }, { data: inv, error: invErr }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, category:categories(id, name, icon, sort_order)")
        .order("name", { ascending: true }),
      supabase.from("inventory_items").select("product_id"),
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
export type ProductStock = { quantity: number; unit: UnitType };

/**
 * Stock total por producto (suma de todas las ubicaciones), expresado en la
 * unidad por defecto del producto. Solo se suman filas de la MISMA familia de
 * unidades que la unidad por defecto (g↔kg, ml↔l se convierten con exactitud;
 * ud↔peso nunca se mezcla). Solo devuelve productos con cantidad > 0. Lo usa el
 * formulario de recetas (F3) para el badge de stock por ingrediente.
 */
export async function getStockByProduct(): Promise<
  Record<string, ProductStock>
> {
  const supabase = createServerSupabaseClient();
  const [{ data: inv, error: invErr }, { data: prods, error: prodErr }] =
    await Promise.all([
      supabase.from("inventory_items").select("product_id, quantity, unit"),
      supabase.from("products").select("id, default_unit"),
    ]);
  if (invErr) throw invErr;
  if (prodErr) throw prodErr;

  const defaultUnit = new Map<string, UnitType>();
  for (const p of prods ?? []) defaultUnit.set(p.id, p.default_unit);

  const totals = new Map<string, number>();
  for (const row of inv ?? []) {
    const target = defaultUnit.get(row.product_id);
    if (!target) continue;
    if (unitFamily(row.unit) !== unitFamily(target)) continue;
    const inTarget =
      (Number(row.quantity) * baseUnitFactor(row.unit)) /
      baseUnitFactor(target);
    totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + inTarget);
  }

  const result: Record<string, ProductStock> = {};
  for (const [pid, qty] of totals) {
    if (qty > 0) result[pid] = { quantity: qty, unit: defaultUnit.get(pid)! };
  }
  return result;
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
