"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cada cuánto avanza el mensaje de progreso. 1,8s es lo bastante lento para
 * leerse de un vistazo y lo bastante rápido para que una generación de ~8s
 * llegue al final de la lista sin quedarse a medias.
 */
const STEP_MS = 1800;

/**
 * Lo que la app hace de verdad mientras genera la semana, en el orden en que
 * lo hace: reúne el contexto del hogar (`loadHouseholdMenuContext`), reparte
 * los ingredientes en casa / apuntados / a comprar (`prompt-context.ts`),
 * puntúa el recetario con lo cocinado hace poco, calcula el objetivo semanal
 * (`week-budget.ts`) y por fin le pide la semana al modelo.
 *
 * Que sean pasos REALES es el punto: una espera de varios segundos con un
 * "Generando…" mudo no dice si la app está pensando o colgada, y un progreso
 * inventado sería una animación que miente. Si algún día cambia lo que se
 * mira antes del prompt, estos textos cambian con él.
 */
export const MENU_GENERATION_STEPS = [
  "Mirando lo que tienes en casa…",
  "Contando lo que ya está en la lista…",
  "Repasando qué habéis cocinado hace poco…",
  "Cuadrando el presupuesto de la semana…",
  "Escribiendo la semana…",
] as const;

/**
 * El mensaje de progreso, que avanza y **se queda en el último**: seguir
 * rotando en bucle fingiría un progreso que ya no existe (el modelo puede
 * tardar más que la lista de pasos), y volver al principio se leería como que
 * la app ha empezado otra vez.
 *
 * Vive en su propio componente y se monta solo mientras se genera: así el
 * contador vuelve a empezar en el primer paso en cada generación por el simple
 * hecho de montarse, sin un `setState` de reinicio dentro del efecto (que es
 * justo lo que el compilador de React desaconseja, y con razón: encadena
 * renders).
 */
function GenerationStep({ steps }: { steps: readonly string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      // Al llegar al final devuelve el mismo valor: React corta el re-render.
      setIndex((prev) => (prev + 1 < steps.length ? prev + 1 : prev));
    }, STEP_MS);
    return () => clearInterval(id);
  }, [steps.length]);

  return <span aria-hidden>{steps[Math.min(index, steps.length - 1)]}</span>;
}

/**
 * El botón de generar con IA: el primario de `/menus`.
 *
 * Tres estados encadenados, que son el ciclo completo de la acción:
 *
 *  1. **En reposo** el borde late con `--ai-glow` (la firma de IA de la app).
 *     Es la única animación permanente del repo, justificada en `globals.css`.
 *  2. **Generando** el latido se queda fijo —el movimiento pasa al spinner de
 *     `Button loading`— y el texto cuenta por dónde va (`MENU_GENERATION_STEPS`).
 *  3. **Al terminar** la recompensa la da la semana, no el botón: los días
 *     entran en cascada (ver `revealKey` en `menu-view.tsx`).
 *
 * Accesibilidad: el texto que rota va `aria-hidden` y el nombre accesible lo
 * fija un `sr-only` con `busyLabel`. Si el texto visible fuera también el
 * nombre, un lector de pantalla recitaría los cinco pasos sobre un botón que
 * el usuario acaba de pulsar (y que tiene el foco). Así oye una sola cosa,
 * estable, y `aria-busy` —que ya pone `Button`— dice que está trabajando.
 *
 * `className` va al CONTENEDOR, no al botón: el resplandor se dibuja fuera del
 * botón, así que quien coloca esto en un flex necesita que `flex-1` lo reciba
 * el envoltorio. El botón de dentro siempre ocupa el ancho completo.
 */
export function AiGenerateButton({
  children,
  steps = MENU_GENERATION_STEPS,
  busyLabel,
  loading = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "asChild"> & {
  /** Mensajes de progreso mientras `loading`. */
  steps?: readonly string[];
  /** Nombre accesible estable mientras `loading`. */
  busyLabel: string;
}) {
  return (
    <span className={cn("relative inline-flex", className)}>
      {/*
        El resplandor asoma 2px por fuera del botón en vez de empujarlo hacia
        dentro con un padding: así el touch target sigue midiendo lo que mide
        el botón (44px+) y el alto no cambia entre reposo y generación.
        El radio exterior compensa esos 2px para que la curva sea concéntrica.
      */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-0.5 rounded-[calc(var(--radius)+2px)] bg-[image:var(--ai-glow)]",
          loading ? "opacity-100" : "animate-ai-breathe",
        )}
      />
      <Button loading={loading} className="relative w-full" {...props}>
        {/* En `loading` el propio Button esconde este icono y saca el spinner. */}
        <Sparkles aria-hidden />
        {loading ? (
          <>
            <span className="sr-only">{busyLabel}</span>
            <GenerationStep steps={steps} />
          </>
        ) : (
          children
        )}
      </Button>
    </span>
  );
}
