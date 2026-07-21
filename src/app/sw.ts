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
