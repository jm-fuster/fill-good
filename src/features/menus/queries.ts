import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
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

export async function getWeekMenu(weekStart: string): Promise<WeekMenu | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("weekly_menus")
    .select("id, generated_by")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, generatedBy: data.generated_by } : null;
}

export async function getMenuEntries(menuId: string): Promise<MenuEntry[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_entries")
    .select(
      "id, date, meal_slot, position, recipe_id, free_text, cooked_at, source, pinned, recipe:recipes(name, is_saved, source)",
    )
    .eq("menu_id", menuId)
    .order("date", { ascending: true })
    .order("meal_slot", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as EntryRow[];
  return rows.map((r) => ({
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
  }));
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
 * Reglas del hogar (activas e inactivas) para la sección "Reglas del menú".
 * Devolver también las inactivas permite reactivarlas desde la UI. RLS limita
 * las filas al hogar del usuario.
 */
export async function getMenuRules(): Promise<MenuRule[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_rules")
    .select(
      "id, kind, recipe_id, value, text_rule, active, created_at, recipe:recipes(name)",
    )
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

export type RecipeDetail = {
  name: string;
  description: string | null;
  servings: number;
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
};

export async function getRecipe(recipeId: string): Promise<RecipeDetail | null> {
  const supabase = createServerSupabaseClient();
  const [{ data: recipe }, { data: ingredients }] = await Promise.all([
    supabase
      .from("recipes")
      .select("name, description, servings")
      .eq("id", recipeId)
      .maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select("name, quantity, unit")
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
