/**
 * Racha sin desperdicio (G3): semanas seguidas sin tirar nada. Módulo neutro
 * (sin I/O) como `savings.ts` o `trip-comparison.ts`.
 *
 * El tono es la mitad del diseño de esta mecánica, y va cableado aquí en forma
 * de qué se calcula:
 *
 *  · Se celebra la racha, nunca se persigue. Por eso se devuelve también la
 *    MEJOR racha histórica: al romperse, el mensaje puede ser "tu mejor racha
 *    fueron 8 semanas" en vez de un contador a cero con culpa. Un logro
 *    conseguido no deja de existir porque hoy hayas tirado un yogur.
 *  · Semanas rodantes de 7 días, no semanas de calendario: "llevas 2 semanas"
 *    debe significar catorce días, sin que un descarte en domingo cuente
 *    distinto que uno en lunes.
 *
 * OJO con el incentivo perverso que acecha a esta mecánica: si tirar comida
 * "castiga", el usuario aprende a NO registrar los descartes, y entonces se
 * corrompe el dato que alimenta el resto de la app (el desperdicio en euros del
 * panel de gasto, y de rebote la confianza en todo lo demás). De ahí que en
 * ninguna parte de la UI el descarte se presente como un fracaso.
 */

import { baseUnitFactor, unitFamily } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Valor en € de una cantidad tirada, según el último precio conocido de ese
 * producto. Devuelve 0 cuando no hay precio o cuando las unidades pertenecen a
 * familias distintas: ud↔peso jamás se convierte (no se adivina el peso de una
 * unidad), así que preferimos no valorar antes que inventar una cifra.
 *
 * Vive aquí, y no duplicado en cada consumidor, porque el desperdicio en euros
 * se muestra en varios sitios y dos copias de esta fórmula acabarían dando
 * números distintos para el mismo dato.
 */
export function valueDiscard(
  event: { quantity: number; unit: UnitType },
  price: { price: number; unit: UnitType } | undefined,
): number {
  if (!price) return 0;
  if (unitFamily(price.unit) !== unitFamily(event.unit)) return 0;
  const value =
    (price.price / baseUnitFactor(price.unit)) *
    (Number(event.quantity) * baseUnitFactor(event.unit));
  return value > 0 ? value : 0;
}

export type WasteStreak = {
  /** Semanas completas seguidas sin ningún descarte. */
  currentWeeks: number;
  /** La racha más larga que ha tenido el hogar, en semanas completas. */
  bestWeeks: number;
  /** true = la racha en curso iguala o supera a la mejor marca anterior. */
  isBest: boolean;
};

function weeksBetween(fromMs: number, toMs: number): number {
  if (!(toMs > fromMs)) return 0;
  return Math.floor((toMs - fromMs) / MS_PER_WEEK);
}

/**
 * @param discardDates  Fechas de los descartes (`inventory_events.kind =
 *                      'discarded'`), en cualquier orden.
 * @param firstActivity Primer movimiento de inventario del hogar. Ancla la racha
 *                      de quien nunca ha tirado nada: sin este tope, un hogar
 *                      creado ayer presumiría de una racha de años.
 * @param now           Momento de referencia.
 *
 * Devuelve null si no hay actividad de la que hablar; la UI entonces no muestra
 * nada, que es mejor que un "0 semanas" sin contexto.
 */
export function computeWasteStreak(
  discardDates: string[],
  firstActivity: string | null,
  now: Date,
): WasteStreak | null {
  if (!firstActivity) return null;
  const startMs = new Date(firstActivity).getTime();
  const nowMs = now.getTime();
  if (Number.isNaN(startMs)) return null;

  const times = discardDates
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  // Sin descartes: la racha es todo el tiempo que el hogar lleva registrando.
  if (times.length === 0) {
    const weeks = weeksBetween(startMs, nowMs);
    return { currentWeeks: weeks, bestWeeks: weeks, isBest: true };
  }

  // Huecos: desde el primer movimiento al primer descarte, entre descartes
  // consecutivos, y desde el último descarte hasta ahora (la racha en curso).
  let bestPrevious = weeksBetween(startMs, times[0]);
  for (let i = 1; i < times.length; i += 1) {
    const gap = weeksBetween(times[i - 1], times[i]);
    if (gap > bestPrevious) bestPrevious = gap;
  }

  const currentWeeks = weeksBetween(times[times.length - 1], nowMs);

  return {
    currentWeeks,
    bestWeeks: Math.max(bestPrevious, currentWeeks),
    isBest: currentWeeks > 0 && currentWeeks >= bestPrevious,
  };
}
