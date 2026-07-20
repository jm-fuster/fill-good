import "server-only";

import { auth } from "@clerk/nextjs/server";

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

/** Resumen de valoración de una receta para su página de detalle. */
export type RecipeRatingSummary = {
  /** Media del hogar (null si nadie ha votado aún). */
  avg: number | null;
  /** Número de miembros que han votado. */
  count: number;
  /** Valoración del usuario actual (null si no ha votado). */
  userRating: number | null;
};

/**
 * Valoraciones de una receta: media del hogar, nº de votos y el voto del
 * usuario actual. RLS limita las filas al hogar del usuario.
 */
export async function getRecipeRating(
  recipeId: string,
): Promise<RecipeRatingSummary> {
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("recipe_ratings")
    .select("rating, user_id")
    .eq("recipe_id", recipeId);
  if (error) throw error;

  const rows = data ?? [];
  const count = rows.length;
  const avg = count
    ? rows.reduce((sum, r) => sum + r.rating, 0) / count
    : null;
  const userRating = rows.find((r) => r.user_id === userId)?.rating ?? null;
  return { avg, count, userRating };
}

/**
 * Señales de uso por receta guardada, para /recetas y —sobre todo— para el
 * generador de menús 2.0 (C3).
 *
 * Combina el GUSTO explícito (recipe_ratings) con la APETENCIA implícita
 * derivada del uso real (menu_entries):
 *   · avgRating / ratingCount → cuánto gusta la receta al hogar (media 1–5).
 *   · timesPlanned            → cuántas veces se ha metido en un menú.
 *   · timesCooked             → cuántas de esas veces se marcó "Lo cocinamos".
 *   · lastCookedAt            → última fecha en que se cocinó (YYYY-MM-DD) o null.
 *
 * Interpretación para el generador (C3):
 *   - Apetencia alta = rating alto + hace tiempo que no se cocina. Es la
 *     candidata ideal: gusta y "toca" repetirla.
 *   - Una receta con rating alto pero cocinada hace muy poco (lastCookedAt
 *     reciente) debe DESCANSAR unos días aunque guste, para no repetir.
 *   - Una receta con rating bajo se propone con menos frecuencia aunque lleve
 *     tiempo sin hacerse.
 *   - timesPlanned vs timesCooked mide fiabilidad: algo muy planificado pero
 *     poco cocinado quizá no apetece tanto como su rating sugiere.
 * El generador NO debe tratar estos números como reglas duras: son pesos para
 * ordenar candidatas, no filtros absolutos (la temporada y las reglas del menú
 * sí filtran).
 */
export type RecipeSignals = {
  recipeId: string;
  name: string;
  avgRating: number | null;
  ratingCount: number;
  timesPlanned: number;
  timesCooked: number;
  lastCookedAt: string | null;
};

export async function getRecipeSignals(
  householdId: string,
): Promise<RecipeSignals[]> {
  const supabase = createServerSupabaseClient();

  const { data: recipes, error: recErr } = await supabase
    .from("recipes")
    .select("id, name")
    .eq("household_id", householdId)
    .eq("is_saved", true);
  if (recErr) throw recErr;

  const ids = (recipes ?? []).map((r) => r.id);
  if (ids.length === 0) return [];

  const [{ data: ratings }, { data: entries }] = await Promise.all([
    supabase
      .from("recipe_ratings")
      .select("recipe_id, rating")
      .eq("household_id", householdId)
      .in("recipe_id", ids),
    supabase
      .from("menu_entries")
      .select("recipe_id, cooked_at")
      .eq("household_id", householdId)
      .in("recipe_id", ids),
  ]);

  // Media y nº de votos por receta.
  const ratingAgg = new Map<string, { sum: number; count: number }>();
  for (const r of ratings ?? []) {
    if (!r.recipe_id) continue;
    const acc = ratingAgg.get(r.recipe_id) ?? { sum: 0, count: 0 };
    acc.sum += r.rating;
    acc.count += 1;
    ratingAgg.set(r.recipe_id, acc);
  }

  // Veces planificada / cocinada y última fecha de cocinado por receta.
  const useAgg = new Map<
    string,
    { planned: number; cooked: number; last: string | null }
  >();
  for (const e of entries ?? []) {
    if (!e.recipe_id) continue;
    const acc = useAgg.get(e.recipe_id) ?? {
      planned: 0,
      cooked: 0,
      last: null,
    };
    acc.planned += 1;
    if (e.cooked_at) {
      acc.cooked += 1;
      // Comparación lexicográfica válida para fechas ISO (YYYY-MM-DD).
      if (!acc.last || e.cooked_at > acc.last) acc.last = e.cooked_at;
    }
    useAgg.set(e.recipe_id, acc);
  }

  return (recipes ?? []).map((r) => {
    const rt = ratingAgg.get(r.id);
    const use = useAgg.get(r.id);
    return {
      recipeId: r.id,
      name: r.name,
      avgRating: rt && rt.count > 0 ? rt.sum / rt.count : null,
      ratingCount: rt?.count ?? 0,
      timesPlanned: use?.planned ?? 0,
      timesCooked: use?.cooked ?? 0,
      lastCookedAt: use?.last ?? null,
    };
  });
}
