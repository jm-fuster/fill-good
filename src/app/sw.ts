import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { defaultCache } from "@serwist/next/worker";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // navigationPreload DEBE quedar desactivado: con Clerk, en frío el proxy
  // responde a las navegaciones/RSC de rutas protegidas con una redirección
  // (handshake de sesión). La precarga la captura como respuesta `opaqueredirect`
  // y NetworkFirst la devuelve al respondWith de una navegación en modo
  // `redirect: "follow"` → el navegador lanza "network error" y la página no
  // carga (salta la barrera "No se pudo cargar"). Sin precarga, el fetch de
  // NetworkFirst sigue la redirección de Clerk con normalidad.
  navigationPreload: false,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// --- Web Push (M10c) -------------------------------------------------------
// Muestra la notificación recibida. El payload es el JSON que envía el servidor
// (lib/push/send.ts): { title, body, url?, tag? }. Si no hay datos, un aviso
// genérico para no fallar en silencio.
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Payload no-JSON: se ignora y se usa el genérico.
  }
  const title = data.title ?? "Fill Good";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

// Solo navegamos a rutas del propio origen: aunque el payload lo firma el
// servidor (VAPID), restringir a same-origin evita abrir URLs externas si el
// dato llegara manipulado (defensa en profundidad).
function safeInAppUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  try {
    const u = new URL(raw, self.location.origin);
    return u.origin === self.location.origin ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}

// Al tocar la notificación: enfoca una pestaña abierta de la app o abre una.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeInAppUrl((event.notification.data as { url?: unknown } | null)?.url);
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = clientsArr[0] as WindowClient | undefined;
      if (client) {
        await client.focus();
        await client.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
