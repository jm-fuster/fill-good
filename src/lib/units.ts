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
