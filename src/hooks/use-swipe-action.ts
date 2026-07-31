"use client";

import * as React from "react";

import { vibrateTick } from "@/lib/haptics";

/** Recorrido (px) que hay que deslizar para destapar el botón. */
const REVEAL_THRESHOLD = 40;
/**
 * Recorrido (px) para armar la acción cuando se ejecuta al soltar: más que
 * destapar, porque detrás no hay un toque que confirme.
 */
const INSTANT_THRESHOLD = 64;
/** Ancho del botón que queda a la vista, y hasta donde se aparta la fila. */
const REVEAL_WIDTH = 96;
/** Tope del arrastre: un poco más que el botón, para que se note el final. */
const MAX_DRAG = Math.round(REVEAL_WIDTH * 1.4);

/**
 * Deslizar una fila para ejecutar su acción, en uno o en dos pasos. Cuál de los
 * dos no es cuestión de gusto: depende de lo que cueste deshacer lo que pasa.
 *
 * - **`instant` (inventario).** El gesto ES la acción: al pasar el umbral la
 *   franja se arma —y se nota en el dedo—, y al soltar se ejecuta. Apuntar en la
 *   lista se hace en ráfaga, recorriendo la despensa de arriba abajo, así que un
 *   toque más por producto son veinte toques más; y lo peor que puede salir de
 *   un descuido es un producto apuntado de más, que se quita con el mismo gesto
 *   al revés. El umbral es más largo (`INSTANT_THRESHOLD`) justo por eso: aquí
 *   soltar ya es decidir.
 * - **Destapar (`/lista` y modo compra).** El gesto solo aparta la fila y deja
 *   el botón a la vista; ejecutar exige tocarlo. Ahí la acción BORRA la fila y
 *   comprando no miras la pantalla —miras el estante—: un roce mientras
 *   desplazas la lista con el pulgar borraba un artículo y el aviso de
 *   «Deshacer» se iba en cinco segundos sin que nadie lo viera; te enterabas en
 *   casa, al no tener la cosa. Un diálogo de confirmación habría costado más
 *   justo donde peor se está —con el carro en una mano— y a las dos semanas se
 *   contesta «sí» por reflejo; un botón destapado no se pulsa sin querer.
 *
 * Destapado, el botón es el ÚNICO objetivo táctil de su franja: la fila lleva
 * `pointer-events: none` mientras está abierta. Sin eso, la fila que todavía se
 * está deslizando hasta su sitio (la transición dura 200 ms) se lleva por
 * delante el toque que iba al botón y lo convierte en «cerrar» — que es
 * exactamente el primer toque que parecía no hacer nada. Por lo mismo la acción
 * sale en `pointerup`, dentro del botón, sin esperar al `click`: así se comporta
 * cualquier app nativa y, sobre todo, no depende de que el navegador se decida a
 * generar el `click` de compatibilidad detrás de un gesto, que no siempre lo
 * hace. El `click` sigue ahí para teclado y ratón, y no repite la acción.
 *
 * El eje se decide en el primer movimiento y se respeta hasta soltar: sin eso, un
 * scroll vertical que empieza torcido arrastraría la fila, y una fila que se
 * arrastra bloquearía el scroll de la lista. Por eso el elemento lleva
 * `touch-action: pan-y` y el gesto captura el puntero solo cuando ya sabe que va
 * en horizontal. Solo gesto táctil o de lápiz: con ratón hay botón visible, que
 * es lo que se descubre en escritorio.
 *
 * Ojo con esa última frase al añadir una pantalla nueva: el gesto NO es la única
 * vía de nada. Con ratón no existe, así que la acción tiene que estar además en
 * un botón normal (la papelera de la fila en `/lista`, el interruptor de la ficha
 * en el inventario) o en escritorio no habría manera de hacerla.
 *
 * @param onAction Con `instant`, al soltar pasado el umbral; si no, al tocar el
 *   botón destapado — nunca al soltar el dedo.
 * @param direction Hacia dónde se arrastra la fila. `"left"` (por defecto) deja
 *   el botón a la DERECHA y es el gesto de quitar de la lista, en `/lista` y en
 *   el modo compra. `"right"` deja el botón a la IZQUIERDA y lo usa el inventario
 *   para apuntar en la lista. Están espejados a propósito: lo que se entrena
 *   comprando es el reflejo, no la pantalla, y el mismo movimiento no puede
 *   añadir en un sitio y borrar en el otro.
 * @param instant Ejecuta al soltar, sin botón que tocar (ver arriba).
 */
export function useSwipeAction(
  onAction: () => void,
  {
    direction = "left",
    instant = false,
  }: { direction?: "left" | "right"; instant?: boolean } = {},
) {
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const armedRef = React.useRef(false);
  const action = React.useRef<HTMLButtonElement | null>(null);
  const gesture = React.useRef({
    x: 0,
    y: 0,
    active: false,
    axis: "none" as "none" | "h" | "v",
    dx: 0,
  });
  // Suprime el "click" que sigue a un deslizamiento (p. ej. para no abrir el
  // editor ni marcar el artículo de rebote).
  const swiped = React.useRef(false);
  // El toque ya ejecutó al levantar el dedo: el `click` que venga detrás no
  // repite la acción.
  const fired = React.useRef(false);
  // +1 arrastra a la derecha, -1 a la izquierda.
  const sign = direction === "right" ? 1 : -1;
  const threshold = instant ? INSTANT_THRESHOLD : REVEAL_THRESHOLD;

  const close = React.useCallback(() => {
    setOpen(false);
    setDx(0);
  }, []);

  // Con el botón a la vista, cualquier toque que no sea EN el botón cierra la
  // fila —en la propia tarjeta, en otra o fuera de la lista—: así no se queda
  // abierta a la espalda mientras sigues comprando. Va en captura para llegar
  // antes de que el destino se coma el evento.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDownAnywhere = (e: PointerEvent) => {
      const el = action.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDownAnywhere, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDownAnywhere, true);
  }, [open, close]);

  function setArmedOnce(next: boolean) {
    if (armedRef.current === next) return;
    armedRef.current = next;
    setArmed(next);
    // Que se NOTE al armarse, porque el gesto puede ir sin mirar la pantalla:
    // es el único aviso de que soltar YA ejecuta.
    if (next && instant) vibrateTick();
  }

  function onPointerDown(e: React.PointerEvent) {
    // Abierta no se arrastra: el toque va al botón, y cerrar lo lleva el
    // escuchador de arriba. (Con `pointer-events: none` esto no debería ni
    // llegar, pero el estado no puede depender de un estilo.)
    if (open) return;
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
      // Solo en el sentido del gesto: al otro lado de la fila no hay nada que
      // destapar, y dejarla irse igualmente parecería un botón que no llega.
      const clamped =
        sign < 0
          ? Math.max(-MAX_DRAG, Math.min(0, deltaX))
          : Math.min(MAX_DRAG, Math.max(0, deltaX));
      g.dx = clamped;
      setDx(clamped);
      setDragging(true);
      setArmedOnce(Math.abs(clamped) >= threshold);
      if (Math.abs(clamped) >= 8) swiped.current = true;
    }
  }

  function endGesture() {
    const g = gesture.current;
    g.active = false;
    setDragging(false);
    const passed = g.axis === "h" && Math.abs(g.dx) >= threshold;
    if (passed && instant) {
      // El gesto es la acción: la fila vuelve a su sitio y se ejecuta.
      setDx(0);
      onAction();
    } else if (passed) {
      // Se queda abierta en el ancho exacto del botón, no donde quedó el dedo.
      setOpen(true);
      setDx(sign * REVEAL_WIDTH);
      fired.current = false;
      // Que se NOTE, porque puede haber pasado sin mirar.
      vibrateTick();
    } else {
      setDx(0);
    }
    setArmedOnce(false);
    g.axis = "none";
    g.dx = 0;
  }

  function runAction() {
    fired.current = true;
    close();
    onAction();
  }

  return {
    /** El gesto ya pasó el umbral: soltar ejecuta (solo con `instant`). */
    armed,
    /** Props del elemento que se desliza (incluye su propio `style`). */
    swipeProps: {
      style: {
        touchAction: "pan-y",
        transform: `translateX(${dx}px)`,
        transition: dragging ? "none" : "transform 0.2s ease-out",
        // Destapada, la fila no recibe toques: la franja del botón es SUYA
        // aunque la fila todavía se esté deslizando por encima (ver arriba).
        pointerEvents: open ? ("none" as const) : undefined,
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
     * Props del botón que queda detrás; el lado (`left-0` o `right-0`, el
     * contrario al arrastre) lo pone quien lo pinta. `inert` mientras está
     * tapado: ahí no se puede tocar ni recibir foco, y no lo anuncia el lector de
     * pantalla —es la misma acción que ya ofrece un botón visible de la fila—.
     * Con `instant` es inert SIEMPRE: no hay nada que tocar, solo lo que se ve
     * debajo de la fila mientras la apartas.
     */
    actionProps: {
      ref: action,
      type: "button",
      inert: instant || !open,
      onPointerUp: instant
        ? undefined
        : (e: React.PointerEvent<HTMLButtonElement>) => {
            if (e.pointerType === "mouse") return;
            // Solo si el dedo se levanta DENTRO del botón: con el puntero
            // capturado, salirse y soltar fuera tiene que poder arrepentirse.
            const r = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            ) {
              return;
            }
            runAction();
          },
      onClick: instant
        ? undefined
        : () => {
            // Ya salió en `pointerup`; este es el `click` de compatibilidad.
            if (fired.current) {
              fired.current = false;
              return;
            }
            runAction();
          },
      style: { width: REVEAL_WIDTH },
    } satisfies React.ComponentProps<"button">,
  };
}
