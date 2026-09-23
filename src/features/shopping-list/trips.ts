import "server-only";

import { addHours, formatISO, subHours } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

import { shiftDays, todayLocalISO } from "@/lib/dates";
import type { Database } from "@/lib/supabase/types";

type Supabase = SupabaseClient<Database>;

/**
 * Ventana de emparejamiento entre una compra cerrada desde la lista y el ticket
 * de esa misma compra. Amplia a propósito: mucha gente marca la lista en la
 * tienda y escanea el ticket esa noche o al día siguiente.
 */
export const TRIP_MATCH_WINDOW_HOURS = 48;

/** Compra cerrada desde la lista, aún sin ticket, candidata a emparejarse. */
export type PendingTrip = { id: string; productIds: string[] };

/**
 * Busca (SIN enlazar) la compra cerrada desde la lista que le corresponde a un
 * ticket: la del hogar MÁS CERCANA en el tiempo dentro de la ventana que aún no
 * tenga ticket. La condición "aún no tenga ticket" es lo que impide que dos
 * tickets del mismo día reclamen la misma compra.
 *
 * Se usa en dos momentos distintos y por eso no tiene efectos: al ABRIR la
 * revisión, para saber qué productos ya entraron al inventario en el checkout y
 * no volver a sumarlos; y al CONFIRMAR, desde `linkReceiptToTrip`.
 *
 * Devuelve `null` cuando no hay compra que emparejar, que es un caso normal y
 * frecuente (quien escanea tickets sin usar la lista), no un error. Best-effort
 * en el fallo: si algo revienta, devuelve `null`.
 */
export async function findPendingTrip(
  supabase: Supabase,
  {
    householdId,
    purchasedAt,
    productIds,
  }: {
    householdId: string;
    purchasedAt: string | null;
    /**
     * Productos del ticket, si ya se conocen (al confirmar). Con ellos solo
     * vale una compra que comparta alguno: si no, el ticket de la farmacia
     * del mismo día se quedaba la compra del súper, y cuando llegaba el ticket
     * bueno ya no había compra con la que emparejarlo.
     */
    productIds?: readonly string[];
  },
): Promise<PendingTrip | null> {
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
    const wanted = productIds ? new Set(productIds) : null;
    const eligible = wanted
      ? (candidates ?? []).filter((t) =>
          (t.product_ids ?? []).some((id) => wanted.has(id)),
        )
      : (candidates ?? []);
    if (eligible.length === 0) return null;

    const target = eligible.reduce((best, t) => {
      const d = Math.abs(new Date(t.closed_at).getTime() - anchor.getTime());
      const bestD = Math.abs(new Date(best.closed_at).getTime() - anchor.getTime());
      return d < bestD ? t : best;
    });

    return { id: target.id, productIds: target.product_ids ?? [] };
  } catch (err) {
    console.error("findPendingTrip falló (best-effort):", err);
    return null;
  }
}

/**
 * Enlaza un ticket recién confirmado con la compra cerrada desde la lista que le
 * corresponda (G2) y devuelve los productos que iban en aquella lista, para
 * poder calcular la "compra perfecta" en el acto. Sin esto, la lista y el ticket
 * quedan como dos hechos inconexos.
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
    productIds,
  }: {
    receiptId: string;
    householdId: string;
    purchasedAt: string | null;
    productIds: readonly string[];
  },
): Promise<string[] | null> {
  const trip = await findPendingTrip(supabase, {
    householdId,
    purchasedAt,
    productIds,
  });
  if (!trip) return null;
  try {
    const { error: updateErr } = await supabase
      .from("shopping_trips")
      .update({ receipt_id: receiptId })
      .eq("id", trip.id)
      // Relectura de la condición: si otro ticket confirmado en paralelo ya la
      // reclamó entre el select y el update, este update no toca nada.
      .is("receipt_id", null);
    if (updateErr) throw updateErr;
    return trip.productIds;
  } catch (err) {
    console.error("linkReceiptToTrip falló (best-effort):", err);
    return null;
  }
}

/**
 * La guarda inversa, para «Finalizar compra»: un ticket ya confirmado de estos
 * días que ninguna compra ha reclamado. La deduplicación de stock solo iba en
 * un sentido —el ticket se salta lo que ya entró por la lista—, así que
 * escanear el ticket en la caja y finalizar la lista al llegar a casa sumaba
 * dos veces todo lo que coincidía.
 *
 * Devuelve el más reciente con sus productos, o `null`. Best-effort: ante un
 * fallo se comporta como antes (se suma), porque perder stock en silencio es
 * peor que duplicarlo a la vista.
 */
export async function findUnclaimedRecentReceipt(
  supabase: Supabase,
  householdId: string,
): Promise<{ receiptId: string; productIds: Set<string> } | null> {
  try {
    const today = todayLocalISO();
    const { data: receipts, error } = await supabase
      .from("receipts")
      .select("id, purchased_at, created_at")
      .eq("household_id", householdId)
      .eq("status", "confirmed")
      .gte("purchased_at", shiftDays(today, -Math.ceil(TRIP_MATCH_WINDOW_HOURS / 24)))
      .lte("purchased_at", today)
      .order("purchased_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!receipts || receipts.length === 0) return null;

    const { data: linked, error: linkErr } = await supabase
      .from("shopping_trips")
      .select("receipt_id")
      .eq("household_id", householdId)
      .in(
        "receipt_id",
        receipts.map((r) => r.id),
      );
    if (linkErr) throw linkErr;
    const taken = new Set((linked ?? []).map((t) => t.receipt_id));
    const receipt = receipts.find((r) => !taken.has(r.id));
    if (!receipt) return null;

    const { data: lines, error: linesErr } = await supabase
      .from("receipt_items")
      .select("product_id")
      .eq("receipt_id", receipt.id)
      .neq("match_status", "skipped")
      .not("product_id", "is", null);
    if (linesErr) throw linesErr;
    const productIds = new Set(
      (lines ?? []).flatMap((l) => (l.product_id ? [l.product_id] : [])),
    );
    return productIds.size > 0 ? { receiptId: receipt.id, productIds } : null;
  } catch (err) {
    console.error("findUnclaimedRecentReceipt falló (best-effort):", err);
    return null;
  }
}
