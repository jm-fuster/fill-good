import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type MealSlot = "lunch" | "dinner";

export type MenuEntry = {
  id: string;
  date: string;
  slot: string;
  recipeId: string | null;
  recipeName: string | null;
  freeText: string | null;
};

export type WeekMenu = {
  id: string;
  generatedBy: string;
};

type EntryRow = {
  id: string;
  date: string;
  meal_slot: string;
  recipe_id: string | null;
  free_text: string | null;
  recipe: { name: string } | null;
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
    .select("id, date, meal_slot, recipe_id, free_text, recipe:recipes(name)")
    .eq("menu_id", menuId);
  if (error) throw error;

  const rows = (data ?? []) as unknown as EntryRow[];
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    slot: r.meal_slot,
    recipeId: r.recipe_id,
    recipeName: r.recipe?.name ?? null,
    freeText: r.free_text,
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
