import "server-only";

import { auth } from "@clerk/nextjs/server";
import { addMonths, format, formatISO, parseISO, subHours } from "date-fns";

import { startOfDayInSpain, todayLocalISO } from "@/lib/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getActiveHouseholdId,
  getCurrentHousehold,
} from "@/features/household/queries";
import { getLatestUnitPrices } from "@/features/prices/queries";
import { normalizeName } from "@/lib/normalize";
import type { ChainSavingsTip } from "@/features/prices/chain-savings";
import type { UnitContent } from "@/lib/units";
import type { LocationType, UnitType } from "@/lib/supabase/types";
import type { ItemUnitPrice } from "./line-cost";
import { compareTripToReceipt } from "./trip-comparison";
import { TRIP_MATCH_WINDOW_HOURS } from "./trips";

export type ActiveList = { id: string; name: string };

export type ListItem = {
  id: string;
  /**
   * Nombre VIVO: el del producto vinculado, no el rótulo con el que se apuntó.
   * `shopping_list_items.name` es una copia del momento del alta, así que
   * renombrar «Aceite» → «Aceite de oliva virgen extra» en el inventario dejaba
   * la lista con el nombre viejo mientras el icono y la categoría del embed sí
   * se actualizaban — esa mezcla es lo que se lee como un fallo. La columna
   * sigue siendo el fallback, y hace falta: el texto libre (y lo que Alexa no
   * consigue casar) no tiene producto hasta el checkout, y ahí es lo único que
   * hay.
   */
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  isChecked: boolean;
  productId: string | null;
  addedByMe: boolean;
  /**
   * Orden dentro de la lista (el de «Reordenar»). Viaja al cliente porque la
   * pantalla coloca las filas ella misma: cuando llega un alta de otro móvil o
   * un reorden, con `position` sabe DÓNDE va sin recargar la página solo para
   * averiguar el orden (ver `sortSyncedItems`).
   */
  position: number;
  /** Antigüedad, para desempatar dos filas con la misma `position`. */
  createdAt: string;
  /** Categoría del producto para agrupar en `/lista` (L10); ausente en altas optimistas. */
  categoryName?: string;
  categoryIcon?: string | null;
  categorySort?: number;
  /**
   * Id de la categoría; null/ausente = sin categoría ("Otros"). Hace falta para
   * resolver el orden de pasillos propio de una tienda (`aisleSort`), que se
   * guarda por id y no por nombre.
   */
  categoryId?: string | null;
  /** Icono manual del producto (L16); null/ausente = automático (se adivina del nombre). */
  productIcon?: string | null;
  /** Tienda preferida del producto (L15); null/ausente = sin preferencia. */
  preferredChain?: string | null;
  /** Aviso de ahorro si otra cadena sale más barata (L15, fase 3). */
  savings?: ChainSavingsTip | null;
  /**
   * Contenido de cada unidad del producto; con él la lista puede decir cuánto
   * llevas en total ("3 bricks · 1,5 l"). Ausente en altas optimistas.
   */
  content?: UnitContent;
  /**
   * Unidades por compra (F4); null = sin pack. Viaja hasta la fila porque en la
   * lista la cantidad cuenta COMPRAS: con pack 10, un «1» repone 10 ud, y eso
   * hay que verlo en el pasillo, no descubrirlo al finalizar la compra.
   * Ausente en altas optimistas.
   */
  packSize?: number | null;
};

export type SuggestionReason =
  | "low_stock"
  | "expired"
  | "out_of_stock"
  | "restock";

export type Suggestion = {
  productId: string;
  name: string;
  unit: UnitType;
  reason: SuggestionReason;
  /** Cadencia habitual en días (solo en reason "restock"). */
  intervalDays?: number;
  /**
   * Existencias totales en el momento de calcular la sugerencia.
   *
   * Viaja porque `reason` dice qué REGLA se ha disparado, no si queda algo, y son
   * dos hechos distintos: un producto con mínimo definido y cero existencias sale
   * por la fuente "low_stock" —la regla que el usuario escribió manda en la
   * precedencia y en el orden— así que sin este dato el rótulo anunciaba que
   * «quedan pocas» de algo que no queda ninguna.
   */
  stock: number;
  /**
   * Cantidad sugerida a añadir a la lista (en unidades de lista). Para "low_stock"
   * cubre el déficit hasta el mínimo; para "restock" es una compra estándar.
   */
  suggestedQuantity: number;
  /**
   * Unidades por compra (F4); null = sin pack. La cantidad sugerida ya viene
   * contada en packs, así que sin esto la fila dice "1 ud" de algo que repone 10.
   */
  packSize: number | null;
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
  /** Icono manual del producto (L16); null = automático (se adivina del nombre). */
  icon: string | null;
  /**
   * Categoría del producto, para recorrer el catálogo por pasillos en el
   * selector de altas (L17). null = sin categoría ("Otros"), que va al final.
   */
  categoryName: string | null;
  categoryIcon: string | null;
  categorySort: number;
};

export async function getActiveList(): Promise<ActiveList | null> {
  const household = await getCurrentHousehold();
  if (!household) return null;
  const supabase = createServerSupabaseClient();
  // Acotado al hogar activo: sin el filtro, un usuario con dos hogares recibía
  // la lista MÁS ANTIGUA de cualquiera de ellos (la del otro hogar, casi
  // siempre) y toda la pantalla /lista trabajaba sobre la casa equivocada.
  const query = () =>
    supabase
      .from("shopping_lists")
      .select("id, name")
      .eq("household_id", household.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  let { data } = await query();
  if (!data) {
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
  const householdId = await getActiveHouseholdId();
  if (!householdId) return { listId: null, pendingCount: 0 };
  const supabase = createServerSupabaseClient();
  // Una sola query (antes 2 secuenciales: lista → count): el count de artículos
  // pendientes va embebido y filtrado en el propio embed. supabase-js devuelve
  // el count embebido como `[{ count: number }]`.
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id, shopping_list_items(count)")
    .eq("household_id", householdId)
    .eq("status", "active")
    .eq("shopping_list_items.is_checked", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!list) return { listId: null, pendingCount: 0 };

  const counts = list.shopping_list_items as unknown as
    | { count: number }[]
    | null;
  return { listId: list.id, pendingCount: counts?.[0]?.count ?? 0 };
}

/**
 * Ids de producto del catálogo presentes en la lista activa. Se usa para mostrar
 * el estado "En la lista" en el inventario sin duplicar ítems. Solo lee (no crea
 * lista activa como `getActiveList`): si no hay lista, no hay nada que marcar.
 */
export async function getActiveListProductIds(): Promise<Set<string>> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return new Set();
  const supabase = createServerSupabaseClient();
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!list) return new Set();

  const { data } = await supabase
    .from("shopping_list_items")
    .select("product_id")
    .eq("household_id", householdId)
    .eq("list_id", list.id)
    .not("product_id", "is", null);
  return new Set(
    (data ?? [])
      .map((i) => i.product_id)
      .filter((id): id is string => Boolean(id)),
  );
}

/** Lo que hay apuntado en la lista activa, tal como lo necesita el menú (N6). */
export type ActiveListContents = {
  /** Ids de producto apuntados. */
  productIds: Set<string>;
  /** Nombres normalizados, para casar con los ingredientes de una receta. */
  names: Set<string>;
  /** Nombres tal cual, para enseñárselos al generador de menús. */
  labels: string[];
};

/**
 * Contenido de la lista activa para el generador de menús: lo que está apuntado
 * se va a comprar en los próximos días, así que a la hora de planificar una
 * semana cuenta como disponible.
 *
 * Solo LEE (a diferencia de `getActiveList`, no crea lista activa): el menú se
 * genera sin que el usuario haya pasado por /lista, y crearle una lista vacía de
 * rebote sería un efecto secundario que nadie ha pedido.
 *
 * Incluye también lo ya marcado en el carrito: comprado pero sin finalizar la
 * compra sigue siendo algo que entrará en casa antes de cocinar.
 *
 * Se usa `shopping_list_items.name` —no el nombre vivo del producto— porque es
 * el mismo campo con el que «añadir a la lista lo que falte» decide si algo ya
 * está apuntado, y las dos respuestas tienen que ser la misma.
 */
export async function getActiveListContents(): Promise<ActiveListContents> {
  const empty: ActiveListContents = {
    productIds: new Set(),
    names: new Set(),
    labels: [],
  };
  const householdId = await getActiveHouseholdId();
  if (!householdId) return empty;
  const supabase = createServerSupabaseClient();
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!list) return empty;

  const { data } = await supabase
    .from("shopping_list_items")
    .select("name, product_id")
    .eq("household_id", householdId)
    .eq("list_id", list.id)
    .order("position", { ascending: true });

  const productIds = new Set<string>();
  const names = new Set<string>();
  const labels: string[] = [];
  for (const item of data ?? []) {
    if (item.product_id) productIds.add(item.product_id);
    const norm = normalizeName(item.name);
    if (!norm || names.has(norm)) continue;
    names.add(norm);
    labels.push(item.name);
  }
  return { productIds, names, labels };
}

/** Ítem de la lista enriquecido para el modo compra (M4). */
export type ShoppingModeItem = {
  id: string;
  /** Nombre vivo del producto vinculado; ver `ListItem.name`. */
  name: string;
  /** Producto del catálogo, o null en un alta de texto libre sin enlazar. */
  productId: string | null;
  quantity: number | null;
  unit: UnitType | null;
  isChecked: boolean;
  /** Orden dentro de la lista; ver `ListItem.position`. */
  position: number;
  /** Antigüedad, para desempatar dos filas con la misma `position`. */
  createdAt: string;
  categoryName: string;
  categoryIcon: string | null;
  /** Icono manual del producto (L16); null = automático. */
  productIcon: string | null;
  /** Categoría del producto; null = sin categoría ("Otros"). */
  categoryId: string | null;
  /**
   * Orden de pasillo GENERAL (sort_order de la categoría; sin categoría al
   * final). La tienda del viaje puede tener el suyo, y ese se resuelve en el
   * cliente con `categoryId` (features/categories/aisle-order.ts).
   */
  categorySort: number;
  /**
   * Último precio conocido del producto, NO el coste ya multiplicado: en el
   * pasillo la cantidad cambia con el stepper y el coste de la línea se
   * recalcula en el cliente (`lineCostOf`), sin esperar al servidor. null = no
   * se conoce precio.
   */
  unitPrice: ItemUnitPrice | null;
  /** Contenido de cada unidad del producto; null = no declarado. */
  content: UnitContent;
  /** Unidades por compra (F4); null = sin pack. Ver `ListItem.packSize`. */
  packSize: number | null;
  /** Tienda preferida del producto (L15); null = sin preferencia. */
  preferredChain: string | null;
};

type ShoppingModeRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  is_checked: boolean;
  position: number;
  created_at: string;
  product_id: string | null;
  product: {
    name: string;
    preferred_chain: string | null;
    inferred_chain: string | null;
    icon: string | null;
    pack_size: number | null;
    content_size: number | null;
    content_unit: UnitType | null;
    content_is_estimate: boolean;
    category: {
      id: string;
      name: string;
      icon: string | null;
      sort_order: number;
    } | null;
  } | null;
};

const NO_CATEGORY_SORT = 9_000;

/**
 * Ítems de la lista para el "Modo compra" (M4): con su categoría (para agrupar
 * por pasillo con el sort_order existente) y el último precio conocido de cada
 * producto, con el que el cliente costea la línea (`lineCostOf`). Una sola
 * pasada + el mapa de precios; sin N+1.
 */
export async function getShoppingModeItems(
  listId: string,
): Promise<ShoppingModeItem[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  // La cadena inferida se lee MATERIALIZADA del embed (products.inferred_chain);
  // getLatestUnitPrices se queda (solo corre aquí, en /lista/compra).
  const [{ data, error }, prices] = await Promise.all([
    supabase
      .from("shopping_list_items")
      .select(
        "id, name, quantity, unit, is_checked, position, created_at, product_id, product:products(name, preferred_chain, inferred_chain, icon, pack_size, content_size, content_unit, content_is_estimate, category:categories(id, name, icon, sort_order))",
      )
      .eq("household_id", householdId)
      .eq("list_id", listId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    getLatestUnitPrices(),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as unknown as ShoppingModeRow[];
  return rows.map((r) => {
    const qty = r.quantity === null ? null : Number(r.quantity);
    const price = r.product_id ? prices.get(r.product_id) : undefined;
    return {
      id: r.id,
      name: r.product?.name ?? r.name,
      productId: r.product_id,
      quantity: qty,
      unit: r.unit,
      isChecked: r.is_checked,
      position: r.position,
      createdAt: r.created_at,
      categoryName: r.product?.category?.name ?? "Otros",
      categoryIcon: r.product?.category?.icon ?? null,
      productIcon: r.product?.icon ?? null,
      categoryId: r.product?.category?.id ?? null,
      categorySort: r.product?.category?.sort_order ?? NO_CATEGORY_SORT,
      unitPrice: price ?? null,
      content:
        r.product?.content_size == null || r.product?.content_unit == null
          ? null
          : {
              size: Number(r.product.content_size),
              unit: r.product.content_unit,
              estimate: r.product.content_is_estimate,
            },
      packSize:
        r.product?.pack_size == null ? null : Number(r.product.pack_size),
      // Efectiva: la manual gana; si no hay, la inferida materializada (fase 2).
      preferredChain:
        r.product?.preferred_chain ?? r.product?.inferred_chain ?? null,
    };
  });
}

type ListItemRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  is_checked: boolean;
  position: number;
  created_at: string;
  product_id: string | null;
  added_by: string | null;
  product: {
    name: string;
    preferred_chain: string | null;
    inferred_chain: string | null;
    savings_tip: ChainSavingsTip | null;
    icon: string | null;
    pack_size: number | null;
    content_size: number | null;
    content_unit: UnitType | null;
    content_is_estimate: boolean;
    category: {
      id: string;
      name: string;
      icon: string | null;
      sort_order: number;
    } | null;
  } | null;
};

export async function getListItems(listId: string): Promise<ListItem[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  // Cadena inferida y aviso de ahorro se leen MATERIALIZADOS del embed de
  // products, no escaneando todo el histórico de receipt_items en cada render.
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select(
      "id, name, quantity, unit, is_checked, position, created_at, product_id, added_by, product:products(name, preferred_chain, inferred_chain, savings_tip, icon, pack_size, content_size, content_unit, content_is_estimate, category:categories(id, name, icon, sort_order))",
    )
    .eq("household_id", householdId)
    .eq("list_id", listId)
    .order("is_checked", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ListItemRow[];
  return rows.map((i) => ({
    id: i.id,
    name: i.product?.name ?? i.name,
    quantity: i.quantity === null ? null : Number(i.quantity),
    unit: i.unit,
    isChecked: i.is_checked,
    position: i.position,
    createdAt: i.created_at,
    productId: i.product_id,
    addedByMe: i.added_by === userId,
    categoryName: i.product?.category?.name ?? "Otros",
    categoryIcon: i.product?.category?.icon ?? null,
    productIcon: i.product?.icon ?? null,
    categoryId: i.product?.category?.id ?? null,
    categorySort: i.product?.category?.sort_order ?? NO_CATEGORY_SORT,
    // Efectiva: la manual gana; si no hay, la inferida materializada (fase 2).
    preferredChain: i.product?.preferred_chain ?? i.product?.inferred_chain ?? null,
    savings: (i.product?.savings_tip as ChainSavingsTip | null) ?? null,
    content:
      i.product?.content_size == null || i.product?.content_unit == null
        ? null
        : {
            size: Number(i.product.content_size),
            unit: i.product.content_unit,
            estimate: i.product.content_is_estimate,
          },
    packSize: i.product?.pack_size == null ? null : Number(i.product.pack_size),
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
  // Un déficit a granel minúsculo (mín 1,04 kg, stock 1,0) redondeaba a 0 y la
  // sugerencia se añadía «sin cantidad»: nunca menos de 0,1.
  return deficit > 0 ? Math.max(0.1, Math.round(deficit * 10) / 10) : 1;
}

/**
 * Sugerencias de compra (M5), en una sola consulta agregada (sin N+1). Fuentes,
 * en orden de precedencia (la primera que casa gana; un producto sale una vez):
 *  · "low_stock" — mínimo definido y stock total por debajo. Va primero porque
 *    es la única regla que el usuario ha escrito explícitamente. Ojo: por eso
 *    absorbe también lo que está a CERO teniendo mínimo. `reason` dice qué regla
 *    manda, no si queda algo; de decirlo en palabras se encarga el rótulo con
 *    `stock` (ver `suggestion-reason.ts`), que en ese caso anuncia «Se ha
 *    agotado». La precedencia es de la regla; la verdad, del stock.
 *  · "expired" — hay algún lote caducado. OJO: el stock caducado SIGUE contando
 *    como stock en el resto de fuentes (no se descuenta), justo por eso hace
 *    falta esta: un bote caducado bloquearía "agotado" y "reposición" y el
 *    producto no se sugeriría nunca.
 *  · "out_of_stock" — sin existencias y con al menos una compra a la espalda
 *    (algo que nunca has comprado no es que "se te haya acabado").
 *  · "restock" — ≥3 compras cuya cadencia habitual (mediana de intervalos) ya se
 *    ha cumplido. Cadencias > 60 días se descartan. Solo para productos SIN
 *    mínimo definido: quien escribió un mínimo ya dijo cuándo avisarle (fuente
 *    1), y sugerirle con el mínimo cubierto sería llevarle la contraria.
 *
 * Nunca se sugiere algo que ya esté en la lista, ni un producto silenciado con
 * «Descartar» cuyo plazo siga vigente (`suggestions_snoozed_until`).
 */
export async function getSuggestions(listId: string): Promise<Suggestion[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  /*
    Aquí los errores se REGISTRAN pero no se lanzan, al revés que en los
    agregados de dinero (`getMonthlySpending`), y la diferencia es qué queda si
    esto falla: allí la consulta ES el contenido de la pantalla y un cero se lee
    como un hecho sobre el hogar; aquí las sugerencias son un añadido a la lista
    de la compra, que es la pantalla que se usa dentro del súper. Tirarla entera
    porque no se pudo calcular «te puede faltar leche» cambiaría una omisión por
    una app inservible con el carro delante.

    Lo que no puede seguir pasando es el silencio: sin este log, una consulta
    rota (una columna que aún no existe porque la migración no está aplicada, el
    caso que ya documenta `getConfiguredChains`) se presentaba como «no hay nada
    que sugerir» y no dejaba ni rastro que mirar en Vercel.
  */
  const [
    { data: products, error: prodErr },
    { data: inventory, error: invErr },
    { data: items, error: itemsErr },
    { data: history, error: histErr },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, min_quantity, default_unit, purchase_count, pack_size, suggestions_snoozed_until",
      )
      .eq("household_id", householdId),
    supabase
      .from("inventory_items")
      .select("product_id, quantity, expiry_date")
      .eq("household_id", householdId),
    supabase
      .from("shopping_list_items")
      .select("product_id")
      .eq("household_id", householdId)
      .eq("list_id", listId)
      .not("product_id", "is", null),
    supabase
      .from("receipt_items")
      .select("product_id, purchased_at")
      .eq("household_id", householdId)
      .not("product_id", "is", null)
      .not("purchased_at", "is", null)
      .order("purchased_at", { ascending: true }),
  ]);
  const fallo = prodErr ?? invErr ?? itemsErr ?? histErr;
  if (fallo) {
    console.error("No se pudieron calcular las sugerencias de la lista:", fallo);
  }

  // Hoy en España: esta fecha decide qué lote cuenta como caducado para dejar
  // de sugerirlo, y con la del proceso (UTC) discrepaba de la que usa la ficha
  // del inventario para pintar el mismo lote.
  const todayISO = todayLocalISO();

  const stockByProduct = new Map<string, number>();
  // Productos con algún lote ya caducado (con existencias: un lote a 0 ya está
  // consumido o tirado, y avisar de él sería ruido).
  const expiredProducts = new Set<string>();
  for (const row of inventory ?? []) {
    const qty = Number(row.quantity);
    stockByProduct.set(
      row.product_id,
      (stockByProduct.get(row.product_id) ?? 0) + qty,
    );
    if (qty > 0 && row.expiry_date && row.expiry_date < todayISO) {
      expiredProducts.add(row.product_id);
    }
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

  const nowISO = new Date().toISOString();
  const suggestions: Suggestion[] = [];
  // Habitualidad de cada producto sugerido, solo para ordenar al final.
  const purchaseCountById = new Map<string, number>();

  for (const p of products ?? []) {
    if (onList.has(p.id)) continue;
    // Descartado por el usuario y aún dentro del plazo de silencio.
    if (
      p.suggestions_snoozed_until &&
      p.suggestions_snoozed_until > nowISO
    ) {
      continue;
    }
    const stock = stockByProduct.get(p.id) ?? 0;
    const min = p.min_quantity === null ? null : Number(p.min_quantity);
    const packSize = p.pack_size === null ? null : Number(p.pack_size);
    purchaseCountById.set(p.id, p.purchase_count);

    // Fuente 1: por debajo del mínimo (precedencia).
    if (min !== null && stock < min) {
      suggestions.push({
        productId: p.id,
        name: p.name,
        unit: p.default_unit,
        reason: "low_stock",
        stock,
        suggestedQuantity: suggestedQuantityFor(
          p.default_unit,
          stock,
          min,
          packSize,
        ),
        packSize,
      });
      continue;
    }

    // Fuente 2: hay algún lote caducado.
    if (expiredProducts.has(p.id)) {
      suggestions.push({
        productId: p.id,
        name: p.name,
        unit: p.default_unit,
        reason: "expired",
        stock,
        suggestedQuantity: suggestedQuantityFor(
          p.default_unit,
          stock,
          min,
          packSize,
        ),
        packSize,
      });
      continue;
    }

    // Fuente 3: se acabó y es algo que ya has comprado alguna vez.
    if (stock <= 0 && p.purchase_count > 0) {
      suggestions.push({
        productId: p.id,
        name: p.name,
        unit: p.default_unit,
        reason: "out_of_stock",
        stock,
        suggestedQuantity: suggestedQuantityFor(
          p.default_unit,
          stock,
          min,
          packSize,
        ),
        packSize,
      });
      continue;
    }

    // Fuente 4: reposición por cadencia.
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
    // Ojo con exigir aquí «agotado o bajo mínimo»: ambos casos ya salieron por
    // las fuentes 1 y 3 (continue), así que la condición era inalcanzable y
    // esta fuente estaba muerta. Su valor propio es justo el resto: stock que
    // nadie descuenta (o que no se rastrea) pero cuya cadencia de compra ya se
    // cumplió. Con mínimo definido y cubierto, la regla del usuario manda y no
    // se sugiere.
    if (daysSinceLast >= median && min === null) {
      suggestions.push({
        productId: p.id,
        name: p.name,
        unit: p.default_unit,
        reason: "restock",
        intervalDays: Math.round(median),
        stock,
        suggestedQuantity: suggestedQuantityFor(
          p.default_unit,
          stock,
          min,
          packSize,
        ),
        packSize,
      });
    }
  }

  // Lo más accionable primero: la regla que el usuario escribió (mínimo), luego
  // el hecho concreto (caducado), luego la ausencia (agotado) y por último la
  // predicción (cadencia). A igualdad, lo que más se compra manda: en una casa
  // con catálogo grande, "agotado" puede devolver decenas de filas y sin orden
  // la leche quedaría detrás de un bote de comino.
  const REASON_PRIORITY: Record<SuggestionReason, number> = {
    low_stock: 0,
    expired: 1,
    out_of_stock: 2,
    restock: 3,
  };
  suggestions.sort(
    (a, b) =>
      REASON_PRIORITY[a.reason] - REASON_PRIORITY[b.reason] ||
      (purchaseCountById.get(b.productId) ?? 0) -
        (purchaseCountById.get(a.productId) ?? 0) ||
      a.name.localeCompare(b.name, "es"),
  );

  return suggestions;
}

/**
 * Producto que hay que reponer tras un consumo. Cumple el `ReasonSource` de
 * `suggestion-reason.ts` (reason + stock), que es lo que le permite compartir
 * rótulo con las sugerencias de /lista sin copiar la forma de {@link Suggestion}.
 */
export type RestockCandidate = {
  productId: string;
  name: string;
  unit: UnitType;
  reason: "out_of_stock" | "low_stock";
  /** Existencias restantes; ver el campo homónimo de {@link Suggestion}. */
  stock: number;
  suggestedQuantity: number;
  packSize: number | null;
};

/**
 * De los productos que se acaban de gastar, los que se han quedado sin
 * existencias o por debajo del mínimo. Es la mitad EMPUJADA de `getSuggestions`:
 * mismas dos fuentes, misma precedencia, misma cantidad sugerida y mismo rótulo,
 * pero acotada a lo que se acaba de consumir y resuelta en el momento, sin
 * esperar a que alguien abra /lista.
 *
 * Una sola divergencia deliberada con `getSuggestions`: no exige
 * `purchase_count > 0` para "agotado". Allí hace falta porque algo que nunca
 * compraste no es que "se te haya acabado"; aquí hay prueba directa de que estaba
 * en casa y se ha gastado ahora mismo, que es señal más fuerte que el historial
 * de compras (un alta manual no deja compras a su espalda).
 *
 * Respeta el silencio de «Descartar» (`suggestions_snoozed_until`) y omite lo que
 * ya esté en la lista activa: ofrecer apuntar algo que ya está apuntado es justo
 * lo que se lee como un fallo de la app.
 */
export async function getRestockCandidates(
  productIds: string[],
): Promise<RestockCandidate[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return [];
  const supabase = createServerSupabaseClient();

  const [{ data: products }, { data: inventory }, onList] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, min_quantity, default_unit, pack_size, suggestions_snoozed_until",
      )
      .eq("household_id", householdId)
      .in("id", ids),
    supabase
      .from("inventory_items")
      .select("product_id, quantity")
      .eq("household_id", householdId)
      .in("product_id", ids),
    getActiveListProductIds(),
  ]);

  // Stock total por producto SUMANDO todas las unidades, igual que
  // `getSuggestions`: es la misma simplificación (un mínimo se compara contra ese
  // total) y las dos deben coincidir o el mismo producto saldría aquí y no allí.
  const stockByProduct = new Map<string, number>();
  for (const row of inventory ?? []) {
    stockByProduct.set(
      row.product_id,
      (stockByProduct.get(row.product_id) ?? 0) + Number(row.quantity),
    );
  }

  const nowISO = new Date().toISOString();
  const candidates: RestockCandidate[] = [];
  for (const p of products ?? []) {
    if (onList.has(p.id)) continue;
    if (p.suggestions_snoozed_until && p.suggestions_snoozed_until > nowISO) {
      continue;
    }
    const stock = stockByProduct.get(p.id) ?? 0;
    const min = p.min_quantity === null ? null : Number(p.min_quantity);
    const packSize = p.pack_size === null ? null : Number(p.pack_size);
    // Misma precedencia que `getSuggestions`: manda la regla que escribió el
    // usuario. Que un producto a cero con mínimo salga como "low_stock" no lo
    // anuncia mal — el rótulo mira `stock` y dice «Se ha agotado».
    const reason =
      min !== null && stock < min
        ? ("low_stock" as const)
        : stock <= 0
          ? ("out_of_stock" as const)
          : null;
    if (!reason) continue;
    candidates.push({
      productId: p.id,
      name: p.name,
      unit: p.default_unit,
      reason,
      stock,
      suggestedQuantity: suggestedQuantityFor(
        p.default_unit,
        stock,
        min,
        packSize,
      ),
      packSize,
    });
  }

  // Lo que falta del todo antes de lo que va escaso; alfabético como desempate.
  // Se ordena por el STOCK, no por `reason`: con la precedencia de la regla, lo
  // que está a cero teniendo mínimo sale como "low_stock" y ordenar por el motivo
  // lo mandaría detrás de algo de lo que todavía queda.
  candidates.sort(
    (a, b) =>
      (a.stock <= 0 ? 0 : 1) - (b.stock <= 0 ? 0 : 1) ||
      a.name.localeCompare(b.name, "es"),
  );
  return candidates;
}

type CatalogRow = {
  id: string;
  name: string;
  normalized_name: string;
  default_unit: UnitType;
  default_location: LocationType;
  purchase_count: number;
  pack_size: number | null;
  icon: string | null;
  category: { name: string; icon: string | null; sort_order: number } | null;
};

/**
 * Catálogo ligero del hogar para el autocompletado en cliente. Ordenado por
 * habitualidad (más comprados primero) y luego alfabético como desempate.
 *
 * Trae también icono y categoría porque este mismo catálogo es el que se
 * recorre entero en el selector de altas (L17): sin la categoría no habría
 * pasillos por los que agruparlo, y sin el icono las fichas irían desnudas.
 */
export async function getProductCatalog(): Promise<CatalogProduct[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, normalized_name, default_unit, default_location, purchase_count, pack_size, icon, category:categories(name, icon, sort_order)",
    )
    .eq("household_id", householdId)
    .order("purchase_count", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as CatalogRow[];
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    normalizedName: p.normalized_name,
    defaultUnit: p.default_unit,
    defaultLocation: p.default_location,
    purchaseCount: p.purchase_count,
    packSize: p.pack_size === null ? null : Number(p.pack_size),
    icon: p.icon,
    categoryName: p.category?.name ?? null,
    categoryIcon: p.category?.icon ?? null,
    categorySort: p.category?.sort_order ?? NO_CATEGORY_SORT,
  }));
}

// La antigua `getHabitualProducts` (chips "Habituales": comprado ≥2 veces y sin
// stock) desapareció al ampliar `getSuggestions`: su fuente "out_of_stock" cubre
// exactamente lo mismo y además DICE por qué («Se ha agotado») y se puede
// descartar. Mantener las dos habría dejado una sección permanentemente vacía,
// porque la lista ya filtraba de los chips todo lo que fuera sugerencia.

/** Compra cerrada desde la lista que sigue sin ticket escaneado (G2). */
export type PendingTicketTrip = { id: string };

/**
 * Última compra cerrada desde la lista que aún no tiene ticket y que TODAVÍA se
 * podría emparejar con uno. Es lo que permite ofrecer el escaneo más tarde —
 * cuando se llega a casa con el ticket de papel— en vez de bifurcar el botón de
 * «Finalizar compra» en dos (finalizar / finalizar y escanear), que duplicaría
 * la entrada al inventario.
 *
 * La ventana es la misma que usa `linkReceiptToTrip`: pasada esa ventana el
 * ticket ya no se enlazaría con esta compra, así que seguir ofreciéndolo sería
 * engañoso.
 */
export async function getTripPendingTicket(): Promise<PendingTicketTrip | null> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return null;
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("shopping_trips")
    .select("id")
    .eq("household_id", householdId)
    .is("receipt_id", null)
    .gte("closed_at", formatISO(subHours(new Date(), TRIP_MATCH_WINDOW_HOURS)))
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id } : null;
}

export type MonthlyTripStats = {
  /** Compras cerradas desde la lista que se emparejaron con un ticket. */
  tripsMatched: number;
  /** De esas, cuántas no tuvieron ni un producto fuera de lista. */
  tripsPerfect: number;
  /** El extra que más veces se repitió en el mes; null si ninguno se repite. */
  topExtra: { label: string; value: number } | null;
};

/** Compras mínimas fuera de lista para que un extra cuente como "capricho". */
const RECURRING_EXTRA_MIN_TIMES = 2;

/**
 * Compras perfectas del mes (G2): cuántas compras cerradas desde la lista se
 * emparejaron con un ticket, cuántas de ellas no tuvieron ningún producto fuera
 * de lista, y cuál fue el capricho más repetido.
 *
 * Vive aquí y no en `prices/wrapped.ts` porque el dato es de la lista de la
 * compra (`shopping_trips` + `compareTripToReceipt`), y lo consumen varias
 * pantallas: el resumen del mes cerrado y el marcador del mes en curso.
 *
 * Se recalcula desde los snapshots en cada lectura en vez de guardarse al
 * confirmar el ticket, para que una mejora futura del emparejamiento se refleje
 * también en los meses ya pasados.
 *
 * @param month Mes objetivo en formato "yyyy-MM".
 */
export async function getMonthlyTripStats(
  month: string,
): Promise<MonthlyTripStats> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) {
    return { tripsMatched: 0, tripsPerfect: 0, topExtra: null };
  }
  const supabase = createServerSupabaseClient();
  const monthStart = parseISO(`${month}-01`);
  // `closed_at` es `timestamptz`, así que las fronteras van como INSTANTES de
  // la medianoche española. Con la fecha suelta ('2026-09-01') Postgres la lee
  // como medianoche UTC —las 02:00 de Madrid en verano—, y una compra cerrada
  // a la 01:00 del día 1 se contaba en el mes anterior mientras su ticket
  // (`purchased_at`, un `date` sin zona) contaba en el nuevo: las compras
  // perfectas y el gasto del mismo mes salían de dos calendarios distintos.
  const monthStartStr = startOfDayInSpain(format(monthStart, "yyyy-MM-dd"));
  const nextStartStr = startOfDayInSpain(
    format(addMonths(monthStart, 1), "yyyy-MM-dd"),
  );

  const { data: tripRows, error: tripErr } = await supabase
    .from("shopping_trips")
    .select("id, product_ids, receipt_id")
    .eq("household_id", householdId)
    .not("receipt_id", "is", null)
    .gte("closed_at", monthStartStr)
    .lt("closed_at", nextStartStr);
  if (tripErr) throw tripErr;

  const trips = tripRows ?? [];
  const receiptIds = trips
    .map((t) => t.receipt_id)
    .filter((id): id is string => id !== null);

  let tripsPerfect = 0;
  const extraCounts = new Map<string, number>();

  if (receiptIds.length > 0) {
    /*
      Aquí el error importa MÁS que en la consulta de arriba, y por eso también
      se lanza: sin estas filas cada compra se compara contra un ticket vacío,
      así que todo lo comprado cuenta como «extra» y el mes entero sale como
      «0 de N compras perfectas» —con su «capricho recurrente» construido, en
      realidad, con la propia lista de la compra—. Un cero aquí no es la
      ausencia de un dato, es un veredicto sobre cómo compra el hogar.
    */
    const { data: boughtRows, error: boughtErr } = await supabase
      .from("receipt_items")
      // 2 FKs a products → hay que nombrar la relación o PostgREST da PGRST201.
      .select(
        "receipt_id, product_id, description, product:products!receipt_items_product_id_fkey(name)",
      )
      .eq("household_id", householdId)
      .in("receipt_id", receiptIds)
      .not("product_id", "is", null);
    if (boughtErr) throw boughtErr;

    type BoughtRow = {
      receipt_id: string;
      product_id: string;
      description: string;
      product: { name: string } | null;
    };
    const byReceipt = new Map<string, BoughtRow[]>();
    for (const r of (boughtRows ?? []) as unknown as BoughtRow[]) {
      const arr = byReceipt.get(r.receipt_id);
      if (arr) arr.push(r);
      else byReceipt.set(r.receipt_id, [r]);
    }

    for (const trip of trips) {
      if (!trip.receipt_id) continue;
      const bought = byReceipt.get(trip.receipt_id) ?? [];
      const comparison = compareTripToReceipt(
        trip.product_ids ?? [],
        bought.map((b) => ({
          productId: b.product_id,
          // El nombre del catálogo agrupa mejor entre compras que la descripción
          // del ticket, que varía de una tienda a otra.
          label: b.product?.name ?? b.description,
        })),
      );
      if (comparison.perfect) tripsPerfect += 1;
      for (const extra of comparison.extras) {
        extraCounts.set(extra, (extraCounts.get(extra) ?? 0) + 1);
      }
    }
  }

  // Solo cuenta como "capricho" lo que se repite: una compra puntual fuera de
  // lista es la vida normal, no un patrón sobre el que valga la pena hablar.
  const topExtraEntry = [...extraCounts.entries()]
    .filter(([, times]) => times >= RECURRING_EXTRA_MIN_TIMES)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    tripsMatched: trips.length,
    tripsPerfect,
    topExtra: topExtraEntry
      ? { label: topExtraEntry[0], value: topExtraEntry[1] }
      : null,
  };
}
