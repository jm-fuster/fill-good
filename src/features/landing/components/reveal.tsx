"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * ÚNICO client component de la landing (§8 de la tarea). Revela su contenido al
 * entrar en el viewport con una transición contenida (opacity + translate).
 *
 * Regla de seguridad: el estado por defecto (SSR y sin JS) es VISIBLE. Solo al
 * montar en cliente, y solo si el usuario admite movimiento, se marca el estado
 * oculto (`data-reveal="hidden"`) sobre el propio nodo; así, sin JS o con
 * movimiento reducido, el contenido se ve igual. Trabaja de forma imperativa
 * sobre el ref (sin estado de React, sin re-renders) y solo con
 * IntersectionObserver, nunca con `window.addEventListener("scroll")`.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Retardo del reveal para escalonar elementos hermanos. */
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Movimiento reducido: no se oculta nada; el contenido queda visible.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    el.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.reveal = "shown";
            obs.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn(
        "motion-safe:transition motion-safe:duration-700 motion-safe:ease-out",
        "data-[reveal=hidden]:translate-y-4 data-[reveal=hidden]:opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
