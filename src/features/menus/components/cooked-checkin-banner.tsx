import { cookies } from "next/headers";

import { getWeekStart, todayLocalISO } from "@/lib/dates";
import {
  getMenuPrefs,
  getPendingCheckinEntries,
  type PendingCheckinEntry,
} from "../queries";
import { activeSlots, type SlotDef } from "../slots";
import { CookedCheckinCard } from "./cooked-checkin-card";

/**
 * Decide en el SERVIDOR si toca preguntar por los platos pasados (R3). Se monta
 * en el shell, así que se evalúa en todas las páginas de la app: por eso lo
 * barato va primero (las cookies no cuestan consultas) y las queries solo se
 * hacen si de verdad puede haber tarjeta.
 *
 * Cuatro condiciones, todas necesarias:
 *   1. El hogar tiene el repaso activo (`checkin_enabled`, true sin fila).
 *   2. La X de hoy no está pulsada en este dispositivo (snooze diario).
 *   3. No se ha silenciado esta semana en este dispositivo.
 *   4. Hay platos pendientes.
 *
 * Si algo falla, devuelve null: una tarjeta opcional no puede tumbar el shell.
 */
async function loadCheckin(): Promise<{
  entries: PendingCheckinEntry[];
  slots: SlotDef[];
} | null> {
  try {
    const cookieStore = await cookies();
    if (cookieStore.get("menu_checkin_snooze")?.value === todayLocalISO()) {
      return null;
    }
    if (
      cookieStore.get("menu_checkin_silenced_week")?.value === getWeekStart()
    ) {
      return null;
    }

    const prefs = await getMenuPrefs();
    if (!prefs.checkinEnabled) return null;

    const entries = await getPendingCheckinEntries();
    if (entries.length === 0) return null;

    return { entries, slots: activeSlots(prefs.planBreakfast) };
  } catch {
    return null;
  }
}

export async function CookedCheckinBanner() {
  const data = await loadCheckin();
  if (!data) return null;
  return <CookedCheckinCard entries={data.entries} slots={data.slots} />;
}
