"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { UnitType } from "@/lib/supabase/types";

/**
 * Piezas compartidas de la sincronización de la lista en el cliente.
 *
 * La lista es COLABORATIVA y se usa a la vez en dos móviles dentro de la tienda,
 * así que el estado local es la autoridad mientras la pantalla está montada y el
 * servidor manda CAMBIOS SUELTOS (una fila) en vez de instantáneas de la lista
 * entera. Una instantánea no dice CUÁNDO se leyó: dos respuestas del servidor
 * pueden llegar en orden distinto al que se pidieron, y aplicar la vieja después
 * de la nueva es exactamente lo que hacía reaparecer lo que acababas de quitar o
 * retroceder el número del stepper.
 *
 * Aquí viven las reglas para que eso no pueda pasar:
 *  · `mergeDeltaInto` — aplicar el cambio de UNA fila.
 *  · `mergeSnapshot`  — aplicar una lista completa sin pisar lo local (curas,
 *    y el payload que traen las Server Actions que revalidan `/lista`).
 *  · `usePendingWrites` — qué filas tienen escritura propia en vuelo.
 *  · `useCoalescedHeal` — una sola cura por ráfaga de cambios.
 */

/** Fila de `shopping_list_items` tal como llega en un evento de Realtime. */
export type ListItemRealtimeRow = {
  id: string;
  list_id: string;
  product_id: string | null;
  name: string;
  /** `numeric` en Postgres: puede llegar como número o como cadena. */
  quantity: number | string | null;
  unit: UnitType | null;
  is_checked: boolean;
  added_by: string | null;
  position: number;
  created_at: string;
};

/** Un cambio suelto de la lista. En un borrado solo se conoce el id. */
export type ListDelta =
  | { type: "insert"; id: string; row: ListItemRealtimeRow }
  | { type: "update"; id: string; row: ListItemRealtimeRow }
  | { type: "delete"; id: string };

/**
 * Lo que cualquier vista de la lista necesita para colocar y actualizar una fila
 * por su cuenta, sin volver a preguntar al servidor. `position` y `createdAt`
 * están aquí porque sin ellos el cliente no sabe DÓNDE va una fila: al llegar un
 * alta ajena o un reorden habría que recargar la página solo para averiguar el
 * orden.
 */
export type SyncedItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  isChecked: boolean;
  position: number;
  createdAt: string;
};

/** Retardo por defecto de una cura: agrupa una ráfaga de cambios en una sola. */
export const HEAL_DELAY_MS = 300;

/**
 * Retardo de la cura cuando el cambio llegó para una fila con escritura propia
 * en vuelo: hay que darle tiempo a asentarse, o la cura leería el valor viejo.
 */
export const HEAL_SETTLE_MS = 1_200;

/**
 * Ventana en la que una instantánea NO puede borrar una fila recién aparecida
 * aquí. Cubre el desfase entre pedir los datos y recibirlos: sin ella, la
 * respuesta de una lectura lanzada ANTES del alta borraría el artículo nuevo, y
 * el siguiente evento lo devolvería — el parpadeo de toda la vida.
 */
export const ADD_GRACE_MS = 5_000;

/** Cantidad de Postgres (`numeric` llega como cadena) a número o null. */
function quantityOf(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * Ordena como lo hace `getListItems`: lo pendiente antes que lo que ya está en
 * el carro, luego por `position` (el orden de «Reordenar») y por antigüedad.
 *
 * @param checkedLast Con `false` no separa lo marcado (el modo compra lo agrupa
 *   por pasillo y ya ordena los cogidos dentro de cada bloque).
 */
export function sortSyncedItems<T extends SyncedItem>(
  items: T[],
  { checkedLast = true }: { checkedLast?: boolean } = {},
): T[] {
  return [...items].sort(
    (a, b) =>
      (checkedLast ? Number(a.isChecked) - Number(b.isChecked) : 0) ||
      a.position - b.position ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Aplica a una fila local el cambio que llega por Realtime.
 *
 * El NOMBRE de un artículo vinculado al catálogo no se toca: el que se ve es el
 * del producto, y la columna `name` de la fila es solo el rótulo con el que se
 * apuntó (puede haber quedado desfasado si el producto se renombró desde el
 * inventario). Pisarlo aquí devolvería el nombre viejo a la pantalla. En el
 * texto libre, en cambio, la columna es lo único que hay.
 */
export function mergeDeltaInto<T extends SyncedItem>(
  local: T,
  row: ListItemRealtimeRow,
): T {
  return {
    ...local,
    name: row.product_id ? local.name : row.name,
    quantity: quantityOf(row.quantity),
    unit: row.unit,
    isChecked: row.is_checked,
    position: row.position,
    createdAt: row.created_at,
  };
}

/** Campos que un cambio de Realtime alcanza sin ayuda del servidor. */
export function syncedFieldsOf(row: ListItemRealtimeRow) {
  return {
    quantity: quantityOf(row.quantity),
    unit: row.unit,
    isChecked: row.is_checked,
    position: row.position,
    createdAt: row.created_at,
  };
}

/** Memoria de lo que ha pasado aquí y que ninguna instantánea puede deshacer. */
export type SyncGuards = {
  /**
   * Ids quitados en esta pantalla. Se conservan mientras dure el montaje: una
   * respuesta del servidor pedida ANTES del borrado sigue trayendo la fila, y
   * llegue cuando llegue no puede resucitarla. (El fallo era justo lo contrario:
   * el id se soltaba en cuanto UNA respuesta no lo traía, y la siguiente
   * respuesta rezagada lo devolvía a la pantalla.)
   */
  tombstones: Set<string>;
  /** Id → cuándo apareció aquí (ms). Ver `ADD_GRACE_MS`. */
  recentAdds: Map<string, number>;
  /** ¿Hay escritura propia en vuelo sobre esta fila? */
  isBusy: (id: string) => boolean;
};

/**
 * Funde una lista completa del servidor con el estado local, sin perder lo que
 * el usuario acaba de hacer:
 *  · lo quitado aquí no vuelve (`tombstones`);
 *  · en las filas con escritura propia en vuelo se conserva lo local (marcado,
 *    cantidad y posición): el servidor va por detrás en esos campos;
 *  · una fila que la instantánea no trae solo se conserva si acaba de aparecer
 *    (`ADD_GRACE_MS`) o tiene escritura en vuelo; si no, es que se borró.
 */
export function mergeSnapshot<T extends SyncedItem>(
  local: T[],
  snapshot: T[],
  guards: SyncGuards,
  options: { checkedLast?: boolean } = {},
): T[] {
  const now = Date.now();
  const localById = new Map(local.map((item) => [item.id, item]));
  const merged: T[] = [];

  for (const row of snapshot) {
    if (guards.tombstones.has(row.id)) continue;
    const mine = localById.get(row.id);
    merged.push(
      mine && guards.isBusy(row.id)
        ? {
            ...row,
            isChecked: mine.isChecked,
            quantity: mine.quantity,
            position: mine.position,
          }
        : row,
    );
  }

  const inSnapshot = new Set(snapshot.map((row) => row.id));
  for (const mine of local) {
    if (inSnapshot.has(mine.id) || guards.tombstones.has(mine.id)) continue;
    const addedAt = guards.recentAdds.get(mine.id);
    const fresh = addedAt !== undefined && now - addedAt < ADD_GRACE_MS;
    if (fresh || guards.isBusy(mine.id)) merged.push(mine);
  }

  // La gracia solo tiene sentido durante su ventana; sin esta poda el mapa
  // crecería con cada alta de la sesión.
  for (const [id, at] of guards.recentAdds) {
    if (now - at >= ADD_GRACE_MS) guards.recentAdds.delete(id);
  }

  return sortSyncedItems(merged, options);
}

/**
 * Filas con escritura propia en vuelo. Mientras lo estén, lo que llegue del
 * servidor para ellas se ignora: lo local es igual o más nuevo. Sin esto, dos
 * toques rápidos sobre el mismo artículo se pisan (marcar y desmarcar deja la
 * fila marcada durante medio segundo, porque el eco del primer toque llega
 * cuando ya se hizo el segundo).
 */
export type PendingWrites = {
  /** Envuelve una escritura: marca la fila, espera y la suelta. */
  track: <T>(id: string, work: Promise<T>) => Promise<T>;
  /** Retención sostenida (el stepper, mientras acumula toques sin persistir). */
  setHold: (id: string, held: boolean) => void;
  isBusy: (id: string) => boolean;
};

export function usePendingWrites(): PendingWrites {
  const counts = useRef(new Map<string, number>());
  const holds = useRef(new Set<string>());

  return useMemo(() => {
    const isBusy = (id: string) =>
      holds.current.has(id) || (counts.current.get(id) ?? 0) > 0;

    return {
      isBusy,
      setHold: (id, held) => {
        if (held) holds.current.add(id);
        else holds.current.delete(id);
      },
      track: async (id, work) => {
        counts.current.set(id, (counts.current.get(id) ?? 0) + 1);
        try {
          return await work;
        } finally {
          const left = (counts.current.get(id) ?? 1) - 1;
          if (left > 0) counts.current.set(id, left);
          else counts.current.delete(id);
        }
      },
    };
  }, []);
}

export type HealScheduler = {
  /** Pide una cura dentro de `delay` ms. Gana el plazo más corto pedido. */
  schedule: (delay?: number) => void;
  /** Cambia la lectura a ejecutar (en el hook, la del render más reciente). */
  setRun: (run: () => Promise<void>) => void;
  resume: () => void;
  dispose: () => void;
};

/**
 * Agrupador de "curas": una relectura de la lista que repara lo que los cambios
 * sueltos no pueden traer (la categoría y el precio de un alta ajena, o un
 * evento perdido mientras el móvil dormía).
 *
 * Se agrupa a propósito: quince altas de golpe son quince eventos y UNA sola
 * lectura. Gana siempre el plazo más corto pedido, y si se pide una cura
 * mientras hay otra en curso se repite al terminar — los datos que trajo pueden
 * ser anteriores al cambio que la pidió, y quedarse con ellos es justo el fallo
 * que esto viene a evitar.
 *
 * Vive aparte del hook para poder comprobarlo sin React (`npm run check:lista`).
 */
export function createHealScheduler(run?: () => Promise<void>): HealScheduler {
  let current = run ?? (async () => {});
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dueAt = 0;
  let running = false;
  let again = false;
  let alive = true;

  const fire = async () => {
    timer = null;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await current();
      } while (again && alive);
    } catch {
      // Una cura fallida no se reintenta sola: la siguiente (latido, volver a la
      // pestaña o el próximo cambio) vuelve a intentarlo.
    } finally {
      running = false;
      again = false;
    }
  };

  return {
    schedule: (delay = HEAL_DELAY_MS) => {
      if (!alive) return;
      const at = Date.now() + delay;
      // Ya hay una cura programada para antes o a la vez: esa vale.
      if (timer !== null && dueAt <= at) return;
      if (timer !== null) clearTimeout(timer);
      dueAt = at;
      timer = setTimeout(() => void fire(), delay);
    },
    setRun: (next) => {
      current = next;
    },
    resume: () => {
      alive = true;
    },
    dispose: () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

/** El agrupador de curas atado al ciclo de vida de un componente. */
export function useCoalescedHeal(
  run: () => Promise<void>,
): (delay?: number) => void {
  const [scheduler] = useState(createHealScheduler);

  // La lectura del render más reciente, sin rehacer el agrupador (ni la
  // suscripción que lo usa) en cada render.
  useEffect(() => {
    scheduler.setRun(run);
  });

  // `resume` y no solo `dispose`: en desarrollo React monta, desmonta y vuelve a
  // montar, y sin esto el agrupador se quedaría apagado para siempre.
  useEffect(() => {
    scheduler.resume();
    return () => scheduler.dispose();
  }, [scheduler]);

  return scheduler.schedule;
}
