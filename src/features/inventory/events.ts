import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  InventoryEventKind,
  UnitType,
} from "@/lib/supabase/types";

type Supabase = SupabaseClient<Database>;

/**
 * Ventana de agrupación (folding) de eventos del stepper: dentro de este lapso,
 * varios ajustes del mismo (hogar, producto, tipo, autor) se ACUMULAN en un
 * único evento en vez de generar una fila por pulsación. Evita que bajar 3 ud de
 * una en una deje 3 eventos de 1 ud.
 */
export const EVENT_FOLD_WINDOW_MS = 15 * 60 * 1000;

export type StockEventInput = {
  householdId: string;
  productId: string;
  /** Magnitud del movimiento (siempre positiva). */
  quantity: number;
  unit: UnitType;
  kind: InventoryEventKind;
  userId: string | null;
  /** Si true, agrupa con el último evento compatible reciente (stepper). */
  fold?: boolean;
};

/**
 * Registra un movimiento de stock (F5). **Best-effort**: nunca lanza, así que un
 * fallo al anotar el evento no rompe la operación principal (mismo criterio que
 * el insert de M8). Con `fold`, si el último evento del mismo (hogar, producto,
 * tipo, autor) en los últimos {@link EVENT_FOLD_WINDOW_MS} ms tiene la misma
 * unidad, suma sobre él (requiere la política de UPDATE de F5) en vez de insertar
 * otra fila.
 *
 * Devuelve el id de la fila afectada —la que se creó o aquella sobre la que se
 * agrupó— o null si no se pudo anotar. Casi todos los llamantes lo ignoran; lo
 * necesita el deshacer de la skill de Alexa, que para revertir una orden tiene
 * que descontar de ESE evento exactamente lo que la orden le sumó (y no borrarlo
 * entero, que con el agrupado se llevaría por delante movimientos anteriores).
 */
export async function recordStockEvent(
  supabase: Supabase,
  input: StockEventInput,
): Promise<string | null> {
  try {
    const { householdId, productId, quantity, unit, kind, userId, fold } =
      input;
    if (!(quantity > 0)) return null;

    if (fold) {
      const since = new Date(Date.now() - EVENT_FOLD_WINDOW_MS).toISOString();
      let q = supabase
        .from("inventory_events")
        .select("id, quantity, unit, created_at")
        .eq("household_id", householdId)
        .eq("product_id", productId)
        .eq("kind", kind)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      q = userId ? q.eq("created_by", userId) : q.is("created_by", null);
      const { data: last } = await q.maybeSingle();

      if (last && last.unit === unit) {
        await supabase
          .from("inventory_events")
          .update({
            quantity: Number(last.quantity) + quantity,
            created_at: new Date().toISOString(),
          })
          .eq("id", last.id);
        return last.id;
      }
    }

    const { data: created } = await supabase
      .from("inventory_events")
      .insert({
        household_id: householdId,
        product_id: productId,
        quantity,
        unit,
        kind,
        created_by: userId,
      })
      .select("id")
      .single();
    return created?.id ?? null;
  } catch {
    // Best-effort: el historial no debe tumbar la operación principal.
    return null;
  }
}
