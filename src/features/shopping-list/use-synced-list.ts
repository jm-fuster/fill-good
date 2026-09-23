"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  HEAL_SETTLE_MS,
  mergeDeltaInto,
  mergeSnapshot,
  sortSyncedItems,
  useCoalescedHeal,
  usePendingWrites,
  type ListDelta,
  type ListItemRealtimeRow,
  type PendingWrites,
  type SyncedItem,
} from "./list-sync";
import { useRealtimeList } from "./use-realtime-list";

/**
 * La lista sincronizada de una pantalla: el estado que se ve, más las cuatro
 * formas de tocarlo. Todo pasa por aquí para que la memoria de lo hecho en
 * local (lo quitado, lo recién añadido, lo que tiene escritura en vuelo) valga
 * también frente a lo que llegue del servidor.
 */
export type SyncedList<T extends SyncedItem> = {
  items: T[];
  pending: PendingWrites;
  /** Programa una relectura de la lista (se agrupan; ver `useCoalescedHeal`). */
  heal: (delay?: number) => void;
  /** Cambia campos de una fila en local (lo que el usuario acaba de hacer). */
  patch: (id: string, change: Partial<T>) => void;
  /** Sustituye la lista entera en local (reordenar). */
  replace: (next: T[]) => void;
  /** Mete una fila que ya existe en el servidor (alta propia confirmada). */
  add: (item: T) => void;
  /** Quita una fila. No vuelve, ni con una respuesta del servidor rezagada. */
  remove: (id: string) => void;
  /** Deshace un `remove`: la fila vuelve y deja de estar vetada. */
  unremove: (item: T) => void;
};

export function useSyncedList<T extends SyncedItem>({
  listId,
  initialItems,
  fetchItems,
  provisionalItem,
  channelKey,
  checkedLast = true,
}: {
  listId: string;
  /** Semilla del servidor. Solo siembra: a partir del montaje manda lo local. */
  initialItems: T[];
  /** Relectura completa (Server Action). null = no se pudo leer. */
  fetchItems: (listId: string) => Promise<T[] | null>;
  /**
   * Fila provisional para un alta que llega de otro móvil. Un evento de Realtime
   * trae la fila, no lo que cuelga del producto (categoría, envase, precio), así
   * que se pinta al instante con lo que hay y la cura completa el resto: verlo
   * aparecer es lo que importa en el pasillo, y esperar a la lectura sería el
   * medio segundo de retraso que se quiere quitar.
   */
  provisionalItem: (row: ListItemRealtimeRow) => T;
  channelKey?: string;
  /** Ver `sortSyncedItems`. El modo compra ordena los cogidos por su cuenta. */
  checkedLast?: boolean;
}): SyncedList<T> {
  const [items, setItems] = useState(initialItems);
  const pending = usePendingWrites();
  const tombstones = useRef(new Set<string>());
  const recentAdds = useRef(new Map<string, number>());
  const recentChanges = useRef(new Map<string, number>());

  // Espejo síncrono del estado: dentro de una ráfaga de eventos (un alta de
  // quince artículos llega como quince mensajes) el `items` del render todavía
  // es el de antes, y decidir con él duplicaría filas.
  const itemsRef = useRef(items);
  const write = useCallback((next: (prev: T[]) => T[]) => {
    itemsRef.current = next(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const sortOptions = useMemo(() => ({ checkedLast }), [checkedLast]);

  const applySnapshot = useCallback(
    (snapshot: T[]) => {
      write((prev) =>
        mergeSnapshot(
          prev,
          snapshot,
          {
            tombstones: tombstones.current,
            recentAdds: recentAdds.current,
            recentChanges: recentChanges.current,
            isBusy: pending.isBusy,
          },
          sortOptions,
        ),
      );
    },
    [write, pending, sortOptions],
  );

  const heal = useCoalescedHeal(async () => {
    const rows = await fetchItems(listId);
    if (rows) applySnapshot(rows);
  });

  const onDelta = useCallback(
    (delta: ListDelta) => {
      if (delta.type === "delete") {
        // Un borrado es definitivo: fuera de la pantalla y vetado, para que una
        // respuesta pedida antes del borrado no lo devuelva.
        tombstones.current.add(delta.id);
        recentAdds.current.delete(delta.id);
        write((prev) => prev.filter((item) => item.id !== delta.id));
        return;
      }
      if (tombstones.current.has(delta.id)) return;
      if (pending.isBusy(delta.id)) {
        // Hay escritura propia en vuelo sobre esa fila: lo local es igual o más
        // nuevo. Se cura cuando haya asentado, por si el cambio era ajeno.
        heal(HEAL_SETTLE_MS);
        return;
      }
      const known = itemsRef.current.some((item) => item.id === delta.id);
      // Un cambio ajeno sobre una fila que ya está aquí: que una cura en vuelo
      // (pedida antes de este cambio) no lo deshaga al llegar. Ver
      // `CHANGE_GRACE_MS`.
      if (known) recentChanges.current.set(delta.id, Date.now());
      if (!known) {
        recentAdds.current.set(delta.id, Date.now());
        // Falta lo que cuelga del producto (y en un UPDATE de una fila que aquí
        // no está, se perdió su alta): la cura lo trae.
        heal();
      }
      write((prev) =>
        known
          ? sortSyncedItems(
              prev.map((item) =>
                item.id === delta.id ? mergeDeltaInto(item, delta.row) : item,
              ),
              sortOptions,
            )
          : sortSyncedItems([...prev, provisionalItem(delta.row)], sortOptions),
      );
    },
    [write, pending, heal, provisionalItem, sortOptions],
  );

  useRealtimeList(listId, {
    channelKey,
    onDelta,
    onDesync: () => heal(0),
  });

  // Una cura al montar: el caché de router del cliente sirve la página hasta 30 s
  // después (staleTimes), así que la semilla puede traer una lista de hace medio
  // minuto — y lo que haya cambiado en ese rato no llegó por Realtime, porque
  // esta pantalla aún no existía.
  useEffect(() => {
    heal(0);
  }, [heal]);

  // Las Server Actions que revalidan `/lista` devuelven la página entera con la
  // respuesta: eso es una instantánea gratis, y se aprovecha. Pasa por el mismo
  // filtro que las curas, así que ya no puede resucitar lo quitado ni pisar una
  // escritura en vuelo (que es lo que hacía la lista dar tirones).
  const seeded = useRef(initialItems);
  useEffect(() => {
    if (seeded.current === initialItems) return;
    seeded.current = initialItems;
    applySnapshot(initialItems);
  }, [initialItems, applySnapshot]);

  return useMemo(
    () => ({
      items,
      pending,
      heal,
      patch: (id, change) => {
        write((prev) =>
          sortSyncedItems(
            prev.map((item) => (item.id === id ? { ...item, ...change } : item)),
            sortOptions,
          ),
        );
      },
      replace: (next) => {
        write(() => sortSyncedItems(next, sortOptions));
      },
      add: (item) => {
        recentAdds.current.set(item.id, Date.now());
        tombstones.current.delete(item.id);
        write((prev) => {
          const existing = prev.find((row) => row.id === item.id);
          if (!existing) return sortSyncedItems([...prev, item], sortOptions);
          // La fila ya había llegado por Realtime (provisional): se queda la
          // versión rica, con el sitio y el estado que dice el servidor.
          const merged = {
            ...item,
            position: existing.position,
            createdAt: existing.createdAt,
            isChecked: existing.isChecked,
          };
          return sortSyncedItems(
            prev.map((row) => (row.id === item.id ? merged : row)),
            sortOptions,
          );
        });
      },
      remove: (id) => {
        tombstones.current.add(id);
        recentAdds.current.delete(id);
        write((prev) => prev.filter((item) => item.id !== id));
      },
      unremove: (item) => {
        tombstones.current.delete(item.id);
        recentAdds.current.set(item.id, Date.now());
        write((prev) =>
          prev.some((row) => row.id === item.id)
            ? prev
            : sortSyncedItems([...prev, item], sortOptions),
        );
      },
    }),
    [items, pending, heal, write, sortOptions],
  );
}
