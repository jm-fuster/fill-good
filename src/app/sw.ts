import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";
import { defaultCache } from "@serwist/next/worker";

import { SHARE_CACHE, SHARE_KEY } from "@/lib/share-target";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Scripts de entrada de Clerk enlazados por versión mayor (ver abajo). */
const CLERK_ENTRY_SCRIPT =
  /^\/npm\/@clerk\/(clerk-js|ui)@\d+\/dist\/(clerk|ui)\.browser\.js$/;

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
  runtimeCaching: [
    // Los dos scripts de entrada de Clerk (clerk-js y su UI). Clerk los enlaza
    // por versión MAYOR (`@clerk/clerk-js@6/…`), y esa URL es una redirección
    // con `no-store` a la versión exacta: la `defaultCache` los pasaba por su
    // NetworkFirst de terceros, así que CADA apertura de la app pagaba ese
    // viaje (~75 ms con fibra, más con datos) antes de poder arrancar la
    // sesión en el navegador. Con StaleWhileRevalidate se sirven del
    // dispositivo al instante y la redirección se hace en segundo plano: una
    // versión nueva de Clerk entra en la apertura siguiente, como pasaría con
    // cualquier caché HTTP. Son estáticos públicos (nada personal), y aun así
    // el cierre de sesión borra esta caché como las demás.
    //
    // Es seguro servir una copia vieja porque los dos scripts reescriben su
    // ruta de trozos a SU versión exacta (`…/@clerk/ui@1.40.0/dist/…`): una
    // copia en caché nunca pide trozos de otra versión.
    //
    // Solo esas dos URLs, y solo respuestas CORS 200. Los trozos ya llevan la
    // versión exacta y Clerk los sirve con un año de caché HTTP, así que no
    // ganan nada aquí; y como los pide sin `crossorigin`, llegan OPACOS, y
    // Chrome cuenta cada respuesta opaca con relleno en la cuota: medido, una
    // regla para todo `/npm/@clerk/` subía el almacenamiento a 110 MB.
    {
      matcher: ({ url, sameOrigin }) =>
        !sameOrigin && CLERK_ENTRY_SCRIPT.test(url.pathname),
      handler: new StaleWhileRevalidate({
        cacheName: "clerk-scripts",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 4,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    // El resto de terceros: la misma regla que trae la `defaultCache`
    // (NetworkFirst, 32 entradas, una hora), pero guardando SOLO respuestas
    // 200. La de Serwist guarda también las OPACAS (status 0, las de peticiones
    // sin CORS), y Chrome cuenta cada una con varios MB de relleno en la cuota:
    // los trozos de la UI de Clerk llegan así, y con solo abrir /sign-in
    // quedaban diez y la app pasaba de 100 MB de almacenamiento (medido el
    // 10-oct-2026). No aportaban nada: llevan la versión exacta en la URL y un
    // año de caché HTTP. Las opacas que ya haya en un móvil se van solas, porque
    // la caché y su caducidad de una hora son las mismas.
    //
    // Va delante de `...defaultCache` y en la práctica sustituye a la suya: con
    // una URL de terceros, las reglas por expresión regular de Serwist solo
    // casan si lo hacen desde el principio de la URL, así que delante de la
    // suya solo estaban las de Google Fonts, que la app no usa (next/font sirve
    // las fuentes desde el propio dominio y la CSP no deja cargar otras).
    {
      matcher: ({ sameOrigin }) => !sameOrigin,
      handler: new NetworkFirst({
        cacheName: "cross-origin",
        networkTimeoutSeconds: 10,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 }),
        ],
      }),
    },
    ...defaultCache,
  ],
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
