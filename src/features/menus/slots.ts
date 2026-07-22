/**
 * Huecos de comida del menú. Puro (sin I/O): lo comparten la vista, la ruta de
 * imagen y las Server Actions. Comida y cena son fijos; el desayuno depende de
 * la preferencia del hogar (N3). Merienda/snack quedan fuera de alcance.
 */

export type MealSlotKey = "breakfast" | "lunch" | "dinner";

export type SlotDef = { key: MealSlotKey; label: string };

const BREAKFAST: SlotDef = { key: "breakfast", label: "Desayuno" };
const LUNCH: SlotDef = { key: "lunch", label: "Comida" };
const DINNER: SlotDef = { key: "dinner", label: "Cena" };

/** Huecos activos según si el hogar planifica desayuno. */
export function activeSlots(planBreakfast: boolean): SlotDef[] {
  return planBreakfast ? [BREAKFAST, LUNCH, DINNER] : [LUNCH, DINNER];
}
