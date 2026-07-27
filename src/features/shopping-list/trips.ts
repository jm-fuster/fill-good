import "server-only";

import { addHours, formatISO, subHours } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type Supabase = SupabaseClient<Database>;

/**
 * Ventana de emparejamiento entre una compra cerrada desde la lista y el ticket
 * de esa misma compra. Amplia a propósito: mucha gente marca la lista en la
 * tienda y escanea el ticket esa noche o al día siguiente.
 */
export const TRIP_MATCH_WINDOW_HOURS = 48;

/**
 * Enlaza un ticket recién confirmado con la compra cerrada desde la lista que le
 * corresponda (G2) y devuelve los productos que iban en aquella lista, para
 * poder calcular la "compra perfecta" en el acto. Sin esto, la lista y el ticket
 * quedan como dos hechos inconexos.
 *
 * Elige el `shopping_trip` del hogar MÁS CERCANO en el tiempo dentro de la
 * ventana que aún no tenga ticket. La condición "aún no tenga ticket" es lo que
 * impide que dos tickets del mismo día reclamen la misma compra.
 *
 * Devuelve `null` cuando no hay compra que emparejar, que es un caso normal y
 * frecuente (quien escanea tickets sin usar la lista), no un error.
 *
 * Best-effort en el fallo: si algo revienta, devuelve `null` y la tarjeta
 * simplemente no aparece. Confirmar el ticket nunca puede depender de esto.
 */
export async function linkReceiptToTrip(
  supabase: Supabase,
  {
    receiptId,
    householdId,
    purchasedAt,
  }: { receiptId: string; householdId: string; purchasedAt: string | null },
): Promise<string[] | null> {
  try {
    // `purchased_at` es una fecha sin hora; se ancla al mediodía para que la
    // ventana cubra por igual la noche anterior y la siguiente.
    const anchor = purchasedAt ? new Date(`${purchasedAt}T12:00:00`) : new Date();
    if (Number.isNaN(anchor.getTime())) return null;

    const { data: candidates, error } = await supabase
      .from("shopping_trips")
      .select("id, closed_at, product_ids")
      .eq("household_id", householdId)
      .is("receipt_id", null)
      .gte("closed_at", formatISO(subHours(anchor, TRIP_MATCH_WINDOW_HOURS)))
      .lte("closed_at", formatISO(addHours(anchor, TRIP_MATCH_WINDOW_HOURS)));
    if (error) throw error;
    if (!candidates || candidates.length === 0) return null;

    const target = candidates.reduce((best, t) => {
      const d = Math.abs(new Date(t.closed_at).getTime() - anchor.getTime());
      const bestD = Math.abs(new Date(best.closed_at).getTime() - anchor.getTime());
      return d < bestD ? t : best;
    });

    const { error: updateErr } = await supabase
      .from("shopping_trips")
      .update({ receipt_id: receiptId })
      .eq("id", target.id)
      // Relectura de la condición: si otro ticket confirmado en paralelo ya la
      // reclamó entre el select y el update, este update no toca nada.
      .is("receipt_id", null);
    if (updateErr) throw updateErr;

    return target.product_ids ?? [];
  } catch (err) {
    console.error("linkReceiptToTrip falló (best-effort):", err);
    return null;
  }
}
