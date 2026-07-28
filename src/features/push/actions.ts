"use server";

import { auth } from "@clerk/nextjs/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";

export type PushPrefs = {
  expiry: boolean;
  price: boolean;
  restock: boolean;
  wins: boolean;
};

export type SavePushInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  prefs: PushPrefs;
};

type Result = { ok?: boolean; error?: string };

// Hosts de los servicios push legítimos (Chrome/FCM, Firefox, Edge/WNS, Safari).
// El endpoint lo elige el navegador, pero llega como dato de cliente: validarlo
// evita que se almacene una URL arbitraria a la que el servidor haría POST luego
// (web-push desde el cron / notify.ts) — una primitiva SSRF de bajo impacto.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Guarda (o actualiza) la suscripción push de este dispositivo con sus
 * preferencias por tipo. Upsert por endpoint: re-suscribirse no duplica.
 */
export async function savePushSubscriptionAction(
  input: SavePushInput,
): Promise<Result> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  if (!userId) return { error: "No autenticado." };
  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { error: "Suscripción no válida." };
  }
  if (!isAllowedPushEndpoint(input.endpoint)) {
    return { error: "Endpoint de notificaciones no válido." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      household_id: household.id,
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      pref_expiry: input.prefs.expiry,
      pref_price: input.prefs.price,
      pref_restock: input.prefs.restock,
      pref_wins: input.prefs.wins,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: "No se pudo guardar la suscripción." };
  return { ok: true };
}

/** Actualiza las preferencias de una suscripción ya existente. */
export async function updatePushPrefsAction(
  endpoint: string,
  prefs: PushPrefs,
): Promise<Result> {
  const { userId } = await auth();
  if (!userId) return { error: "No autenticado." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      pref_expiry: prefs.expiry,
      pref_price: prefs.price,
      pref_restock: prefs.restock,
      pref_wins: prefs.wins,
    })
    .eq("endpoint", endpoint)
    .eq("user_id", userId);
  if (error) return { error: "No se pudieron guardar las preferencias." };
  return { ok: true };
}

/** Elimina la suscripción de este dispositivo (revocar). */
export async function deletePushSubscriptionAction(
  endpoint: string,
): Promise<Result> {
  const { userId } = await auth();
  if (!userId) return { error: "No autenticado." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", userId);
  if (error) return { error: "No se pudo revocar la suscripción." };
  return { ok: true };
}

/** Preferencias guardadas para un endpoint (o null si no está suscrito). */
export async function getMyPushPrefsAction(
  endpoint: string,
): Promise<PushPrefs | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("pref_expiry, pref_price, pref_restock, pref_wins")
    .eq("endpoint", endpoint)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    expiry: data.pref_expiry,
    price: data.pref_price,
    restock: data.pref_restock,
    wins: data.pref_wins,
  };
}
