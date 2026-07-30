"use client";

import * as React from "react";

import { vibrateTick } from "@/lib/haptics";

/** Recorrido (px) que hay que deslizar para destapar el botón. */
const REVEAL_THRESHOLD = 40;
/** Ancho del botón que queda a la vista, y hasta donde se aparta la fila. */
const REVEAL_WIDTH = 96;
/** Tope del arrastre: un poco más que el botón, para que se note el final. */
const MAX_DRAG = Math.round(REVEAL_WIDTH * 1.4);

/**
 * Deslizar una fila hacia la izquierda para destapar su botón de quitar, en DOS
 * pasos: el gesto solo aparta la fila y deja el botón a la vista, y quitar exige
 * tocarlo.
 *
 * Que el arrastre no borre por sí solo es el punto de todo esto. Comprando no
 * miras la pantalla —miras el estante—, así que un roce mientras desplazas la
 * lista con el pulgar borraba un artículo y el aviso de «Deshacer» se iba en
 * cinco segundos sin que nadie lo viera: te enterabas en casa, al no tener la
 * cosa. Ahora un descuido solo destapa un botón (y vibra al hacerlo), y se cierra
 * con el siguiente toque en cualquier sitio. Un diálogo de confirmación habría
 * costado más justo donde peor se está —con el carro en una mano— y a las dos
 * semanas se contesta «sí» por reflejo; esto no se puede contestar sin querer.
 *
 * El eje se decide en el primer movimiento y se respeta hasta soltar: sin eso, un
 * scroll vertical que empieza torcido arrastraría la fila, y una fila que se
 * arrastra bloquearía el scroll de la lista. Por eso el elemento lleva
 * `touch-action: pan-y` y el gesto captura el puntero solo cuando ya sabe que va
 * en horizontal. Solo gesto táctil o de lápiz: con ratón hay botón visible, que
 * es lo que se descubre en escritorio.
 *
 * Lo usan la lista (`/lista`) y el modo compra, que son la misma fila en dos
 * momentos distintos de la compra.
 *
 * @param onRemove Se llama al tocar el botón destapado, nunca al soltar el dedo.
 */
export function useSwipeRemove(onRemove: () => void) {
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLElement | null>(null);
  const gesture = React.useRef({
    x: 0,
    y: 0,
    active: false,
    axis: "none" as "none" | "h" | "v",
    dx: 0,
  });
  // Suprime el "click" que sigue a un deslizamiento o al toque que cierra (p. ej.
  // para no abrir el editor ni marcar el artículo de rebote).
  const swiped = React.useRef(false);

  const close = React.useCallback(() => {
    setOpen(false);
    setDx(0);
  }, []);

  // Con el botón a la vista, cualquier toque FUERA de la fila la cierra: así no
  // se queda abierta a la espalda mientras sigues comprando. Va en captura para
  // llegar antes de que el destino se coma el evento.
  React.useEffect(() => {
    if (!open) return;
    const onOutside = (e: PointerEvent) => {
      const el = root.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      close();
    };
    document.addEventListener("pointerdown", onOutside, true);
    return () => document.removeEventListener("pointerdown", onOutside, true);
  }, [open, close]);

  function onPointerDown(e: React.PointerEvent) {
    if (open) {
      // Ya está destapada: este toque solo la cierra, y se traga el click que
      // vendría detrás para no marcar el artículo sin querer.
      swiped.current = true;
      close();
      return;
    }
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
      const clamped = Math.max(-MAX_DRAG, Math.min(0, deltaX));
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
    if (g.axis === "h" && g.dx <= -REVEAL_THRESHOLD) {
      // Se queda abierta en el ancho exacto del botón, no donde quedó el dedo.
      setOpen(true);
      setDx(-REVEAL_WIDTH);
      // Que se NOTE, porque puede haber pasado sin mirar.
      vibrateTick();
    } else {
      setDx(0);
    }
    g.axis = "none";
    g.dx = 0;
  }

  return {
    /** `ref` del contenedor de la fila (el que recorta y posiciona el botón). */
    rootRef: React.useCallback((el: HTMLElement | null) => {
      root.current = el;
    }, []),
    /** true = el botón de quitar está a la vista. */
    open,
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
    /**
     * Props del botón que queda detrás. `inert` mientras está tapado: ahí no se
     * puede tocar ni recibir foco, y no lo anuncia el lector de pantalla —es la
     * misma acción que ya ofrece la papelera de la fila.
     */
    actionProps: {
      type: "button",
      inert: !open,
      onClick: () => {
        close();
        onRemove();
      },
      style: { width: REVEAL_WIDTH },
    } satisfies React.ComponentProps<"button">,
  };
}
