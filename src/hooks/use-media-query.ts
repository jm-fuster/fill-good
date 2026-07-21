import * as React from "react";

/**
 * Suscripción a un media query (`matchMedia`).
 *
 * IMPORTANTE: el valor inicial en SSR y en la hidratación es `false`, así que
 * este hook SOLO debe usarse para UI que se decide **tras una interacción del
 * usuario** (p. ej. qué presentación toma un modal al abrirse) — nunca para
 * elegir el layout del primer render, porque eso provocaría un flash o un
 * mismatch de hidratación. Para el layout, decide con CSS (breakpoints).
 *
 * Implementado con `useSyncExternalStore` para no llamar a setState dentro de
 * un efecto (regla `react-hooks/set-state-in-effect`).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (callback: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
