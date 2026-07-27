import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/features/household/queries";
import type { MenuRuleKind } from "./rules";

export type MealSlot = "lunch" | "dinner";

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
      "id, date, meal_slot, position, recipe_id, free_text, cooked_at, source, pinned, recipe:recipes(name, is_saved, source)",
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
      "menu_id, id, date, meal_slot, position, recipe_id, free_text, cooked_at, source, pinned, recipe:recipes(name, is_saved, source)",
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

/** Regla del menú tal como la consume la UI (con el nombre de la receta). */
export type MenuRule = {
  id: string;
  kind: MenuRuleKind;
  recipeId: string | null;
  recipeName: string | null;
  value: number | null;
  textRule: string | null;
  active: boolean;
  createdAt: string;
};

type MenuRuleRow = {
  id: string;
  kind: string;
  recipe_id: string | null;
  value: number | null;
  text_rule: string | null;
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
      "id, kind, recipe_id, value, text_rule, active, created_at, recipe:recipes(name)",
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
    .select("goal, diet_style, avoid_text, servings, plan_breakfast")
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
    configured: true,
  };
}

export type RecipeDetail = {
  name: string;
  description: string | null;
  servings: number;
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
};

export async function getRecipe(recipeId: string): Promise<RecipeDetail | null> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return null;
  const supabase = createServerSupabaseClient();
  const [{ data: recipe }, { data: ingredients }] = await Promise.all([
    supabase
      .from("recipes")
      .select("name, description, servings")
      .eq("household_id", householdId)
      .eq("id", recipeId)
      .maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select("name, quantity, unit")
      .eq("household_id", householdId)
      .eq("recipe_id", recipeId),
  ]);
  if (!recipe) return null;
  return {
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings,
    ingredients: (ingredients ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity === null ? null : Number(i.quantity),
      unit: i.unit,
    })),
  };
}
