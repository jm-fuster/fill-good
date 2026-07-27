import * as React from "react";

/**
 * `useLayoutEffect` en cliente y `useEffect` en el render de servidor, donde no
 * existe (y React avisaría por consola). El módulo se evalúa una vez por
 * entorno, así que en el navegador SIEMPRE es la misma: no hay desajuste de
 * orden de hooks entre hidratación y renders posteriores.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * Anima un número desde `from` hasta `target` al montar, escribiendo el texto
 * **directamente en el nodo** en lugar de pasar por estado de React.
 *
 * Un `setState` por frame serían ~50 renders del árbol en menos de un segundo
 * solo para mover un contador; aquí el único trabajo por frame es asignar un
 * `textContent`. Por eso el nodo debe contener ese texto y nada más.
 *
 * El JSX tiene que renderizar YA el valor final: así es lo que se ve sin JS, con
 * movimiento reducido, y en el HTML del servidor. El efecto (de layout, antes de
 * pintar) es el único que baja el número al inicio para animarlo, de modo que no
 * hay parpadeo de la cifra final.
 */
export function useCountUp<T extends HTMLElement>(
  target: number,
  formatValue: (value: number) => string,
  {
    from = 0,
    durationMs = 800,
  }: { from?: number; durationMs?: number } = {},
): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node || target === from) return;
    // Accesibilidad: con movimiento reducido, la cifra final se queda quieta.
    // Se consulta aquí (y no con useMediaQuery) porque no hay que re-renderizar
    // si la preferencia cambia a media animación: es una decisión de arranque.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let startedAt: number | null = null;
    node.textContent = formatValue(from);

    const step = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / durationMs);
      // easeOutCubic: arranca rápido y frena al final, que es como se lee un
      // marcador (la cifra se "asienta" en vez de detenerse en seco).
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = formatValue(from + (target - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      // Si se desmonta (o cambia el objetivo) a media animación, el nodo no
      // puede quedarse congelado en una cifra intermedia que nadie ha ahorrado.
      node.textContent = formatValue(target);
    };
  }, [target, from, durationMs, formatValue]);

  return ref;
}
