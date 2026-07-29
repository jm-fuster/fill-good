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
  name: string;
  quantity: number | null;
  unit: UnitType | null;
};

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
  const { data: rows } = await supabase
    .from("shopping_list_items")
    .select("id, name, quantity, unit, product_id")
    .eq("list_id", listId)
    .eq("is_checked", false);

  const candidate = (rows ?? []).find(
    (r) =>
      (match.productId !== null && r.product_id === match.productId) ||
      normalizeName(r.name) === match.normalized,
  );
  if (!candidate) return null;

  const existingQty =
    candidate.quantity === null ? null : Number(candidate.quantity);
  const existingUnit = candidate.unit as UnitType | null;

  // Sin cantidad nueva: dejar la existente tal cual, solo informar de la fusión.
  if (incoming.quantity == null) {
    return {
      itemId: candidate.id,
      name: candidate.name,
      quantity: existingQty,
      unit: existingUnit,
    };
  }

  // Unidades incompatibles (ambas definidas y distintas) → no fusionar.
  const unitsCompatible =
    existingUnit === incoming.unit ||
    existingUnit === null ||
    incoming.unit === null;
  if (!unitsCompatible) return null;

  const summedQty = (existingQty ?? 0) + incoming.quantity;
  const resultUnit = existingUnit ?? incoming.unit;
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ quantity: summedQty, unit: resultUnit })
    .eq("id", candidate.id);
  if (error) return null; // Fallback silencioso: insertar fila nueva.

  return {
    itemId: candidate.id,
    name: candidate.name,
    quantity: summedQty,
    unit: resultUnit,
  };
}
