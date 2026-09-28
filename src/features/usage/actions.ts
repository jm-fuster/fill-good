"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
  La visita del día y los pasos que solo ve el navegador ya no pasan por aquí:
  van por `/api/usage` con `sendBeacon` (`features/usage/track.ts`), porque
  como Server Actions se ponían en la cola del cliente y retrasaban las acciones
  de verdad.
*/

/**
 * Oposición a la medición (art. 21 RGPD), desde Ajustes o desde el aviso de
 * cambios. A diferencia de los avisos de medición, esta SÍ devuelve el resultado: es un
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
