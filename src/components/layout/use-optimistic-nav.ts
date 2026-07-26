"use client";

import { startTransition, useOptimistic } from "react";
import { usePathname } from "next/navigation";

/**
 * Ruta "optimista" para la navegación principal: al tocar una entrada se marca
 * activa al instante, sin esperar a que el servidor responda. El
 * `startTransition` propio se entrelaza con la transición de navegación del
 * `<Link>`, así que React mantiene el valor optimista mientras la navegación
 * está en curso y lo revierte solo a `pathname` real cuando termina (o si no
 * llega a completarse, p. ej. Ctrl+clic que abre en otra pestaña).
 *
 * `pathname` (real) es para semántica (`aria-current`); `navPath` (optimista)
 * es solo para el resaltado visual.
 */
export function useOptimisticNav() {
  const pathname = usePathname();
  const [navPath, setNavPath] = useOptimistic(pathname);

  function markPressed(href: string) {
    startTransition(() => setNavPath(href));
  }

  return { pathname, navPath, markPressed };
}
