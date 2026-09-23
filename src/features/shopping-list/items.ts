import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeName } from "@/lib/normalize";
import type { Database, UnitType } from "@/lib/supabase/types";

/**
 * Escrituras de bajo nivel sobre los artículos de la lista, compartidas por las
 * Server Actions de la lista y por el webhook de Alexa.
 *
 * Viven aquí y no en `actions.ts` porque ese fichero es `"use server"`: todo lo
 * que exporta se convierte en una Server Action invocable desde el cliente, y
 * estas funciones reciben el cliente de Supabase como parámetro (algo que no es
 * serializable). Al recibirlo, valen tanto con el cliente con JWT de Clerk como
 * con el service-role del webhook.
 */

type Supabase = SupabaseClient<Database>;

/** Siguiente `position` al final de la lista (max + 1); 1 si está vacía. */
export async function nextListPosition(
  supabase: Supabase,
  listId: string,
): Promise<number> {
  const { data: last } = await supabase
    .from("shopping_list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last?.position ?? 0) + 1;
}

export type MergeResult = {
  itemId: string;
  /**
   * Nombre VIVO del ítem con el que se fusionó (el del producto vinculado, con
   * el rótulo de la fila como fallback; ver `ListItem.name`). Importa porque
   * este nombre se le dice al usuario: en un toast en la app y en voz alta por
   * Alexa. Repetirle el nombre viejo de un producto que él mismo renombró es
   * justo lo que hace dudar de si la orden ha ido al sitio correcto.
   */
  name: string;
  quantity: number | null;
  unit: UnitType | null;
};

type CandidateRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  product_id: string | null;
  product: { name: string } | null;
};

/** Qué hacer con un alta que ya tiene un ítem equivalente en la lista. */
type MergePlan =
  /** El alta no trae cantidad: la fila se queda como está, solo se informa. */
  | { kind: "keep"; row: CandidateRow }
  /** Hay que sumar: la fila pasa a esta cantidad y unidad. */
  | { kind: "sum"; row: CandidateRow; quantity: number; unit: UnitType | null };

const SELECT_CANDIDATES = "id, name, quantity, unit, product_id, product:products(name)";

/**
 * Las REGLAS de la fusión L3, sobre candidatos ya leídos y sin tocar la base.
 * Están aquí sueltas para que el alta de uno en uno y la de varios de golpe
 * decidan igual: si divergieran, «no duplicar» significaría una cosa al teclear
 * un producto y otra al marcarlo en el selector.
 */
function planMerge(
  rows: CandidateRow[],
  match: { productId: string | null; normalized: string },
  incoming: { quantity: number | null; unit: UnitType | null },
): MergePlan | null {
  // Casar por `product_id` es lo que sigue funcionando tras un renombrado: el
  // rótulo de la fila puede haber quedado desfasado, así que la comparación de
  // nombres solo salva al texto libre, que no tiene producto al que agarrarse.
  const candidate = rows.find(
    (r) =>
      (match.productId !== null && r.product_id === match.productId) ||
      normalizeName(r.name) === match.normalized,
  );
  if (!candidate) return null;

  // Sin cantidad nueva: dejar la existente tal cual, solo informar de la fusión.
  if (incoming.quantity == null) return { kind: "keep", row: candidate };

  const existingQty =
    candidate.quantity === null ? null : Number(candidate.quantity);
  const existingUnit = candidate.unit;

  // Unidades incompatibles (ambas definidas y distintas) → no fusionar.
  const unitsCompatible =
    existingUnit === incoming.unit ||
    existingUnit === null ||
    incoming.unit === null;
  if (!unitsCompatible) return null;

  return {
    kind: "sum",
    row: candidate,
    quantity: (existingQty ?? 0) + incoming.quantity,
    unit: existingUnit ?? incoming.unit,
  };
}

/**
 * L3 — No duplicar. Busca un ítem SIN MARCAR de la lista que sea el mismo
 * producto (por `product_id` o por nombre normalizado) y fusiona el alta en él:
 * suma la cantidad si ambas existen y la unidad es compatible, o conserva la
 * existente si el alta nueva no trae cantidad. Devuelve null cuando no hay
 * fusión posible (unidades distintas o sin candidato) → insertar fila nueva.
 * Los ítems marcados (en el carro) nunca cuentan como duplicado.
 */
export async function mergeIntoExisting(
  supabase: Supabase,
  listId: string,
  match: { productId: string | null; normalized: string },
  incoming: { quantity: number | null; unit: UnitType | null },
): Promise<MergeResult | null> {
  const { data } = await supabase
    .from("shopping_list_items")
    .select(SELECT_CANDIDATES)
    .eq("list_id", listId)
    .eq("is_checked", false);

  const plan = planMerge(
    (data ?? []) as unknown as CandidateRow[],
    match,
    incoming,
  );
  if (!plan) return null;

  const displayName = plan.row.product?.name ?? plan.row.name;
  if (plan.kind === "keep") {
    return {
      itemId: plan.row.id,
      name: displayName,
      quantity: plan.row.quantity === null ? null : Number(plan.row.quantity),
      unit: plan.row.unit,
    };
  }

  const { error } = await supabase
    .from("shopping_list_items")
    .update({ quantity: plan.quantity, unit: plan.unit })
    .eq("id", plan.row.id);
  if (error) return null; // Fallback silencioso: insertar fila nueva.

  return {
    itemId: plan.row.id,
    name: displayName,
    quantity: plan.quantity,
    unit: plan.unit,
  };
}

/** Un alta del selector múltiple, ya resuelta contra el catálogo del hogar. */
export type BulkAddItem = {
  /** Producto del catálogo, o null si es texto libre sin producto conocido. */
  productId: string | null;
  /** Rótulo con el que se apunta la fila (el del producto cuando lo hay). */
  name: string;
  /** Nombre normalizado, para casar con lo que ya está en la lista. */
  normalized: string;
  quantity: number | null;
  unit: UnitType | null;
  /**
   * Apuntar solo si no está ya: quien lo pide dice «hace falta», no «cuánto»,
   * así que sobre una fila existente no suma nada (el repaso de despensa
   * convertía «Leche 6» + «queda poco» en 7).
   */
  ifMissing?: boolean;
};

/** Cuántas filas nuevas y cuántas fusiones ha supuesto un alta múltiple. */
export type BulkAddResult = { added: number; merged: number };

/**
 * Alta de varios artículos de una vez (el selector de la lista, L17), con las
 * mismas reglas de no-duplicar que el alta suelta pero en una sola tanda: se
 * leen los candidatos UNA vez, se decide todo en memoria y se escribe con una
 * actualización por fila fusionada más un único INSERT. Con veinte productos
 * marcados, llamar veinte veces al alta suelta serían más de cuarenta viajes a
 * Supabase (y las Server Actions se despachan de una en una desde el cliente).
 *
 * Devuelve null si falla el INSERT (nada que reintentar por partes: las sumas ya
 * aplicadas son visibles en la lista y el usuario ve lo que hay).
 */
export async function addManyToList(
  supabase: Supabase,
  target: { listId: string; householdId: string; userId: string | null },
  entries: BulkAddItem[],
): Promise<BulkAddResult | null> {
  const { data } = await supabase
    .from("shopping_list_items")
    .select(SELECT_CANDIDATES)
    .eq("household_id", target.householdId)
    .eq("list_id", target.listId)
    .eq("is_checked", false);
  const rows = (data ?? []) as unknown as CandidateRow[];

  // Sumas pendientes por fila. Agrupadas por fila y no por alta porque dos altas
  // pueden caer en la misma (un producto y un texto libre que se llaman igual):
  // así la fila se escribe una vez, con el total.
  const sums = new Map<
    string,
    { quantity: number; unit: UnitType | null; entries: BulkAddItem[] }
  >();
  const toInsert: BulkAddItem[] = [];
  let merged = 0;

  for (const entry of entries) {
    const plan = planMerge(
      rows,
      { productId: entry.productId, normalized: entry.normalized },
      { quantity: entry.quantity, unit: entry.unit },
    );
    if (!plan) {
      toInsert.push(entry);
      continue;
    }
    if (plan.kind === "keep" || entry.ifMissing) {
      merged += 1;
      continue;
    }
    // Actualiza el candidato EN MEMORIA para que el alta siguiente que caiga en
    // esta fila sume sobre el total nuevo y no sobre el que había al leer.
    plan.row.quantity = plan.quantity;
    plan.row.unit = plan.unit;
    const pending = sums.get(plan.row.id);
    if (pending) {
      pending.quantity = plan.quantity;
      pending.unit = plan.unit;
      pending.entries.push(entry);
    } else {
      sums.set(plan.row.id, {
        quantity: plan.quantity,
        unit: plan.unit,
        entries: [entry],
      });
    }
  }

  const updates = await Promise.all(
    [...sums].map(async ([id, sum]) => {
      const { error } = await supabase
        .from("shopping_list_items")
        .update({ quantity: sum.quantity, unit: sum.unit })
        .eq("id", id);
      return { sum, ok: !error };
    }),
  );
  for (const update of updates) {
    // Mismo fallback que el alta suelta: si la suma no entra, la fila nueva sí.
    if (update.ok) merged += update.sum.entries.length;
    else toInsert.push(...update.sum.entries);
  }

  if (toInsert.length === 0) return { added: 0, merged };

  let position = await nextListPosition(supabase, target.listId);
  const { error } = await supabase.from("shopping_list_items").insert(
    toInsert.map((entry) => ({
      list_id: target.listId,
      household_id: target.householdId,
      product_id: entry.productId,
      name: entry.name,
      quantity: entry.quantity,
      unit: entry.unit,
      added_by: target.userId,
      position: position++,
    })),
  );
  if (error) return null;

  return { added: toInsert.length, merged };
}
