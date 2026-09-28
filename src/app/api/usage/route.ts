import type { NextRequest } from "next/server";

import { getActiveHouseholdId } from "@/features/household/queries";
import { usageBeaconSchema } from "@/features/usage/schemas";
import { trackUsage, trackVisit, type ClientUsageEvent } from "@/lib/usage";

/*
  Medición de uso desde el navegador: la visita del día y los pasos que solo ve
  el cliente. Llega con `navigator.sendBeacon` (`features/usage/track.ts`).

  Hasta sep-2026 esto eran dos Server Actions, y ese era el problema: Next pone
  en COLA las Server Actions de un mismo cliente, así que el aviso de visita que
  sale al abrir la app retrasaba el primer toque de verdad (un «+» del stepper,
  marcar un plato) hasta que volvía, y medir no puede retrasar nada
  (`lib/usage.ts`). Una petición aparte no entra en esa cola, y un beacon
  además sobrevive a un cambio de página, así que un evento justo antes de
  navegar ya no se pierde.

  La ruta no está en `isPublicRoute`: sin sesión, el proxy la corta antes de
  llegar aquí. Siempre responde 204 y nunca dice por qué no ha anotado algo,
  porque nadie espera la respuesta (un beacon ni siquiera la lee).
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un aviso real ocupa menos de 200 bytes. */
const MAX_BODY_BYTES = 2 * 1024;

const done = () => new Response(null, { status: 204 });

export async function POST(request: NextRequest): Promise<Response> {
  // Solo desde la propia app. La cookie de sesión viaja con el beacon, así que
  // otra web podría anotar visitas en nombre de quien tenga la sesión abierta;
  // el navegador dice de dónde viene la petición y aquí se descarta lo ajeno.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return done();

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return done();
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) return done();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return done();
  }
  const parsed = usageBeaconSchema.safeParse(body);
  if (!parsed.success) return done();

  const householdId = await getActiveHouseholdId().catch(() => null);
  if (!householdId) return done();

  if ("visit" in parsed.data) trackVisit(householdId);
  else trackUsage(householdId, parsed.data.event as ClientUsageEvent);
  return done();
}
