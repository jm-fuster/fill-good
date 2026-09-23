import "server-only";

import { auth } from "@clerk/nextjs/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { normalizeName } from "@/lib/normalize";
import type { UnitType } from "@/lib/supabase/types";
import { getActiveHouseholdId } from "@/features/household/queries";
import { getLatestUnitPrices } from "@/features/prices/queries";
import { computeRecipeCost, type CostIngredient, type RecipeCost } from "./cost";
import { SEED_RECIPES } from "./seed";

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
  /** Vínculo al catálogo (F3), si el ingrediente está enlazado a un producto. */
  productId: string | null;
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
  /** Pasos en orden. Vacío = la receta aún no dice cómo se hace. */
  steps: string[];
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
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, meal_types, seasons, recipe_ingredients(count)")
    .eq("household_id", householdId)
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

/** Tarjeta del pack curado para la sección "Explorar" (N4). */
export type SeedRecipeCard = {
  id: string;
  name: string;
  description: string;
  mealTypes: string[];
  seasons: string[];
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  /** true si el hogar ya tiene una receta guardada con ese nombre normalizado. */
  alreadySaved: boolean;
};

/**
 * Recetas del pack curado (N4) con el flag de si el hogar ya tiene cada una en
 * su recetario (por nombre normalizado). El JSON solo se lee en servidor: al
 * cliente solo llegan estas tarjetas.
 */
export async function getSeedRecipeCards(): Promise<SeedRecipeCard[]> {
  const householdId = await getActiveHouseholdId();
  // Sin hogar no hay recetario contra el que comparar: todas salen sin guardar.
  const savedNorms = new Set<string>();
  if (householdId) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("recipes")
      .select("normalized_name")
      .eq("household_id", householdId)
      .eq("is_saved", true);
    if (error) throw error;
    for (const r of data ?? []) {
      if (r.normalized_name) savedNorms.add(r.normalized_name);
    }
  }

  return SEED_RECIPES.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    mealTypes: r.mealTypes,
    seasons: r.seasons,
    vegetarian: r.vegetarian,
    vegan: r.vegan,
    glutenFree: r.glutenFree,
    alreadySaved: savedNorms.has(normalizeName(r.name)),
  }));
}

/** Receta guardada con lo que el generador de menús 2.0 (C3) necesita. */
export type SavedRecipeForMenu = {
  id: string;
  name: string;
  mealTypes: string[];
  seasons: string[];
  /** Raciones para las que están escritas las cantidades (y el coste, M7). */
  servings: number;
  /** Minutos de preparación declarados; null = sin dato. */
  prepMinutes: number | null;
  ingredients: { name: string; productId: string | null }[];
};

type SavedRecipeForMenuRow = {
  id: string;
  name: string;
  meal_types: string[] | null;
  seasons: string[] | null;
  servings: number | null;
  prep_minutes: number | null;
  recipe_ingredients: { name: string; product_id: string | null }[];
};

/**
 * Recetas guardadas del hogar con sus ingredientes (nombre + product_id), para
 * el generador de menús 2.0. El `product_id` permite saber qué ingredientes hay
 * en stock.
 *
 * `servings` viaja porque el coste (M7) está calculado para las raciones de la
 * receta: comparar dos recetas por su total sin dividir haría cara una para seis
 * y barata una para uno. `prepMinutes`, para poder dejar lo elaborado al fin de
 * semana.
 */
export async function getSavedRecipesForMenu(): Promise<SavedRecipeForMenu[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, name, meal_types, seasons, servings, prep_minutes, recipe_ingredients(name, product_id)",
    )
    .eq("household_id", householdId)
    .eq("is_saved", true);
  if (error) throw error;

  const rows = (data ?? []) as unknown as SavedRecipeForMenuRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    mealTypes: r.meal_types ?? [],
    seasons: r.seasons ?? ["all"],
    servings: r.servings && r.servings > 0 ? r.servings : 1,
    prepMinutes: r.prep_minutes,
    ingredients: (r.recipe_ingredients ?? []).map((i) => ({
      name: i.name,
      productId: i.product_id,
    })),
  }));
}

type CostIngredientRow = {
  recipe_id: string;
  product_id: string | null;
  quantity: number | null;
  unit: UnitType | null;
};

/**
 * Coste estimado (M7) de un conjunto de recetas por id. Una sola consulta de
 * ingredientes + el mapa de precios; sin N+1. Sirve para el listado del
 * recetario y para el coste del menú semanal (recetas guardadas o efímeras).
 */
export async function getRecipeCostsForIds(
  ids: string[],
): Promise<Map<string, RecipeCost>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();

  const householdId = await getActiveHouseholdId();
  if (!householdId) return new Map();
  const supabase = createServerSupabaseClient();
  // Las raciones van en la misma tanda: el importe se calcula para las
  // cantidades de la receta, así que sin ellas no se sabe para cuántos es.
  // Los ingredientes de mil en mil: /recetas pide el coste de todo el
  // recetario, y a unas ocho filas por receta pasa de mil hacia las 125.
  const [{ data: ings }, { data: recipeRows }, prices] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("recipe_ingredients")
        .select("recipe_id, product_id, quantity, unit")
        .eq("household_id", householdId)
        .in("recipe_id", uniqueIds)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    supabase
      .from("recipes")
      .select("id, servings")
      .eq("household_id", householdId)
      .in("id", uniqueIds),
    getLatestUnitPrices(),
  ]);
  const servingsById = new Map(
    (recipeRows ?? []).map((r) => [r.id, r.servings ?? 1]),
  );

  const byRecipe = new Map<string, CostIngredient[]>();
  for (const i of (ings ?? []) as CostIngredientRow[]) {
    const arr = byRecipe.get(i.recipe_id) ?? [];
    arr.push({
      productId: i.product_id,
      quantity: i.quantity === null ? null : Number(i.quantity),
      unit: i.unit,
    });
    byRecipe.set(i.recipe_id, arr);
  }

  const map = new Map<string, RecipeCost>();
  for (const id of uniqueIds) {
    map.set(
      id,
      computeRecipeCost(
        byRecipe.get(id) ?? [],
        prices,
        servingsById.get(id) ?? 1,
      ),
    );
  }
  return map;
}

/** Coste estimado de una sola receta (detalle). */
export async function getRecipeCost(recipeId: string): Promise<RecipeCost> {
  const map = await getRecipeCostsForIds([recipeId]);
  return (
    map.get(recipeId) ?? {
      total: 0,
      pricedCount: 0,
      totalCount: 0,
      complete: false,
      servings: 1,
    }
  );
}

type RecipeRow = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prep_minutes: number | null;
  meal_types: string[] | null;
  seasons: string[] | null;
  steps: string[] | null;
  is_saved: boolean;
};

/**
 * Receta guardada por id, con sus ingredientes, para editar. Devuelve null si
 * no existe, no es del hogar activo o no pertenece al recetario
 * (is_saved = false).
 */
export async function getRecipeForEdit(
  id: string,
): Promise<RecipeForEdit | null> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return null;
  const supabase = createServerSupabaseClient();
  const { data: recipe, error } = await supabase
    .from("recipes")
    .select(
      "id, name, description, servings, prep_minutes, meal_types, seasons, steps, is_saved",
    )
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;

  const row = recipe as RecipeRow | null;
  if (!row || !row.is_saved) return null;

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("name, quantity, unit, optional, product_id")
    .eq("household_id", householdId)
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
    steps: row.steps ?? [],
    ingredients: (ingredients ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity === null ? null : Number(i.quantity),
      unit: i.unit,
      optional: i.optional,
      productId: i.product_id,
    })),
  };
}

/**
 * Una receta para leerla mientras se cocina: los pasos y las cantidades, sin
 * nada de lo que solo sirve para editarla.
 *
 * La consumen las dos superficies que enseñan cómo se cocina un plato —la vista
 * del panel del menú (a través de `getRecipeCookingAction`) y el modo cocinado—,
 * y por eso vive aquí en vez de en cada una: si se separaran, una podría enseñar
 * un ingrediente que la otra no.
 */
export type RecipeCooking = {
  name: string;
  /** Raciones a las que corresponden las cantidades de abajo. */
  servings: number;
  prepMinutes: number | null;
  steps: string[];
  /**
   * Está en el recetario del hogar. Las efímeras (las que inventó la IA al
   * planificar la semana) no lo están, y eso decide si se puede enlazar a su
   * ficha: `/recetas/[id]` solo existe para las guardadas.
   */
  isSaved: boolean;
  ingredients: {
    name: string;
    quantity: number | null;
    unit: UnitType | null;
    optional: boolean;
  }[];
};

/**
 * Receta por id para cocinarla. null si no existe o no es del hogar activo.
 *
 * NO filtra por `is_saved`, al revés que `getRecipeForEdit`: el plato que la IA
 * inventó al planificar la semana es efímero y es justo el que nadie sabe
 * cocinar. Lo que se lee para cocinar no tiene por qué estar en el recetario.
 */
export async function getRecipeForCooking(
  recipeId: string,
): Promise<RecipeCooking | null> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return null;
  const supabase = createServerSupabaseClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, name, servings, prep_minutes, steps, is_saved")
    .eq("household_id", householdId)
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return null;

  const { data: ings } = await supabase
    .from("recipe_ingredients")
    .select("name, quantity, unit, optional")
    .eq("household_id", householdId)
    .eq("recipe_id", recipeId)
    .order("id", { ascending: true });

  return {
    name: recipe.name,
    servings: recipe.servings ?? 1,
    prepMinutes: recipe.prep_minutes,
    steps: recipe.steps ?? [],
    isSaved: recipe.is_saved,
    ingredients: (ings ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity === null ? null : Number(i.quantity),
      unit: i.unit,
      optional: i.optional,
    })),
  };
}

/**
 * Cuántas veces ha cocinado el hogar esta receta, contando las entradas de menú
 * marcadas. Es la MISMA cuenta de la que sale `timesCooked` en
 * `getRecipeSignals` —lo que evita que el generador repita lo de la semana
 * pasada—, no un contador aparte: el número que se celebra al terminar de
 * cocinar tiene que ser el número del que se fía la app.
 *
 * `head: true`: solo interesa el total, así que no viajan las filas.
 */
export async function getRecipeCookedCount(recipeId: string): Promise<number> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return 0;
  const supabase = createServerSupabaseClient();
  const { count } = await supabase
    .from("menu_entries")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("recipe_id", recipeId)
    .not("cooked_at", "is", null);
  return count ?? 0;
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
 * Valoraciones de una receta: media del hogar activo, nº de votos y el voto del
 * usuario actual.
 */
export async function getRecipeRating(
  recipeId: string,
): Promise<RecipeRatingSummary> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return { avg: null, count: 0, userRating: null };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("recipe_ratings")
    .select("rating, user_id")
    .eq("household_id", householdId)
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
    // Todo el historial de platos, de mil en mil: un hogar constante pasa de mil
    // entradas en año y pico, y sin orden ni paginar, lo que quedaba fuera podía
    // ser lo más reciente —`lastCookedAt` se quedaba viejo y el generador volvía
    // a proponer lo de la semana pasada—.
    fetchAllRows((from, to) =>
      supabase
        .from("menu_entries")
        .select("recipe_id, cooked_at")
        .eq("household_id", householdId)
        .in("recipe_id", ids)
        .order("id", { ascending: true })
        .range(from, to),
    ),
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
