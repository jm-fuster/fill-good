import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { slotLabel, type MealSlotKey } from "@/features/menus/slots";
import { getExpiryStatus, getWeekStart, shiftDays, todayLocalISO } from "@/lib/dates";
import type { Database } from "@/lib/supabase/types";

/**
 * Las consultas de SOLO LECTURA que contesta la skill: qué hay en la lista, qué
 * caduca y qué toca hoy de menú.
 *
 * Viven aquí y no en las `queries.ts` de cada feature porque aquellas leen con
 * el cliente de Clerk y el hogar activo de la cookie, y por voz no hay ninguna
 * de las dos cosas: el cliente es el service-role (sin RLS) y el hogar sale del
 * vínculo ya verificado. De ahí que cada consulta lleve su `household_id`
 * explícito — sin él saldrían mezclados los hogares de los que eres miembro.
 *
 * Devuelven datos, no frases: el texto lo pone `respond.ts`, como el resto.
 */

type Admin = SupabaseClient<Database>;

/** Nombre vivo de una fila que enlaza con el catálogo (ver `MergeResult.name`). */
function displayName(
  product: unknown,
  fallback: string | null,
): string | null {
  const name = (product as { name: string } | null)?.name;
  return name ?? fallback;
}

/**
 * Los artículos pendientes de la lista activa, en el orden de la lista.
 *
 * **No crea la lista activa** si no hay ninguna, al contrario que el apuntado:
 * una pregunta no debe dejar rastro. Sin lista, no hay nada que leer.
 */
export async function readShoppingList(
  admin: Admin,
  householdId: string,
): Promise<string[]> {
  const { data: list } = await admin
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!list) return [];

  const { data } = await admin
    .from("shopping_list_items")
    .select("name, product:products(name)")
    .eq("household_id", householdId)
    .eq("list_id", list.id)
    .eq("is_checked", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  // El nombre lo manda el producto y la columna es el respaldo: el rótulo de la
  // fila es una copia del alta y puede haber quedado desfasado tras un
  // renombrado. El texto libre no tiene producto detrás, y ahí es lo único que
  // hay.
  return (data ?? [])
    .map((row) => displayName(row.product, row.name))
    .filter((name): name is string => name !== null);
}

export type ExpiringItem = { name: string; days: number };

/**
 * Lo que caduca dentro de la ventana de aviso, de lo más urgente a lo menos.
 * Misma consulta que el resumen diario por push, para que las dos vías digan lo
 * mismo. `days` es negativo en lo ya caducado.
 *
 * Se agrupa por producto quedándose con la fecha más próxima: dos lotes del
 * mismo yogur son una sola cosa de la que preocuparse, y recitar el nombre dos
 * veces suena a error.
 */
export async function readExpiring(
  admin: Admin,
  householdId: string,
  warnDays: number,
): Promise<ExpiringItem[]> {
  const { data } = await admin
    .from("inventory_items")
    .select("expiry_date, product:products(name)")
    .eq("household_id", householdId)
    .not("expiry_date", "is", null)
    .gt("quantity", 0)
    .lte("expiry_date", shiftDays(todayLocalISO(), warnDays))
    .order("expiry_date", { ascending: true });

  const porNombre = new Map<string, ExpiringItem>();
  for (const row of data ?? []) {
    const status = getExpiryStatus(row.expiry_date, warnDays);
    if (!status || status.status === "ok") continue;
    const name = displayName(row.product, null);
    if (name === null || porNombre.has(name)) continue;
    porNombre.set(name, { name, days: status.days });
  }
  return [...porNombre.values()];
}

export type MealToday = { slot: MealSlotKey; label: string; names: string[] };

/** Orden en que se cuentan las comidas del día, que no es el alfabético. */
const SLOT_ORDER: MealSlotKey[] = ["breakfast", "lunch", "dinner"];

/**
 * Lo planificado para hoy, por hueco de comida. `only` acota a uno solo cuando
 * la pregunta lo dice («qué hay de cena»).
 *
 * Lo saltado no cuenta: si ya dijiste que esa cena no la hacías, contestarla
 * sería repetir una decisión que ya tomaste.
 */
export async function readTodayMenu(
  admin: Admin,
  householdId: string,
  only: MealSlotKey | null,
): Promise<MealToday[]> {
  const { data: menu } = await admin
    .from("weekly_menus")
    .select("id")
    .eq("household_id", householdId)
    .eq("week_start", getWeekStart())
    .maybeSingle();
  if (!menu) return [];

  let query = admin
    .from("menu_entries")
    .select("meal_slot, free_text, recipe:recipes(name)")
    .eq("household_id", householdId)
    .eq("menu_id", menu.id)
    .eq("date", todayLocalISO())
    .is("skipped_at", null)
    .order("position", { ascending: true });
  if (only) query = query.eq("meal_slot", only);
  const { data } = await query;

  const porHueco = new Map<string, string[]>();
  for (const row of data ?? []) {
    const name = displayName(row.recipe, row.free_text);
    if (name === null) continue;
    porHueco.set(row.meal_slot, [...(porHueco.get(row.meal_slot) ?? []), name]);
  }

  return SLOT_ORDER.filter((slot) => porHueco.has(slot)).map((slot) => ({
    slot,
    label: slotLabel(slot),
    names: porHueco.get(slot) ?? [],
  }));
}
