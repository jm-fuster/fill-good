import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { defaultCache } from "@serwist/next/worker";

import { SHARE_CACHE, SHARE_KEY } from "@/lib/share-target";

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

// --- Web Share Target (M10b) ------------------------------------------------
// El ticket compartido desde la galería se recoge AQUÍ y no en el servidor.
// Llegando al route handler (`/escanear/compartir`) iba el original sin
// comprimir —una foto de móvil pasa con facilidad del límite de 4,5 MB de
// Vercel, y ahí el POST muere antes de llegar a la app— y sin orientación:
// quitar el EXIF (privacidad) se llevaba también el giro, y la IA recibía el
// ticket tumbado. Se guarda en la caché y se redirige a /escanear, donde pasa
// por la misma `compressImage` que una foto normal, que aplica la orientación.
// Sin service worker (primera visita, navegador sin soporte) el POST sigue
// llegando al route handler, que queda de reserva.
// Va ANTES de los listeners de Serwist: el primero que llama a respondWith
// gana.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "POST" ||
    url.origin !== self.location.origin ||
    url.pathname !== "/escanear/compartir"
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const file = form.get("file");
        if (file instanceof File && file.size > 0) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            SHARE_KEY,
            new Response(file, {
              headers: {
                "content-type": file.type || "application/octet-stream",
                "x-filename": encodeURIComponent(file.name || "ticket"),
              },
            }),
          );
          return Response.redirect(
            new URL("/escanear?compartido=1", self.location.origin).href,
            303,
          );
        }
      } catch {
        // Cae abajo: la pantalla de escanear dice que no llegó nada.
      }
      return Response.redirect(
        new URL("/escanear?compartido=vacio", self.location.origin).href,
        303,
      );
    })(),
  );
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
