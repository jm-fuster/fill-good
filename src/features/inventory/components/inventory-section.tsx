"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { usePersistedFlag } from "@/hooks/use-persisted-flag";
import { vibrateTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** Lo urgente que hay dentro de una sección: se resume en la cabecera. */
export type SectionUrgency = { expired: number; soon: number };

/**
 * Entrada escalonada de las tarjetas al desplegar: cada una asoma 30 ms después
 * de la anterior y de la sexta en adelante todas comparten el último paso, así
 * que **la cascada entera cabe en 300 ms** (150 de retardo máximo + 150 de
 * animación) — el techo que fija el styleguide. Sin ese tope, una despensa de
 * veinte artículos tardaría casi un segundo en acabar de existir.
 *
 * Va en el contenedor con `nth-child` y no envolviendo cada tarjeta: los
 * envoltorios se convertirían en los ítems de la rejilla y las tarjetas dejarían
 * de estirarse a la misma altura por fila. Solo `opacity`/`transform`, que es lo
 * que pide el styleguide (el compositor los resuelve sin recalcular layout).
 *
 * El retardo lo neutraliza `prefers-reduced-motion` desde `globals.css`; si
 * alguien quita ese reset, esto deja la lista en blanco un cuarto de segundo.
 */
const STAGGER = [
  // `fill-mode-backwards` NO es opcional: `animate-in` deja el fill-mode en
  // `none` (comprobado), así que durante su retardo la tarjeta se pintaría ya
  // visible y luego daría un salto a opacidad 0 al arrancar su animación. Con
  // `backwards` mantiene el primer fotograma hasta que le toca.
  "[&>*]:animate-in [&>*]:fade-in [&>*]:slide-in-from-top-1 [&>*]:duration-150 [&>*]:fill-mode-backwards",
  "[&>*:nth-child(2)]:[animation-delay:30ms]",
  "[&>*:nth-child(3)]:[animation-delay:60ms]",
  "[&>*:nth-child(4)]:[animation-delay:90ms]",
  "[&>*:nth-child(5)]:[animation-delay:120ms]",
  "[&>*:nth-child(n+6)]:[animation-delay:150ms]",
].join(" ");

/**
 * Sección del inventario ("Mis habituales" o una ubicación) con cabecera
 * pegajosa y plegable.
 *
 * Tres decisiones que no son de estilo:
 *
 * 1. **Plegado no es silenciado.** La cabecera lleva siempre el recuento de lo
 *    caducado y lo que caduca pronto que hay dentro, así que cerrar la despensa
 *    nunca esconde el aviso que justifica la app. Sin esto, plegar sería una
 *    forma de que se te pudra la comida sin enterarte.
 * 2. **Buscando o filtrando no se pliega** (`locked`): la sección se fuerza
 *    abierta y la cabecera deja de ser un botón. Si no, buscar «leche» con la
 *    nevera cerrada daría cero resultados a la vista y acabarías comprándola dos
 *    veces — justo lo contrario de lo que hace esta app.
 * 3. **El contenido se desmonta al plegar**, al revés que `CollapsibleFields`
 *    (que oculta con CSS porque su Server Action lee el formulario entero). Aquí
 *    no hay formulario y sí muchas tarjetas: cerrar tres ubicaciones baja de
 *    verdad lo que el móvil tiene que pintar. Por eso la cabecera no lleva
 *    `aria-controls`: apuntaría a un id que no existe estando plegada, y
 *    `aria-expanded` sobre un botón seguido de su contenido ya se anuncia bien.
 *
 * Y una de estilo que sí tiene motivo: **la línea inferior solo se pinta cuando
 * la cabecera está de verdad pegada**. Su trabajo es cerrar la banda mientras las
 * tarjetas pasan por debajo; quieta en su sitio no separa nada y con cuatro
 * ubicaciones eran cuatro reglas horizontales de ruido.
 */

/**
 * `true` mientras la cabecera está pegada al borde superior.
 *
 * Vigila un centinela de 1px colocado donde EMPIEZA la sección, no la propia
 * cabecera: con `threshold: 1` sobre la cabecera, un alto fraccionario (zoom,
 * densidad de pantalla) deja el ratio en 0,999 y la daría por pegada desde el
 * principio. El centinela es binario y no falla.
 *
 * El desplazamiento se lee del `top` ya resuelto en CSS (`env(safe-area)` en
 * móvil, 56px bajo el header de escritorio), así que el breakpoint no se duplica
 * aquí: si mañana cambia el alto del header, esto lo sigue solo.
 */
function useStuck(
  sentinelRef: React.RefObject<HTMLSpanElement | null>,
  headerRef: React.RefObject<HTMLElement | null>,
) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const header = headerRef.current;
    if (!sentinel || !header) return;

    let observer: IntersectionObserver | null = null;
    let current = -1;
    // Se rehace solo si el tope cambió de verdad: cruzar el breakpoint, girar el
    // móvil (el safe-area no es el mismo en horizontal) o cambiar el zoom.
    // Arrastrar el borde de una ventana no reconstruye nada.
    const attach = () => {
      const offset = Number.parseFloat(getComputedStyle(header).top) || 0;
      if (offset === current) return;
      current = offset;
      observer?.disconnect();
      observer = new IntersectionObserver(
        ([entry]) => setStuck(!entry.isIntersecting),
        // +1px: salta justo ANTES de pegarse, no un fotograma después.
        { rootMargin: `-${offset + 1}px 0px 0px 0px` },
      );
      observer.observe(sentinel);
    };
    attach();

    window.addEventListener("resize", attach);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", attach);
    };
  }, [sentinelRef, headerRef]);

  return stuck;
}
export function InventorySection({
  icon,
  title,
  count,
  urgency,
  storageKey,
  locked,
  children,
}: {
  /** Emoji de la ubicación o icono de "Mis habituales". Decorativo. */
  icon: React.ReactNode;
  title: string;
  count: number;
  /** Resumen de urgencia; `null` cuando un chip de estado ya lo dice todo. */
  urgency: SectionUrgency | null;
  /** Clave de `localStorage`: el plegado se recuerda por dispositivo. */
  storageKey: string;
  /** Hay búsqueda o chip activo: abierta a la fuerza y sin plegar. */
  locked: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = usePersistedFlag(storageKey);
  const open = locked || !collapsed;
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const headerRef = useRef<HTMLHeadingElement>(null);
  const stuck = useStuck(sentinelRef, headerRef);

  const summary = (
    <>
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center text-base leading-none"
      >
        {icon}
      </span>
      <span className="truncate">{title}</span>
      <span className="shrink-0 text-sm font-normal text-muted-foreground tabular-nums">
        ({count})
        <span className="sr-only"> artículos</span>
      </span>
      {/* Solo el número a la vista (la cabecera no puede crecer más en móvil);
          el lector de pantalla sí oye de qué va cada cifra.
          El tinte es /12 y no el /15 de los badges de la tarjeta: aquellos se
          apoyan en `bg-card` y estos en `bg-background`, donde el mismo 15% deja
          el rojo en 4,44:1 (medido) y se queda corto para AA. Con /12 sube a
          4,65 en claro y 5,51 en oscuro. */}
      {urgency && urgency.expired > 0 ? (
        <Badge className="bg-destructive/12 text-destructive tabular-nums">
          <TriangleAlert aria-hidden />
          {urgency.expired}
          <span className="sr-only">
            {urgency.expired === 1 ? "caducado" : "caducados"}
          </span>
        </Badge>
      ) : null}
      {urgency && urgency.soon > 0 ? (
        <Badge className="bg-warning/12 text-warning tabular-nums">
          <Clock aria-hidden />
          {urgency.soon}
          <span className="sr-only">
            {urgency.soon === 1 ? "caduca pronto" : "caducan pronto"}
          </span>
        </Badge>
      ) : null}
    </>
  );

  return (
    <section className="relative">
      {/* Centinela del borde superior de la sección. Absoluto: no ocupa hueco. */}
      <span ref={sentinelRef} aria-hidden className="absolute inset-x-0 top-0 h-px" />

      {/* Pegajosa: en listas largas la ubicación es el mapa mental de la casa,
          y perderla al hacer scroll es perder el «¿esto dónde está?».
          El tope NO es 0 en móvil: el manifiesto declara `viewport-fit: cover`,
          así que en la PWA instalada el contenido pasa por debajo de la barra de
          estado — una banda aparcada en 0 se quedaría bajo el reloj. Con el
          safe-area se detiene justo debajo (y en navegador el inset es 0, que es
          lo que había). En escritorio se apoya bajo el header del shell (h-14);
          es la MISMA utilidad `top-*`, así que la variante `md:` gana seguro sin
          depender del orden del CSS generado. El relleno inferior va DENTRO de
          la banda (pb-3, no mb-3) para que las tarjetas pasen tapadas, y el
          borde se reserva siempre en transparente: al aparecer no mueve nada. */}
      <h2
        ref={headerRef}
        className={cn(
          "sticky top-[env(safe-area-inset-top)] z-20 border-b bg-background/95 pb-3 text-base font-semibold backdrop-blur-sm transition-colors md:top-14",
          stuck ? "border-border" : "border-transparent",
        )}
      >
        {locked ? (
          <span className="flex h-11 items-center gap-2">{summary}</span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setCollapsed(!collapsed);
              vibrateTick();
            }}
            aria-expanded={open}
            className="group flex h-11 w-full items-center gap-2 rounded-lg text-left"
          >
            {summary}
            <ChevronDown
              aria-hidden
              className={cn(
                "ml-auto size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover:text-foreground motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </button>
        )}
      </h2>

      {open ? (
        <div
          className={cn(
            "flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-3",
            STAGGER,
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
