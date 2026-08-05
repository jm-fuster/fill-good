import type { MealTypeValue, SeasonValue } from "./queries";

/** Etiquetas en español de los tipos de comida (breakfast existe en BD pero
 * la UI de recetas/menús usa comida/cena). */
export const MEAL_TYPE_LABELS: Record<string, string> = {
  lunch: "Comida",
  dinner: "Cena",
  breakfast: "Desayuno",
};

export const MEAL_TYPE_OPTIONS: { value: MealTypeValue; label: string }[] = [
  { value: "lunch", label: "Comida" },
  { value: "dinner", label: "Cena" },
];

export const SEASON_LABELS: Record<string, string> = {
  all: "Todo el año",
  winter: "Invierno",
  summer: "Verano",
};

export const SEASON_ICONS: Record<string, string> = {
  all: "🗓️",
  winter: "❄️",
  summer: "☀️",
};

export const SEASON_OPTIONS: { value: SeasonValue; label: string }[] = [
  { value: "all", label: "Todo el año" },
  { value: "winter", label: "Invierno" },
  { value: "summer", label: "Verano" },
];

/**
 * Lo que la app hace de verdad mientras escribe una receta, en su orden: reúne
 * el prompt con lo que la receta ya tiene escrito y le pide al modelo las
 * cantidades y los pasos. Dos mensajes y no cinco como los del menú, porque aquí
 * NO hay fase de contexto del hogar —ni inventario, ni lista, ni presupuesto—:
 * contar más pasos sería contar un trabajo que nadie hace.
 *
 * Cortos porque hay un tope MEDIDO, no por gusto. El botón comparte fila con
 * «Añadir paso» (136px) dentro de los 343px de ancho de contenido de un móvil de
 * 375, así que le quedan 199px — y el mensaje de progreso SUSTITUYE a la etiqueta
 * mientras se genera, así que es él quien fija el ancho máximo del botón.
 *
 * Medido a 375px, con el ancho del botón en cada estado: «Escribir con IA» 151,
 * «Rehacer con IA» 156, «Leyendo la receta…» 182, «Escribiendo…» 142. El peor
 * caso deja 17px de aire, así que la fila NO se parte en ningún momento; y como
 * «Añadir paso» va primero, lo único que se mueve es el borde derecho del propio
 * botón. La versión anterior («Escribiendo los pasos…», 208px) sí la partía, y la
 * fila crecía 52px justo cuando el usuario está esperando.
 *
 * Si se alargan, hay que volver a medirlo: el `flex-wrap` de la fila evita el
 * desborde, pero no el salto.
 */
export const RECIPE_GENERATION_STEPS = [
  "Leyendo la receta…",
  "Escribiendo…",
] as const;

/** Media de valoración con coma decimal española (p. ej. 4.5 → "4,5"). */
export function formatRating(avg: number): string {
  return avg.toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Reduce el array `seasons` de la BD a una única elección para el formulario:
 * si contiene 'all' (o ambas estaciones, o nada) → "all"; si no, la estación
 * concreta guardada.
 */
export function seasonsToChoice(seasons: string[]): SeasonValue {
  if (!seasons || seasons.length === 0 || seasons.includes("all")) return "all";
  const hasWinter = seasons.includes("winter");
  const hasSummer = seasons.includes("summer");
  if (hasWinter && hasSummer) return "all";
  if (hasWinter) return "winter";
  if (hasSummer) return "summer";
  return "all";
}
