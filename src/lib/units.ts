import type { LocationType, UnitType } from "@/lib/supabase/types";

export const UNIT_LABELS: Record<UnitType, string> = {
  ud: "ud",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
};

export const UNIT_OPTIONS: { value: UnitType; label: string }[] = [
  { value: "ud", label: "Unidades" },
  { value: "g", label: "Gramos (g)" },
  { value: "kg", label: "Kilos (kg)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "l", label: "Litros (l)" },
];

/** Unidades que se cuentan de una en una (muestran stepper +/-). */
export function isCountable(unit: UnitType): boolean {
  return unit === "ud";
}

/**
 * Igual que {@link isCountable} pero admitiendo «sin unidad», que es como queda
 * un alta de texto libre sin producto de catálogo detrás: cuenta como contable
 * porque lo que se apunta ahí son piezas ("pan", "lechuga").
 */
export function isCountableOrUnset(unit: UnitType | null): boolean {
  return unit === null || unit === "ud";
}

/**
 * Cantidad con la que nace un artículo de la lista cuando el usuario no dice
 * ninguna. Los contables arrancan en 1 para que el stepper «− 1 +» esté a la
 * vista desde el principio: «sin cantidad» y «1» ya se comportaban igual al
 * finalizar la compra, así que era un estado invisible que solo servía para
 * esconder los controles.
 *
 * Los que se compran a granel (kg/g/l/ml) siguen naciendo sin cantidad: ahí sí
 * significa algo distinto de «1 kg» («tomates, ya veré cuántos cojo»).
 */
export function defaultListQuantity(unit: UnitType | null): number | null {
  return isCountableOrUnset(unit) ? 1 : null;
}

export type UnitFamily = "count" | "weight" | "volume";

/**
 * Familia física de una unidad. Solo se puede operar (convertir, comparar
 * precios) DENTRO de la misma familia: g↔kg y ml↔l son exactos, pero ud↔peso
 * jamás se convierte (no se adivina el peso de una unidad).
 */
export function unitFamily(unit: UnitType): UnitFamily {
  if (unit === "g" || unit === "kg") return "weight";
  if (unit === "ml" || unit === "l") return "volume";
  return "count";
}

/** Factor a la unidad base de su familia (g para peso, ml para volumen, ud). */
export function baseUnitFactor(unit: UnitType): number {
  return unit === "kg" || unit === "l" ? 1000 : 1;
}

export const LOCATION_LABELS: Record<LocationType, string> = {
  pantry: "Despensa",
  fridge: "Nevera",
  freezer: "Congelador",
  other: "Otros",
};

export const LOCATION_ICONS: Record<LocationType, string> = {
  pantry: "🧺",
  fridge: "🧊",
  freezer: "❄️",
  other: "📦",
};

export const LOCATION_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "pantry", label: "Despensa" },
  { value: "fridge", label: "Nevera" },
  { value: "freezer", label: "Congelador" },
  { value: "other", label: "Otros" },
];

/** Orden en que se muestran las ubicaciones en el inventario. */
export const LOCATION_ORDER: LocationType[] = [
  "fridge",
  "freezer",
  "pantry",
  "other",
];

/** Formatea una cantidad con su unidad: 1500 g → "1500 g", 1.5 → "1,5 kg". */
export function formatQuantity(qty: number, unit: UnitType): string {
  const n = Number(qty);
  const text = Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
  return `${text} ${UNIT_LABELS[unit]}`;
}
