import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/features/household/queries";
import { shiftDays, todayLocalISO } from "@/lib/dates";
import type { MenuRuleKind } from "./rules";

export type MenuEntry = {
  id: string;
  date: string;
  slot: string;
  position: number;
  recipeId: string | null;
  recipeName: string | null;
  recipeIsSaved: boolean | null;
  recipeSource: string | null;
  freeText: string | null;
  cookedAt: string | null;
  /**
   * Se planificó pero NO se cocinó (R2). Excluyente con `cookedAt`: la fecha es
   * la de la entrada, no la del momento de contestar. Sin resolver = las dos a
   * null, y de eso es de lo que pregunta el repaso.
   */
  skippedAt: string | null;
  /** Origen de la entrada: 'manual' | 'ai' (N2). Protege lo manual al regenerar. */
  source: string;
  /** El usuario la fija: la regeneración nunca la toca (N2). */
  pinned: boolean;
};

export type WeekMenu = {
  id: string;
  generatedBy: string;
};

type EntryRow = {
  id: string;
  date: string;
  meal_slot: string;
  position: number;
  recipe_id: string | null;
  free_text: string | null;
  cooked_at: string | null;
  skipped_at: string | null;
  source: string;
  pinned: boolean;
  recipe: { name: string; is_saved: boolean; source: string } | null;
};

function mapEntryRow(r: EntryRow): MenuEntry {
  return {
    id: r.id,
    date: r.date,
    slot: r.meal_slot,
    position: r.position,
    recipeId: r.recipe_id,
    recipeName: r.recipe?.name ?? null,
    recipeIsSaved: r.recipe?.is_saved ?? null,
    recipeSource: r.recipe?.source ?? null,
    freeText: r.free_text,
    cookedAt: r.cooked_at,
    skippedAt: r.skipped_at,
    source: r.source,
    pinned: r.pinned,
  };
}

export async function getWeekMenu(weekStart: string): Promise<WeekMenu | null> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return null;
  const supabase = createServerSupabaseClient();
  // El filtro por hogar no es solo cosmético: la unicidad de `week_start` es POR
  // hogar, así que sin él un usuario con dos hogares que tengan menú esa semana
  // recibía dos filas y `.maybeSingle()` fallaba.
  const { data, error } = await supabase
    .from("weekly_menus")
    .select("id, generated_by")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, generatedBy: data.generated_by } : null;
}

export async function getMenuEntries(menuId: string): Promise<MenuEntry[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_entries")
    .select(
      "id, date, meal_slot, position, recipe_id, free_text, cooked_at, skipped_at, source, pinned, recipe:recipes(name, is_saved, source)",
    )
    .eq("household_id", householdId)
    .eq("menu_id", menuId)
    .order("date", { ascending: true })
    .order("meal_slot", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as EntryRow[];
  return rows.map(mapEntryRow);
}

export type WeekMenuWithEntries = {
  menu: WeekMenu | null;
  entries: MenuEntry[];
};

/**
 * Menús y entradas de VARIAS semanas de una vez (aplana el waterfall de /menus:
 * antes eran hasta 5 tandas secuenciales). Dos queries: los menús de todas las
 * semanas pedidas y, en un solo `.in`, todas sus entradas. Devuelve un mapa
 * week_start → { menu, entries } con una entrada por cada semana pedida (menu
 * null y entries vacío si esa semana no tiene menú).
 */
export async function getWeekMenusWithEntries(
  weeks: string[],
): Promise<Map<string, WeekMenuWithEntries>> {
  const result = new Map<string, WeekMenuWithEntries>();
  for (const w of weeks) result.set(w, { menu: null, entries: [] });
  if (weeks.length === 0) return result;

  const householdId = await getActiveHouseholdId();
  if (!householdId) return result;
  const supabase = createServerSupabaseClient();
  const { data: menus, error: menusErr } = await supabase
    .from("weekly_menus")
    .select("id, generated_by, week_start")
    .eq("household_id", householdId)
    .in("week_start", weeks);
  if (menusErr) throw menusErr;
  if (!menus || menus.length === 0) return result;

  const weekByMenuId = new Map<string, string>();
  for (const m of menus) {
    weekByMenuId.set(m.id, m.week_start);
    result.set(m.week_start, {
      menu: { id: m.id, generatedBy: m.generated_by },
      entries: [],
    });
  }

  const { data, error } = await supabase
    .from("menu_entries")
    .select(
      "menu_id, id, date, meal_slot, position, recipe_id, free_text, cooked_at, skipped_at, source, pinned, recipe:recipes(name, is_saved, source)",
    )
    .eq("household_id", householdId)
    .in("menu_id", [...weekByMenuId.keys()])
    .order("date", { ascending: true })
    .order("meal_slot", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as (EntryRow & { menu_id: string })[];
  for (const r of rows) {
    const week = weekByMenuId.get(r.menu_id);
    if (!week) continue;
    result.get(week)!.entries.push(mapEntryRow(r));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Repaso de cocinado (R2)
// ---------------------------------------------------------------------------

/** Plato pasado del que aún no se sabe si se cocinó, tal como lo lista el repaso. */
export type PendingCheckinEntry = {
  id: string;
  date: string;
  slot: string;
  /** Nombre de la receta o el texto libre: lo que hay que enseñar en la fila. */
  name: string;
  /** Con receta hay descuento de inventario que proponer; con texto libre no. */
  recipeId: string | null;
};

/** Días hacia atrás que abarca el repaso. */
const CHECKIN_WINDOW_DAYS = 7;

/**
 * Platos del hogar activo pendientes de repaso: días ya pasados (nunca hoy: la
 * cena aún no ha ocurrido) sin `cooked_at` ni `skipped_at`, dentro de una ventana
 * de una semana. El rango CRUZA semanas a propósito —un lunes, el domingo
 * pendiente pertenece al menú de la semana anterior—, así que no se filtra por
 * `menu_id`. Lo resuelve el índice parcial `menu_entries_pending_checkin_idx`.
 *
 * Degrada en suave: si la consulta falla (p. ej. la migración aún no está
 * aplicada) devuelve lista vacía en vez de tumbar la página que la pide.
 */
export async function getPendingCheckinEntries(): Promise<PendingCheckinEntry[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const today = todayLocalISO();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_entries")
    .select("id, date, meal_slot, position, recipe_id, free_text, recipe:recipes(name)")
    .eq("household_id", householdId)
    .gte("date", shiftDays(today, -CHECKIN_WINDOW_DAYS))
    .lt("date", today)
    .is("cooked_at", null)
    .is("skipped_at", null)
    .order("date", { ascending: true })
    .order("meal_slot", { ascending: true })
    .order("position", { ascending: true });
  if (error) return [];

  const rows = (data ?? []) as unknown as {
    id: string;
    date: string;
    meal_slot: string;
    recipe_id: string | null;
    free_text: string | null;
    recipe: { name: string } | null;
  }[];
  return rows
    .map((r) => ({
      id: r.id,
      date: r.date,
      slot: r.meal_slot,
      name: r.recipe?.name ?? r.free_text ?? "",
      recipeId: r.recipe_id,
    }))
    // Una entrada sin nombre no se puede preguntar ("¿cocinaste …?").
    .filter((e) => e.name !== "");
}

/** Regla del menú tal como la consume la UI (con el nombre de la receta). */
export type MenuRule = {
  id: string;
  kind: MenuRuleKind;
  recipeId: string | null;
  recipeName: string | null;
  value: number | null;
  textRule: string | null;
  /** Solo en 'skip_slot': 0 = lunes … 6 = domingo. */
  weekday: number | null;
  /** Solo en 'skip_slot': el hueco que no se planifica. */
  mealSlot: string | null;
  active: boolean;
  createdAt: string;
};

type MenuRuleRow = {
  id: string;
  kind: string;
  recipe_id: string | null;
  value: number | null;
  text_rule: string | null;
  weekday: number | null;
  meal_slot: string | null;
  active: boolean;
  created_at: string;
  recipe: { name: string } | null;
};

/**
 * Reglas del hogar ACTIVO (activas e inactivas) para la sección "Reglas del
 * menú". Devolver también las inactivas permite reactivarlas desde la UI.
 */
export async function getMenuRules(): Promise<MenuRule[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_rules")
    .select(
      "id, kind, recipe_id, value, text_rule, weekday, meal_slot, active, created_at, recipe:recipes(name)",
    )
    .eq("household_id", householdId)
    .order("active", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as MenuRuleRow[];
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as MenuRuleKind,
    recipeId: r.recipe_id,
    recipeName: r.recipe?.name ?? null,
    value: r.value,
    textRule: r.text_rule,
    weekday: r.weekday,
    mealSlot: r.meal_slot,
    active: r.active,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Preferencias del menú del hogar (N3)
// ---------------------------------------------------------------------------

export type MenuGoal = "balanced" | "light" | "muscle" | "gain";
export type DietStyle = "omnivore" | "vegetarian" | "vegan" | "gluten_free";

export type MenuPrefs = {
  goal: MenuGoal;
  dietStyle: DietStyle;
  avoidText: string | null;
  servings: number;
  planBreakfast: boolean;
  /**
   * El repaso proactivo de platos pasados está activo para el hogar (R3). Sin
   * fila de preferencias vale `true`: el repaso es la razón de ser de la feature
   * y quien no lo quiera lo apaga.
   */
  checkinEnabled: boolean;
  /** Si existe fila: el onboarding ya se resolvió (aunque fuese "Ahora no"). */
  configured: boolean;
};

/** Defaults del perfil de menús cuando el hogar aún no lo ha configurado. */
export const DEFAULT_MENU_PREFS: MenuPrefs = {
  goal: "balanced",
  dietStyle: "omnivore",
  avoidText: null,
  servings: 2,
  planBreakfast: false,
  checkinEnabled: true,
  configured: false,
};

/**
 * Preferencias del menú del hogar ACTIVO. Sin fila → defaults con
 * `configured: false` (el generador se comporta como antes y la UI ofrece el
 * onboarding). Sin el filtro por hogar, un usuario con preferencias en dos
 * hogares recibía dos filas y `.maybeSingle()` fallaba.
 */
export async function getMenuPrefs(): Promise<MenuPrefs> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return DEFAULT_MENU_PREFS;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("household_menu_prefs")
    .select(
      "goal, diet_style, avoid_text, servings, plan_breakfast, checkin_enabled",
    )
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_MENU_PREFS;
  return {
    goal: data.goal as MenuGoal,
    dietStyle: data.diet_style as DietStyle,
    avoidText: data.avoid_text,
    servings: data.servings,
    planBreakfast: data.plan_breakfast,
    checkinEnabled: data.checkin_enabled,
    configured: true,
  };
}

