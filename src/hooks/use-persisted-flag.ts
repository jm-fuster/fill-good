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

/** No depende de la clave, así que vive fuera y la comparten los dos hooks. */
function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function usePersistedFlag(
  key: string,
  defaultValue = false,
): [boolean, (next: boolean) => void] {
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

/**
 * Igual que {@link usePersistedFlag} pero para una elección entre varias (la
 * tienda de la compra, p. ej.), con `null` = «sin elegir». Snapshot de servidor
 * `null`, así que el primer render es siempre el de «sin elegir» y el valor
 * guardado entra al hidratar.
 */
export function usePersistedChoice(
  key: string,
): [string | null, (next: string | null) => void] {
  const value = React.useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key),
    () => null,
  );

  const setValue = React.useCallback(
    (next: string | null) => {
      // Se BORRA la clave en vez de guardar "null": así «sin elegir» es un solo
      // estado (ausencia) y no dos que haya que tratar igual en cada lectura.
      if (next === null) localStorage.removeItem(key);
      else localStorage.setItem(key, next);
      notify();
    },
    [key],
  );

  return [value, setValue];
}
