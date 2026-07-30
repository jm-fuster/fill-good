"use client";

import * as React from "react";

/** Umbral (px) de deslizamiento para confirmar el borrado. */
const SWIPE_THRESHOLD = 72;

/**
 * Deslizar una fila hacia la izquierda para quitarla, con el fondo de aviso
 * asomando por detrás. Solo gesto táctil o de lápiz: con ratón hay botón visible
 * (papelera), que es lo que se descubre en escritorio.
 *
 * El eje se decide en el primer movimiento y se respeta hasta soltar: sin eso,
 * un scroll vertical que empieza torcido arrastraría la fila, y una fila que se
 * arrastra bloquearía el scroll de la lista. Por eso el elemento lleva
 * `touch-action: pan-y` y el gesto captura el puntero solo cuando ya sabe que va
 * en horizontal.
 *
 * Lo usan la lista (`/lista`) y el modo compra, que son la misma fila en dos
 * momentos distintos de la compra.
 *
 * @param onRemove Se llama una vez, al soltar pasado el umbral.
 */
export function useSwipeRemove(onRemove: () => void) {
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const gesture = React.useRef({
    x: 0,
    y: 0,
    active: false,
    axis: "none" as "none" | "h" | "v",
    dx: 0,
  });
  // Suprime el "click" que sigue a un deslizamiento (p. ej. no abrir el editor).
  const swiped = React.useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      active: true,
      axis: "none",
      dx: 0,
    };
    swiped.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g.active) return;
    const deltaX = e.clientX - g.x;
    const deltaY = e.clientY - g.y;
    if (g.axis === "none") {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      g.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
      if (g.axis === "h") {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }
    }
    if (g.axis === "h") {
      const clamped = Math.min(0, deltaX);
      g.dx = clamped;
      setDx(clamped);
      setDragging(true);
      if (clamped <= -8) swiped.current = true;
    }
  }

  function endGesture() {
    const g = gesture.current;
    g.active = false;
    setDragging(false);
    setDx(0);
    if (g.axis === "h" && g.dx <= -SWIPE_THRESHOLD) onRemove();
    g.axis = "none";
    g.dx = 0;
  }

  return {
    /** Props del elemento que se desliza (incluye su propio `style`). */
    swipeProps: {
      style: {
        touchAction: "pan-y",
        transform: `translateX(${dx}px)`,
        transition: dragging ? "none" : "transform 0.2s ease-out",
      },
      onPointerDown,
      onPointerMove,
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
      onClickCapture: (e: React.MouseEvent) => {
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }
      },
    } satisfies React.ComponentProps<"div">,
  };
}
