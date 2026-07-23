import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPriceAlerts } from "@/features/prices/alerts";
import { isPushConfigured, sendPush, type PushTarget } from "@/lib/push/send";

/**
 * Aviso push de subidas de precio al confirmar un ticket (M10c + M3). Inerte
 * sin claves VAPID; nunca lanza (el push es una capa encima del flujo, no una
 * dependencia). Solo notifica a suscriptores con la preferencia de precio
 * activa, excluyendo a quien acaba de confirmar (ya lo ve en la app).
 */
export async function notifyPriceRises(
  householdId: string,
  productIds: string[],
  excludeUserId: string | null,
): Promise<void> {
  try {
    if (!isPushConfigured() || productIds.length === 0) return;

    const affected = new Set(productIds);
    const alerts = (await getPriceAlerts()).filter(
      (a) => a.kind === "up" && affected.has(a.productId),
    );
    if (alerts.length === 0) return;

    const supabase = createServerSupabaseClient();
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .eq("household_id", householdId)
      .eq("pref_price", true);

    const targets: PushTarget[] = (subs ?? [])
      .filter((s) => s.user_id !== excludeUserId)
      .map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }));
    if (targets.length === 0) return;

    const body =
      alerts.length === 1
        ? `${alerts[0].productName} ha subido un ${alerts[0].pct}% desde tu última compra`
        : `${alerts.length} productos de este ticket han subido de precio`;

    const { gone } = await sendPush(targets, {
      title: "Aviso de precio",
      body,
      url: "/precios",
      tag: "price-alert",
    });

    // Higiene: los endpoints 404/410 están muertos (el navegador revocó la
    // suscripción). Se borran para no reintentar contra ellos en cada envío. El
    // DELETE lo autoriza la política `push_delete_household` (miembros del hogar),
    // porque quien confirma el ticket rara vez es el dueño del endpoint muerto.
    if (gone.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", gone);
    }
  } catch (err) {
    console.error("notifyPriceRises falló (ignorado):", err);
  }
}
