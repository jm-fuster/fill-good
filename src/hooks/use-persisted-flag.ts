import * as React from "react";

/**
 * Preferencia booleana persistida en `localStorage`, por dispositivo.
 *
 * Implementado con `useSyncExternalStore` (server snapshot `false`) para no
 * llamar a setState dentro de un efecto (regla `react-hooks/set-state-in-effect`)
 * ni provocar mismatch de hidratación. Como el evento `storage` no se dispara
 * en la propia pestaña, se mantiene un conjunto de listeners local para que la
 * escritura re-renderice a quien use el hook.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function usePersistedFlag(
  key: string,
  defaultValue = false,
): [boolean, (next: boolean) => void] {
  const subscribe = React.useCallback((callback: () => void) => {
    listeners.add(callback);
    window.addEventListener("storage", callback);
    return () => {
      listeners.delete(callback);
      window.removeEventListener("storage", callback);
    };
  }, []);

  const value = React.useSyncExternalStore(
    subscribe,
    () => {
      const raw = localStorage.getItem(key);
      return raw === null ? defaultValue : raw === "1";
    },
    () => defaultValue,
  );

  const setValue = React.useCallback(
    (next: boolean) => {
      localStorage.setItem(key, next ? "1" : "0");
      notify();
    },
    [key],
  );

  return [value, setValue];
}
