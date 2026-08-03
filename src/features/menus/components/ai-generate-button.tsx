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
 * Lo mismo para un hueco suelto (`generateDishForSlot` → `buildRerollPrompt`),
 * que NO es la semana recortada: comparte el contexto del hogar (inventario,
 * recetario, reglas, lista de la compra) y además recibe los otros platos ya
 * puestos para no repetirlos, pero **no calcula presupuesto** —eso es una cuenta
 * de la semana entera—. Por eso aquí no aparece ese paso: si lo copiáramos de la
 * lista de arriba, el botón contaría un trabajo que nadie hace.
 */
export const SLOT_GENERATION_STEPS = [
  "Mirando lo que tienes en casa…",
  "Contando lo que ya está en la lista…",
  "Esquivando lo que ya hay esta semana…",
  "Buscando el plato…",
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
 * El botón de generar con IA: el primario de `/menus` y el del alta de un hueco.
 *
 * Tres estados encadenados, que son el ciclo completo de la acción:
 *
 *  1. **En reposo** el relleno late con `--ai-fill`, la firma de IA de la app.
 *     Es la única animación permanente del repo, justificada en `globals.css`.
 *  2. **Generando** el latido se queda fijo —el movimiento pasa al spinner de
 *     `Button loading`— y el texto cuenta por dónde va (`MENU_GENERATION_STEPS`
 *     para la semana, `SLOT_GENERATION_STEPS` para un hueco).
 *  3. **Al terminar** la recompensa la da la semana, no el botón: los días
 *     entran en cascada (ver `revealKey` en `menu-view.tsx`).
 *
 * El degradado va SOLO en el relleno: hubo una versión con un anillo de 2px
 * asomando por fuera y sobraba —el color ya lo dice el propio botón, y el filo
 * pedía un segundo token porque los tonos que lucen en un borde dejan el texto
 * por debajo de AA cuando los pones debajo de una etiqueta—.
 *
 * Accesibilidad: el texto que rota va `aria-hidden` y el nombre accesible lo
 * fija un `sr-only` con `busyLabel`. Si el texto visible fuera también el
 * nombre, un lector de pantalla recitaría los cinco pasos sobre un botón que
 * el usuario acaba de pulsar (y que tiene el foco). Así oye una sola cosa,
 * estable, y `aria-busy` —que ya pone `Button`— dice que está trabajando.
 */
export function AiGenerateButton({
  children,
  steps = MENU_GENERATION_STEPS,
  busyLabel,
  loading = false,
  disabled = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "asChild"> & {
  /** Mensajes de progreso mientras `loading`. */
  steps?: readonly string[];
  /** Nombre accesible estable mientras `loading`. */
  busyLabel: string;
}) {
  /*
    Late solo cuando de verdad se puede pulsar. Deshabilitado no puede seguir
    respirando: un control muerto que se mueve invita a pulsar lo que no
    responde. Generando tampoco, porque ahí el movimiento ya lo lleva el spinner
    y dos ritmos a la vez se pelean.
  */
  const breathing = !loading && !disabled;

  return (
    /*
      El degradado va en un `::before` y no en el `background` del botón porque
      lo que late es la opacidad, y latir el fondo del propio botón lo haría
      desaparecer a ratos (se leería justo como deshabilitado). Debajo del pseudo
      sigue estando el `bg-primary` sólido, así que lo que respira es el TINTE
      cálido y el botón nunca se queda sin fondo. Al ir dentro, además, se atenúa
      solo con el `disabled:opacity-50` del design system.

      `isolate` + `-z-10` es lo que coloca la capa entre el fondo del botón y su
      texto: dentro de un contexto de apilamiento se pinta primero el fondo del
      elemento, luego los descendientes con z-index negativo y solo después el
      contenido. Sin `isolate` la capa se escaparía por detrás del botón (hasta
      el contexto del ancestro) y no se vería nada.
    */
    <Button
      loading={loading}
      disabled={disabled}
      className={cn(
        "relative isolate",
        "before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-[image:var(--ai-fill)] before:content-['']",
        breathing ? "before:animate-ai-breathe" : "before:opacity-100",
        className,
      )}
      {...props}
    >
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
  );
}
