"use client";

import * as React from "react";

/** Devuelve una copia de `arr` con el elemento en `from` movido a `to`. */
export function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export type DragReorderHandleProps = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
};

/**
 * Reordenación vertical por puntero, sin dependencias. Pensada para arrastrar
 * desde un "asa" (grip): mientras arrastras, la lista se reordena al cruzar el
 * punto medio de otra fila (sin animación FLIP, pero estable frente a reflows).
 *
 * - `ids`: orden actual (fuente de verdad del servidor). Se sincroniza cuando
 *   cambia y NO estás arrastrando, para no pisar un arrastre en curso.
 * - `onCommit`: se llama al soltar con el nuevo orden (solo si cambió).
 *
 * Registra cada fila con `registerItem(id)` en su `ref` y pinta el asa con
 * `getHandleProps(id)`. `draggingId` permite resaltar la fila activa.
 *
 * Accesibilidad: el arrastre es una mejora para puntero; ofrece siempre botones
 * subir/bajar (usa `arrayMove` + `onCommit`) para teclado y lectores.
 */
export function useDragReorder(
  ids: readonly string[],
  onCommit: (orderedIds: string[]) => void,
) {
  const [order, setOrder] = React.useState<string[]>([...ids]);
  const orderRef = React.useRef<string[]>(order);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const draggingRef = React.useRef(false);
  const itemRefs = React.useRef(new Map<string, HTMLElement | null>());

  // Resincroniza SOLO cuando el `ids` entrante cambia de verdad (datos nuevos
  // del servidor), no cuando difiere del orden local. Si compilásemos contra
  // `order`, tras confirmar un arrastre —cuando el prop sigue igual hasta que
  // el servidor revalida— la lista "saltaría" al orden anterior. Se compara con
  // el prop previo guardado en estado (legible en render, a diferencia de un ref).
  const [prevIds, setPrevIds] = React.useState<readonly string[]>(ids);
  if (!sameOrder(prevIds, ids)) {
    setPrevIds(ids);
    if (draggingId === null) setOrder([...ids]);
  }

  // Mantiene el ref alineado con el estado para leerlo en los handlers de
  // puntero (que se suceden más rápido que los re-renders).
  React.useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const setBoth = React.useCallback((next: string[]) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const registerItem = React.useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) itemRefs.current.set(id, el);
      else itemRefs.current.delete(id);
    },
    [],
  );

  const getHandleProps = React.useCallback(
    (id: string): DragReorderHandleProps => ({
      style: { touchAction: "none" },
      onPointerDown: (e) => {
        // Solo botón principal en ratón; táctil/lápiz siempre.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        draggingRef.current = true;
        setDraggingId(id);
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        e.preventDefault();
      },
      onPointerMove: (e) => {
        if (!draggingRef.current || draggingId === null) return;
        const current = orderRef.current;
        const from = current.indexOf(id);
        if (from === -1) return;
        const y = e.clientY;
        let to = from;
        for (let i = 0; i < current.length; i++) {
          if (current[i] === id) continue;
          const el = itemRefs.current.get(current[i]);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (i < from && y < mid) to = Math.min(to, i);
          else if (i > from && y > mid) to = Math.max(to, i);
        }
        if (to !== from) setBoth(arrayMove(current, from, to));
      },
      onPointerUp: (e) => {
        if (!draggingRef.current) return;
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
        draggingRef.current = false;
        setDraggingId(null);
        if (!sameOrder(orderRef.current, ids)) onCommit([...orderRef.current]);
      },
      onPointerCancel: (e) => {
        if (!draggingRef.current) return;
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
        draggingRef.current = false;
        setDraggingId(null);
        // Cancelación: descarta el arrastre y vuelve al orden del servidor.
        setBoth([...ids]);
      },
    }),
    [draggingId, ids, onCommit, setBoth],
  );

  /** Mueve `id` una posición arriba/abajo (para botones accesibles) y confirma. */
  const move = React.useCallback(
    (id: string, dir: -1 | 1) => {
      const current = orderRef.current;
      const from = current.indexOf(id);
      const to = from + dir;
      if (from === -1 || to < 0 || to >= current.length) return;
      const next = arrayMove(current, from, to);
      setBoth(next);
      onCommit([...next]);
    },
    [onCommit, setBoth],
  );

  return { order, draggingId, registerItem, getHandleProps, move };
}
