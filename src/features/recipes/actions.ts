"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import type { Database } from "@/lib/supabase/types";
import { getCurrentHousehold } from "@/features/household/queries";
import {
  ratingSchema,
  recipeInputSchema,
  type RecipeInput,
  type RecipeIngredientInput,
} from "./schemas";
import { getSeedRecipeById } from "./seed";

export type RecipeActionState = { error?: string; ok?: boolean; id?: string };

type Supabase = SupabaseClient<Database>;

/**
 * Construye las filas de recipe_ingredients vinculando cada ingrediente a un
 * producto del catálogo del hogar si su nombre normalizado coincide (así el
 * generador de menús sabrá qué hay en stock). Una sola consulta al catálogo.
 */
async function buildIngredientRows(
  supabase: Supabase,
  householdId: string,
  recipeId: string,
  ingredients: RecipeIngredientInput[],
) {
  const norms = [
    ...new Set(ingredients.map((i) => normalizeName(i.name)).filter(Boolean)),
  ];
  const explicitIds = [
    ...new Set(
      ingredients
        .map((i) => i.productId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  // Fallback por nombre normalizado (texto libre sin vínculo explícito).
  const productByNorm = new Map<string, string>();
  if (norms.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, normalized_name")
      .eq("household_id", householdId)
      .in("normalized_name", norms);
    for (const p of products ?? []) productByNorm.set(p.normalized_name, p.id);
  }

  // Valida que los ids explícitos (F3) pertenecen al hogar antes de confiar en ellos.
  const validIds = new Set<string>();
  if (explicitIds.length > 0) {
    const { data: owned } = await supabase
      .from("products")
      .select("id")
      .eq("household_id", householdId)
      .in("id", explicitIds);
    for (const p of owned ?? []) validIds.add(p.id);
  }

  return ingredients.map((i) => {
    // El id explícito y validado tiene prioridad; si no, matching por nombre.
    const explicit = i.productId && validIds.has(i.productId) ? i.productId : null;
    return {
      recipe_id: recipeId,
      household_id: householdId,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      optional: i.optional,
      product_id: explicit ?? productByNorm.get(normalizeName(i.name)) ?? null,
    };
  });
}

/** Valida la entrada descartando filas de ingrediente sin nombre. */
function parseInput(input: RecipeInput) {
  return recipeInputSchema.safeParse({
    ...input,
    ingredients: (input.ingredients ?? []).filter((i) => i?.name?.trim()),
  });
}

/** Comprueba si ya existe otra receta guardada con el mismo nombre normalizado. */
async function findSavedDuplicate(
  supabase: Supabase,
  householdId: string,
  normalized: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase
    .from("recipes")
    .select("id")
    .eq("household_id", householdId)
    .eq("normalized_name", normalized)
    .eq("is_saved", true);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

export async function createRecipeAction(
  input: RecipeInput,
): Promise<RecipeActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const parsed = parseInput(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  const supabase = createServerSupabaseClient();
  const normalized = normalizeName(d.name);

  if (await findSavedDuplicate(supabase, household.id, normalized)) {
    return { error: "Ya tienes una receta con ese nombre en tu recetario." };
  }

  const { data: recipe, error: insErr } = await supabase
    .from("recipes")
    .insert({
      household_id: household.id,
      name: d.name,
      normalized_name: normalized,
      description: d.description,
      servings: d.servings,
      prep_minutes: d.prepMinutes,
      meal_types: d.mealTypes,
      seasons: d.seasons,
      instructions: d.instructions,
      source: "manual",
      is_saved: true,
      created_by: userId,
    })
    .select("id")
    .single();
  if (insErr || !recipe) return { error: "No se pudo crear la receta." };

  if (d.ingredients.length > 0) {
    const rows = await buildIngredientRows(
      supabase,
      household.id,
      recipe.id,
      d.ingredients,
    );
    const { error: ingErr } = await supabase
      .from("recipe_ingredients")
      .insert(rows);
    if (ingErr) {
      // Evita dejar una receta a medias sin sus ingredientes.
      await supabase.from("recipes").delete().eq("id", recipe.id);
      return { error: "No se pudieron guardar los ingredientes." };
    }
  }

  revalidatePath("/recetas");
  return { ok: true, id: recipe.id };
}

export async function updateRecipeAction(
  id: string,
  input: RecipeInput,
): Promise<RecipeActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const parsed = parseInput(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  const supabase = createServerSupabaseClient();
  const normalized = normalizeName(d.name);

  if (await findSavedDuplicate(supabase, household.id, normalized, id)) {
    return { error: "Ya tienes otra receta con ese nombre en tu recetario." };
  }

  const { error: updErr } = await supabase
    .from("recipes")
    .update({
      name: d.name,
      normalized_name: normalized,
      description: d.description,
      servings: d.servings,
      prep_minutes: d.prepMinutes,
      meal_types: d.mealTypes,
      seasons: d.seasons,
      instructions: d.instructions,
    })
    .eq("household_id", household.id)
    .eq("id", id);
  if (updErr) return { error: "No se pudo guardar la receta." };

  // Reemplaza los ingredientes por completo (más simple que diferenciar).
  await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("household_id", household.id)
    .eq("recipe_id", id);
  if (d.ingredients.length > 0) {
    const rows = await buildIngredientRows(
      supabase,
      household.id,
      id,
      d.ingredients,
    );
    const { error: ingErr } = await supabase
      .from("recipe_ingredients")
      .insert(rows);
    if (ingErr) return { error: "No se pudieron guardar los ingredientes." };
  }

  revalidatePath("/recetas");
  revalidatePath(`/recetas/${id}`);
  return { ok: true, id };
}

export async function deleteRecipeAction(
  id: string,
): Promise<RecipeActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  // menu_entries.recipe_id es ON DELETE SET NULL: el menú conserva el hueco
  // como texto vacío en vez de romperse.
  const { error } = await supabase
    .from("recipes")
    .delete()
    .eq("household_id", household.id)
    .eq("id", id);
  if (error) return { error: "No se pudo eliminar la receta." };
  revalidatePath("/recetas");
  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Adopta en el recetario una receta generada por la IA (is_saved = true). Fija
 * normalized_name y vincula sus ingredientes al catálogo. Es la vía natural de
 * poblar el recetario desde /menus.
 */
export async function saveGeneratedRecipeAction(
  recipeId: string,
): Promise<RecipeActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, name, is_saved")
    .eq("household_id", household.id)
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return { error: "No se encontró la receta." };
  if (recipe.is_saved) return { ok: true, id: recipe.id };

  const normalized = normalizeName(recipe.name);
  if (await findSavedDuplicate(supabase, household.id, normalized)) {
    return { error: "Ya tienes una receta con ese nombre en tu recetario." };
  }

  const { error: updErr } = await supabase
    .from("recipes")
    .update({ is_saved: true, normalized_name: normalized })
    .eq("household_id", household.id)
    .eq("id", recipeId);
  if (updErr) return { error: "No se pudo guardar en el recetario." };

  // Vincula a productos los ingredientes que aún no lo estaban.
  const { data: ings } = await supabase
    .from("recipe_ingredients")
    .select("id, name, product_id")
    .eq("household_id", household.id)
    .eq("recipe_id", recipeId);
  const unlinked = (ings ?? []).filter((i) => !i.product_id);
  if (unlinked.length > 0) {
    const norms = [
      ...new Set(unlinked.map((i) => normalizeName(i.name)).filter(Boolean)),
    ];
    if (norms.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, normalized_name")
        .eq("household_id", household.id)
        .in("normalized_name", norms);
      const byNorm = new Map(
        (products ?? []).map((p) => [p.normalized_name, p.id]),
      );
      for (const ing of unlinked) {
        const pid = byNorm.get(normalizeName(ing.name));
        if (pid) {
          await supabase
            .from("recipe_ingredients")
            .update({ product_id: pid })
            .eq("id", ing.id);
        }
      }
    }
  }

  revalidatePath("/recetas");
  revalidatePath("/menus");
  return { ok: true, id: recipeId };
}

/**
 * Importa una receta del pack curado del repo (N4) al recetario del hogar.
 * Inserta la receta (is_saved = true, source = 'seed') y sus ingredientes,
 * vinculando product_id SOLO por nombre normalizado exacto (nunca fuzzy: un
 * vínculo equivocado contaminaría lista y stock). Rechaza duplicados por nombre.
 */
export async function importSeedRecipeAction(
  seedId: string,
): Promise<RecipeActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const seed = getSeedRecipeById(seedId);
  if (!seed) return { error: "Receta no encontrada." };

  const supabase = createServerSupabaseClient();
  const normalized = normalizeName(seed.name);

  if (await findSavedDuplicate(supabase, household.id, normalized)) {
    return { error: "Ya tienes esta receta en tu recetario." };
  }

  const { data: recipe, error: insErr } = await supabase
    .from("recipes")
    .insert({
      household_id: household.id,
      name: seed.name,
      normalized_name: normalized,
      description: seed.description,
      servings: seed.servings,
      meal_types: seed.mealTypes,
      seasons: seed.seasons,
      source: "seed",
      is_saved: true,
      created_by: userId,
    })
    .select("id")
    .single();
  if (insErr || !recipe) return { error: "No se pudo importar la receta." };

  if (seed.ingredients.length > 0) {
    const rows = await buildIngredientRows(
      supabase,
      household.id,
      recipe.id,
      seed.ingredients.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        optional: false,
        productId: null,
      })),
    );
    const { error: ingErr } = await supabase
      .from("recipe_ingredients")
      .insert(rows);
    if (ingErr) {
      await supabase.from("recipes").delete().eq("id", recipe.id);
      return { error: "No se pudieron guardar los ingredientes." };
    }
  }

  revalidatePath("/recetas");
  revalidatePath("/menus");
  return { ok: true, id: recipe.id };
}

/**
 * Valora una receta (1–5) para el usuario actual. Upsert: cada miembro tiene
 * una sola valoración por receta (unique recipe_id, user_id). La media del
 * hogar se deriva por query (getRecipeRating / getRecipeSignals).
 */
export async function rateRecipeAction(
  recipeId: string,
  rating: number,
): Promise<RecipeActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  if (!userId) return { error: "Sesión no válida." };

  const parsed = ratingSchema.safeParse(rating);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Valoración no válida." };
  }

  const supabase = createServerSupabaseClient();

  // Comprueba que la receta existe y pertenece al hogar (RLS ya lo restringe).
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("household_id", household.id)
    .maybeSingle();
  if (!recipe) return { error: "No se encontró la receta." };

  const { error } = await supabase.from("recipe_ratings").upsert(
    {
      household_id: household.id,
      recipe_id: recipeId,
      user_id: userId,
      rating: parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "recipe_id,user_id" },
  );
  if (error) return { error: "No se pudo guardar la valoración." };

  revalidatePath("/recetas");
  revalidatePath(`/recetas/${recipeId}`);
  return { ok: true, id: recipeId };
}
