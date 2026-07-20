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
