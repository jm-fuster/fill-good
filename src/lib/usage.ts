import "server-only";

import { after } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
  Medición de uso: SOLO lo que la base no guarda ya.

  Tickets, menús, platos cocinados, compras cerradas, miembros y suscripciones
  push ya tienen tabla con fecha, y el informe (`npm run informe:uso`) los lee
  de su sitio. Lo que se anota aquí son los tres huecos que dejó la foto de uso
  del 22-sep-2026: quién vuelve (la base solo ve escrituras, así que quien entra
  a mirar la lista no deja rastro), si el repaso de despensa se usa y si la
  invitación falla al compartir o al aceptar. El porqué de cada decisión, en la
  migración `20260922200832_eventos_de_uso.sql`.

  La regla que gobierna este módulo es que MEDIR NUNCA ROMPE NI RETRASA una
  acción del usuario:
   - La escritura va en `after()`, o sea cuando la respuesta ya ha salido: el
     toque no espera a que se apunte nada.
   - Cualquier fallo se queda en un `console.warn`. Una migración sin aplicar,
     un corte de red o una persona que se ha opuesto a ser medida son, para
     quien pulsa, exactamente lo mismo: nada.
  Por eso estas funciones devuelven `void` y no una promesa: no hay nada que
  esperar ni que comprobar desde la acción.
*/

/**
 * Los pasos que se anotan. La lista cerrada vive TAMBIÉN en el CHECK de
 * `usage_events`: un nombre nuevo va en los dos sitios (el de la base con una
 * migración) y, si cambia lo que se mide, en /privacidad §2.
 *
 * Las props son recuentos y respuestas cortas, nunca contenido: ni nombres de
 * producto ni texto que haya escrito nadie.
 */
export type UsageEvent =
  | { name: "pantry_review_opened"; props: { offered: number } }
  | { name: "pantry_review_answered"; props: { answer: "have" | "low" | "out" } }
  | { name: "pantry_review_to_list"; props: { count: number } }
  | { name: "pantry_review_postponed"; props: { until: "tomorrow" | "week" } }
  | { name: "pantry_review_disabled" }
  | { name: "pantry_review_enabled" }
  | { name: "invite_shared"; props: { via: "share" | "copy" } };

/**
 * Los que solo ve el navegador —abrir el repaso, aplazarlo (es una cookie),
 * lo que se apunta desde él y compartir el enlace de invitación— y llegan por
 * `recordUsageAction`. Se importa con `import type` desde el cliente: se borra
 * al compilar, así que no arrastra este módulo `server-only`.
 */
export type ClientUsageEvent = Extract<
  UsageEvent,
  {
    name:
      | "pantry_review_opened"
      | "pantry_review_to_list"
      | "pantry_review_postponed"
      | "invite_shared";
  }
>;

function schedule(
  label: string,
  write: () => Promise<{ error: { message: string } | null }>,
): void {
  try {
    after(async () => {
      try {
        const { error } = await write();
        if (error) console.warn(`${label}:`, error.message);
      } catch (err) {
        console.warn(`${label}:`, err);
      }
    });
  } catch (err) {
    // `after` fuera de una petición. No debería pasar —solo se llama desde
    // Server Actions—, pero si pasa, medir se calla antes que romper nada.
    console.warn(`${label}:`, err);
  }
}

/** Anota un paso de una función. Solo desde Server Actions. */
export function trackUsage(householdId: string, event: UsageEvent): void {
  schedule(`record_usage_event (${event.name})`, async () =>
    createServerSupabaseClient().rpc("record_usage_event", {
      p_household_id: householdId,
      p_name: event.name,
      p_props: "props" in event ? event.props : {},
    }),
  );
}

/**
 * Anota que esta persona ha abierto hoy la app en este hogar. Se puede llamar
 * en cada arranque: la clave primaria de `usage_days` deja una fila por día.
 */
export function trackVisit(householdId: string): void {
  schedule("record_usage_day", async () =>
    createServerSupabaseClient().rpc("record_usage_day", {
      p_household_id: householdId,
    }),
  );
}
