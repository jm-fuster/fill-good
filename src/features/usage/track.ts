import type { ClientUsageEvent } from "@/lib/usage";

/*
  Los avisos de medición salen por `/api/usage` con `navigator.sendBeacon`, no
  por una Server Action: esas van en cola por cliente y retrasaban las acciones
  de verdad (ver `src/app/api/usage/route.ts`). Sin `await` y sin respuesta que
  mirar a propósito: para quien ha pulsado, medir no existe, así que no hay
  nada que enseñar si falla.
*/
function send(payload: unknown): void {
  try {
    const body = JSON.stringify(payload);
    // Blob con tipo JSON: con un string suelto el beacon va como text/plain.
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(
        "/api/usage",
        new Blob([body], { type: "application/json" }),
      )
    ) {
      return;
    }
    // Sin beacon (o si el navegador lo rechaza por cola llena): fetch con
    // keepalive, que también sobrevive a un cambio de página.
    void fetch("/api/usage", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    // Medir nunca rompe nada.
  }
}

/** La visita del día (la deduplica la clave primaria de `usage_days`). */
export function trackVisitFromClient(): void {
  send({ visit: true });
}

/** Un paso que solo ve el navegador. */
export function trackFromClient(event: ClientUsageEvent): void {
  send({ event });
}
