import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getActiveHouseholdId } from "@/features/household/queries";
import type { UnitType } from "@/lib/supabase/types";
import { baseUnitFactor, unitFamily, type UnitContent } from "@/lib/units";

export type PriceOverviewRow = {
  productId: string;
  name: string;
  purchases: number;
  totalSpent: number;
  lastUnitPrice: number;
  unit: UnitType;
  lastDate: string;
  /** Contenido del envase; con él el precio se puede dar en €/kg o €/l. */
  content: UnitContent;
  /**
   * `products.pack_size` (F4). El precio de aquí es el de la COMPRA, así que con
   * pack es el de la caja: sin este dato la pantalla lo llamaría «€/ud» y sería
   * el precio de 30 sobres presentado como el de uno.
   */
  packSize: number | null;
};

/** Último precio conocido por producto, con el contenido de su envase. */
export type LatestUnitPrice = {
  /**
   * Importe de una unidad DE COMPRA (lo que costó una línea del ticket): con
   * pack, el de la caja. Cada consumidor decide si lo baja a la unidad, porque
   * NO quieren lo mismo: el coste de una receta cuenta lo que se echa a la olla
   * y sí divide por el pack (`computeRecipeCost`), mientras que una línea de la
   * lista cuenta cajas en el carro y no debe dividir (`lineCostOf`).
   */
  price: number;
  unit: UnitType;
  content: UnitContent;
  /** `products.pack_size`; null = sin pack. */
  packSize: number | null;
};

/** Columnas de contenido tal como llegan del embed de products. */
type ContentColumns = {
  content_size: number | null;
  content_unit: UnitType | null;
  content_is_estimate: boolean;
} | null;

type LatestPriceRow = {
  product_id: string | null;
  total_price: number | null;
  quantity: number;
  unit: UnitType;
  product:
    | ({ pack_size: number | null } & NonNullable<ContentColumns>)
    | null;
};

/** Normaliza las dos columnas a `UnitContent` (van en pareja o no van). */
function contentOf(product: ContentColumns): UnitContent {
  if (!product || product.content_size === null || product.content_unit === null) {
    return null;
  }
  return {
    size: Number(product.content_size),
    unit: product.content_unit,
    estimate: product.content_is_estimate,
  };
}

export type PricePoint = {
  date: string;
  unitPrice: number;
  totalPrice: number;
  quantity: number;
  unit: UnitType;
  storeChain: string;
};

type Row = {
  product_id: string | null;
  total_price: number | null;
  quantity: number;
  unit: UnitType;
  purchased_at: string | null;
  store_chain: string | null;
  product:
    | ({ name: string; pack_size: number | null } & NonNullable<ContentColumns>)
    | null;
};

/** Productos con historial de precios, ordenados por gasto total. */
export async function getPriceOverview(): Promise<PriceOverviewRow[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from("receipt_items")
      .select(
        // receipt_items tiene DOS FKs a products (product_id y suggested_product_id,
        // esta última de E7): hay que nombrar la relación o PostgREST da PGRST201.
        "product_id, total_price, quantity, unit, purchased_at, store_chain, product:products!receipt_items_product_id_fkey(name, pack_size, content_size, content_unit, content_is_estimate)",
      )
      .eq("household_id", householdId)
      .not("product_id", "is", null)
      .not("total_price", "is", null)
      .not("purchased_at", "is", null)
      .order("purchased_at", { ascending: true })
      // Desempate por una columna única: orden total para paginar.
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  const byProduct = new Map<string, PriceOverviewRow>();

  for (const r of rows) {
    if (!r.product_id || r.total_price === null || !r.purchased_at) continue;
    const qty = Number(r.quantity) || 1;
    const unitPrice = Number(r.total_price) / qty;
    const existing = byProduct.get(r.product_id);
    if (existing) {
      existing.purchases += 1;
      existing.totalSpent += Number(r.total_price);
      // rows están ordenadas por fecha asc → la última pisa a la anterior.
      existing.lastUnitPrice = unitPrice;
      existing.unit = r.unit;
      existing.lastDate = r.purchased_at;
    } else {
      byProduct.set(r.product_id, {
        productId: r.product_id,
        name: r.product?.name ?? "Producto",
        purchases: 1,
        totalSpent: Number(r.total_price),
        lastUnitPrice: unitPrice,
        unit: r.unit,
        lastDate: r.purchased_at,
        content: contentOf(r.product),
        packSize:
          r.product?.pack_size === null || r.product?.pack_size === undefined
            ? null
            : Number(r.product.pack_size),
      });
    }
  }

  return [...byProduct.values()].sort((a, b) => b.totalSpent - a.totalSpent);
}

/**
 * Último precio por unidad conocido de cada producto (total/cantidad de la
 * compra más reciente) con su unidad. Base del coste por receta (M7). Coincide
 * con el `lastUnitPrice` que muestra el overview de precios.
 */
export const getLatestUnitPrices = cache(async (): Promise<
  Map<string, LatestUnitPrice>
> => {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return new Map();
  const supabase = createServerSupabaseClient();
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from("receipt_items")
      // El contenido del envase viaja con el precio: sin él, costear "300 ml de
      // caldo" contra un precio por brick sería imposible. Hay DOS FKs a products,
      // así que la relación va nombrada (PGRST201).
      .select(
        "product_id, total_price, quantity, unit, purchased_at, product:products!receipt_items_product_id_fkey(pack_size, content_size, content_unit, content_is_estimate)",
      )
      .eq("household_id", householdId)
      .not("product_id", "is", null)
      .not("total_price", "is", null)
      .not("purchased_at", "is", null)
      .order("purchased_at", { ascending: true })
      // Desempate por una columna única: orden total para paginar.
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;

  const rows = (data ?? []) as unknown as LatestPriceRow[];
  const map = new Map<string, LatestUnitPrice>();
  for (const r of rows) {
    if (!r.product_id || r.total_price === null) continue;
    const qty = Number(r.quantity) || 1;
    // asc por fecha → la última compra pisa a las anteriores.
    map.set(r.product_id, {
      price: Number(r.total_price) / qty,
      unit: r.unit,
      content: contentOf(r.product),
      packSize:
        r.product?.pack_size == null ? null : Number(r.product.pack_size),
    });
  }
  return map;
});

export async function getProductPriceHistory(
  productId: string,
): Promise<{
  name: string;
  points: PricePoint[];
  content: UnitContent;
  /** Ver `packSize` en {@link PriceOverviewRow}: el precio es el de la compra. */
  packSize: number | null;
} | null> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return null;
  const supabase = createServerSupabaseClient();

  const [{ data: product }, { data, error }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "name, pack_size, content_size, content_unit, content_is_estimate",
      )
      .eq("household_id", householdId)
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("receipt_items")
      .select("purchased_at, total_price, quantity, unit, store_chain")
      .eq("household_id", householdId)
      .eq("product_id", productId)
      .not("purchased_at", "is", null)
      .not("total_price", "is", null)
      .order("purchased_at", { ascending: true }),
  ]);
  if (error) throw error;
  if (!product) return null;

  /*
    Una sola unidad por ficha. Antes cada punto era `total / cantidad` en SU
    unidad y la página rotulaba con la del primero, así que una compra de
    500 g a 2 € salía como «4 €/kg»… o como «0,004 €/g» según la otra, y el
    mínimo y el máximo comparaban gramos con kilos. Mismo criterio que las
    alertas y la hucha: se queda la familia dominante (una serie en ud no se
    mezcla con una a peso) y todo se expresa en la unidad de la compra más
    reciente de esa familia.
  */
  const rows = (data ?? []).filter((r) => Number(r.quantity) > 0);
  const familyCount = new Map<string, number>();
  for (const r of rows) {
    const f = unitFamily(r.unit);
    familyCount.set(f, (familyCount.get(f) ?? 0) + 1);
  }
  const dominant = [...familyCount].sort((a, b) => b[1] - a[1])[0]?.[0];
  const inFamily = rows.filter((r) => unitFamily(r.unit) === dominant);
  const target = inFamily[inFamily.length - 1]?.unit;
  const points: PricePoint[] = inFamily.map((r) => {
    const qty =
      (Number(r.quantity) * baseUnitFactor(r.unit)) /
      baseUnitFactor(target ?? r.unit);
    return {
      date: r.purchased_at as string,
      unitPrice: Number(r.total_price) / qty,
      totalPrice: Number(r.total_price),
      quantity: qty,
      unit: target ?? r.unit,
      storeChain: r.store_chain ?? "otro",
    };
  });

  return {
    name: product.name,
    points,
    content: contentOf(product),
    packSize: product.pack_size === null ? null : Number(product.pack_size),
  };
}
