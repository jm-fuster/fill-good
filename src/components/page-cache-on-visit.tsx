"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSerwist } from "@serwist/next/react";

/** Rutas ya pedidas al service worker en esta pestaña. */
const cached = new Set<string>();

/**
 * Deja cada página VISITADA en la caché del service worker, para que `/offline`
 * pueda cumplir lo que promete («las páginas que ya visitaste siguen
 * disponibles»). No pinta nada; vive dentro de `SerwistProvider`.
 *
 * Sustituye al `cacheOnNavigation` de Serwist, que hacía lo mismo por la peor
 * vía: parchea `history.pushState`/`replaceState` y, en CADA llamada, le pide al
 * service worker que se descargue esa URL. Next llama a `replaceState` en cada
 * cambio de estado del router —navegar, `router.refresh()`, cada acción que
 * revalida— y el buscador del inventario lo hace en cada tecla. O sea que cada
 * interacción pagaba un SSR completo de la página (layout, consultas a
 * Supabase y todo) que no miraba nadie, y las variantes `?q=` llenaban la caché
 * echando las páginas de verdad.
 *
 * Aquí: una vez por ruta y pestaña, sin la query, y solo con red. Si se navegó
 * sin red, se reintenta al volver.
 */
export function PageCacheOnVisit() {
  const { serwist } = useSerwist();
  const pathname = usePathname();

  useEffect(() => {
    if (!serwist || !pathname) return;
    const cache = () => {
      if (!navigator.onLine || cached.has(pathname)) return;
      cached.add(pathname);
      serwist
        .messageSW({ type: "CACHE_URLS", payload: { urlsToCache: [pathname] } })
        .catch(() => cached.delete(pathname));
    };
    cache();
    window.addEventListener("online", cache);
    return () => window.removeEventListener("online", cache);
  }, [serwist, pathname]);

  return null;
}
