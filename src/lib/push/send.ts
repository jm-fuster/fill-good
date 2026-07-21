import "server-only";

import webpush from "web-push";

/**
 * Envío de Web Push (M10c). Toda la función es INERTE hasta que existan las
 * claves VAPID en el entorno:
 *   · NEXT_PUBLIC_VAPID_PUBLIC_KEY (también la usa el cliente al suscribirse)
 *   · VAPID_PRIVATE_KEY (secreto, solo servidor)
 *   · VAPID_SUBJECT (p. ej. "mailto:tu-email")
 * Genera el par con `npx web-push generate-vapid-keys` y guárdalas en env; NO
 * las regeneres luego (invalidaría todas las suscripciones existentes).
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Ruta a abrir al tocar la notificación. */
  url?: string;
  /** Agrupa/colapsa notificaciones del mismo tipo. */
  tag?: string;
};

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

let configured = false;

/** ¿Hay claves VAPID? Si no, el push queda desactivado (no es dependencia dura). */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  configured = true;
  return true;
}

/**
 * Envía una notificación a varios destinos. Devuelve cuántas salieron y los
 * endpoints "muertos" (404/410) para que el llamante los borre. Nunca lanza:
 * el push es una capa encima, jamás debe romper el flujo que lo dispara.
 */
export async function sendPush(
  targets: PushTarget[],
  payload: PushPayload,
): Promise<{ sent: number; gone: string[] }> {
  if (targets.length === 0 || !ensureConfigured()) {
    return { sent: 0, gone: [] };
  }

  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;

  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        body,
      ),
    ),
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sent += 1;
    } else {
      const status = (r.reason as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) gone.push(targets[i].endpoint);
    }
  });

  return { sent, gone };
}
