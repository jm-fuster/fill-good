"use server";

import { z } from "zod";

import { getActiveHouseholdId } from "@/features/household/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { trackUsage, trackVisit, type ClientUsageEvent } from "@/lib/usage";

/**
 * Visita del día: la llama el shell al montarse (`VisitPing`). Es la señal que
 * faltaba del todo, porque la base solo ve escrituras y quien entra a mirar la
 * lista sin tocar nada no dejaba rastro.
 *
 * Se llama en cada arranque de la app sin llevar la cuenta en el dispositivo:
 * la deduplicación la hace la clave primaria de `usage_days`, y guardar «ya
 * avisé hoy» en el navegador sería almacenamiento local para medir, que es
 * justo lo que pediría consentimiento.
 */
export async function recordVisitAction(): Promise<void> {
  const householdId = await getActiveHouseholdId().catch(() => null);
  if (householdId) trackVisit(householdId);
}

const count = z.number().int().min(0).max(100);

/*
  Se vuelve a validar aquí aunque el tipo ya lo diga: esto es un endpoint, y lo
  que llegue por él no lo ha escrito necesariamente la app. La lista coincide a
  propósito con `ClientUsageEvent`; los eventos que ocurren en el servidor
  (responder al repaso, activarlo o desactivarlo) se anotan desde su propia
  acción y no pasan por aquí.
*/
const clientEvent = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("pantry_review_opened"),
    props: z.object({ offered: count }),
  }),
  z.object({
    name: z.literal("pantry_review_to_list"),
    props: z.object({ count }),
  }),
  z.object({
    name: z.literal("pantry_review_postponed"),
    props: z.object({ until: z.enum(["tomorrow", "week"]) }),
  }),
  z.object({
    name: z.literal("invite_shared"),
    props: z.object({ via: z.enum(["share", "copy"]) }),
  }),
]);

/**
 * Un paso que solo ve el navegador. No devuelve nada que mirar: quien la llama
 * no espera la respuesta (ver `trackFromClient`), y un evento inválido o sin
 * hogar activo simplemente no se anota.
 */
export async function recordUsageAction(event: ClientUsageEvent): Promise<void> {
  const parsed = clientEvent.safeParse(event);
  if (!parsed.success) return;
  const householdId = await getActiveHouseholdId().catch(() => null);
  if (householdId) trackUsage(householdId, parsed.data);
}

/**
 * Oposición a la medición (art. 21 RGPD), desde Ajustes o desde el aviso de
 * cambios. A diferencia de las de arriba, esta SÍ devuelve el resultado: es un
 * derecho que la persona ejerce, y tiene que saber si ha quedado cumplido.
 */
export async function setUsageOptOutAction(
  optOut: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  if (typeof optOut !== "boolean") return { error: "Petición no válida." };
  const { error } = await createServerSupabaseClient().rpc(
    "set_usage_opt_out",
    { p_opt_out: optOut },
  );
  if (error) {
    console.error("set_usage_opt_out:", error.message);
    return { error: "No se pudo guardar tu preferencia. Inténtalo de nuevo." };
  }
  return { ok: true };
}
