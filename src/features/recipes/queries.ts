import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UnitType } from "@/lib/supabase/types";

export type MealTypeValue = "lunch" | "dinner";
export type SeasonValue = "all" | "winter" | "summer";

/** Tarjeta del listado del recetario. */
export type SavedRecipe = {
  id: string;
  name: string;
  mealTypes: string[];
  seasons: string[];
  ingredientCount: number;
};

export type RecipeIngredient = {
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  optional: boolean;
};

/** Receta completa para el formulario de edición. */
export type RecipeForEdit = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  mealTypes: string[];
  seasons: string[];
  instructions: string | null;
  ingredients: RecipeIngredient[];
};

type SavedRecipeRow = {
  id: string;
  name: string;
  meal_types: string[] | null;
  seasons: string[] | null;
  recipe_ingredients: { count: number }[];
};

/** Recetas guardadas del hogar (las efímeras de la IA quedan fuera). */
export async function getSavedRecipes(): Promise<SavedRecipe[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, meal_types, seasons, recipe_ingredients(count)")
    .eq("is_saved", true)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as SavedRecipeRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    mealTypes: r.meal_types ?? [],
    seasons: r.seasons ?? [],
    ingredientCount: r.recipe_ingredients[0]?.count ?? 0,
  }));
}

type RecipeRow = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prep_minutes: number | null;
  meal_types: string[] | null;
  seasons: string[] | null;
  instructions: string | null;
  is_saved: boolean;
};

/**
 * Receta guardada por id, con sus ingredientes, para editar. Devuelve null si
 * no existe, la RLS la oculta o no pertenece al recetario (is_saved = false).
 */
export async function getRecipeForEdit(
  id: string,
): Promise<RecipeForEdit | null> {
  const supabase = createServerSupabaseClient();
  const { data: recipe, error } = await supabase
    .from("recipes")
    .select(
      "id, name, description, servings, prep_minutes, meal_types, seasons, instructions, is_saved",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;

  const row = recipe as RecipeRow | null;
  if (!row || !row.is_saved) return null;

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("name, quantity, unit, optional")
    .eq("recipe_id", id)
    .order("id", { ascending: true });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    servings: row.servings,
    prepMinutes: row.prep_minutes,
    mealTypes: row.meal_types ?? [],
    seasons: row.seasons ?? ["all"],
    instructions: row.instructions,
    ingredients: (ingredients ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity === null ? null : Number(i.quantity),
      unit: i.unit,
      optional: i.optional,
    })),
  };
}
