"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import type { Database } from "@/lib/supabase/types";
import { classifyAiError } from "@/lib/ai/errors";
import { serverFailureMessage } from "@/lib/server-failure";
import { getModel } from "@/lib/ai/models";
import { enforceAiRateLimit, refundAiUsage } from "@/lib/ai/rate-limit";
import { buildRecipeDetailsPrompt } from "@/lib/ai/recipe-prompt";
import { recipeDetailsSchema } from "@/lib/ai/recipe-schema";
import { aiConsentError, getAiConsent } from "@/features/ai-consent/queries";
import { getCurrentHousehold } from "@/features/household/queries";
import {
  mergeGeneratedIngredients,
  sanitizeGeneratedSteps,
  sanitizePrepMinutes,
  type DraftIngredient,
} from "./ai-draft";
import { getRecipeForCooking, type RecipeCooking } from "./queries";
import {
  ratingSchema,
  recipeDetailsRequestSchema,
  recipeInputSchema,
  type RecipeDetailsRequest,
  type RecipeInput,
  type RecipeIngredientInput,
} from "./schemas";
import { getSeedRecipeById } from "./seed";

export type RecipeActionState = { error?: string; ok?: boolean; id?: string };

/** Cómo se cocina un plato, tal como sale de la IA y ya mezclado con lo que había. */
export type RecipeDetailsDraft = {
  prepMinutes: number | null;
  ingredients: DraftIngredient[];
  steps: string[];
};

export type RecipeDetailsState = {
  error?: string;
  /** El usuario no ha aceptado el aviso de IA: la pantalla debe ofrecerlo. */
  needsAiConsent?: boolean;
  details?: RecipeDetailsDraft;
};

/**
 * El tipo `RecipeCooking` vive en `queries.ts`, junto a la consulta que lo
 * devuelve, y quien lo necesite lo importa DE ALLÍ con `import type` —también
 * desde el cliente: un import de tipo se borra al compilar, así que nunca
 * arrastra el módulo `server-only` al navegador (es lo que ya hace la lista de
 * la compra con los suyos).
 *
 * Aquí NO se reexporta, y no es una preferencia de estilo: un
 * `export type { X }` en un módulo `"use server"` **rompe el módulo entero en
 * tiempo de ejecución**. El cargador de Server Actions de Next trata cada
 * exportación como un valor y genera una referencia a un binding que TypeScript
 * ya había borrado, así que la evaluación del módulo muere con
 * `ReferenceError: X is not defined` y con ella TODAS las acciones que esa
 * página tenga en su cargador — no solo la de al lado. Ni `tsc`, ni el lint, ni
 * `next build` lo ven: solo aparece al invocar una acción. Lo vigila
 * `npm run check:acciones`.
 */
export type RecipeCookingState = { error?: string; recipe?: RecipeCooking };

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
  /** Posición del primero: 0 al reemplazar la lista, el total al añadir. */
  startPosition = 0,
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

  return ingredients.map((i, index) => {
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
      // El orden en que se escribieron: sin él, las lecturas ordenaban por un
      // uuid aleatorio y la lista salía barajada en cada guardado.
      position: startPosition + index,
    };
  });
}

/**
 * Valida la entrada descartando las filas que el formulario deja vacías:
 * ingredientes sin nombre y pasos en blanco. Los pasos se recortan aquí y no en
 * el cliente porque la columna `steps` tiene prohibida la cadena vacía
 * (`recipes_steps_sin_vacios`): un paso en blanco que llegara a la escritura no
 * sería un texto feo, sería un error de Postgres perdiendo la receta entera.
 */
function parseInput(input: RecipeInput) {
  return recipeInputSchema.safeParse({
    ...input,
    ingredients: (input.ingredients ?? []).filter((i) => i?.name?.trim()),
    steps: (input.steps ?? []).filter((s) => s?.trim()),
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
      steps: d.steps,
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

  const { data: updated, error: updErr } = await supabase
    .from("recipes")
    .update({
      name: d.name,
      normalized_name: normalized,
      description: d.description,
      servings: d.servings,
      prep_minutes: d.prepMinutes,
      meal_types: d.mealTypes,
      seasons: d.seasons,
      steps: d.steps,
    })
    .eq("household_id", household.id)
    .eq("id", id)
    .select("id");
  if (updErr) return { error: "No se pudo guardar la receta." };
  /*
    Cero filas = la receta no es de ESTE hogar (la cookie del hogar activo
    cambió en otra pestaña) o ya no existe. Hay que pararse aquí: un update sin
    filas no es error para Supabase, y seguir insertaba los ingredientes con el
    `recipe_id` del cliente y el `household_id` del otro hogar —la RLS lo deja
    y la FK no mira hogares—, dejando filas huérfanas colgando de una receta
    ajena y respondiendo «Receta actualizada» sin haber cambiado nada.
  */
  if (!updated || updated.length === 0) {
    return { error: "Esa receta ya no está en este hogar." };
  }

  /*
    Los ingredientes se reemplazan enteros, pero PRIMERO se insertan los nuevos
    y solo después se borran los viejos.

    Al revés —que es como estaba— un fallo del insert dejaba la receta con CERO
    ingredientes: el borrado ya había ocurrido, aquí no hay transacción que lo
    deshaga y el mensaje que sale («No se pudieron guardar los ingredientes») se
    lee como «no se ha cambiado nada», así que ni siquiera invita a revisar.
    Basta un PGRST303 por desfase de reloj o una cantidad de nueve cifras que
    desborde `numeric(10,2)` para vaciar una receta escrita a mano. Y una receta
    sin ingredientes no solo se ve mal: deja de aportar a «añadir a la lista lo
    que falte», al coste de la semana y al descuento de la despensa.

    En este orden el peor caso es el contrario y es recuperable: si falla el
    borrado quedan los viejos junto a los nuevos, visibles y editables, y se
    dice. Los duplicados momentáneos no rompen nada — `recipe_ingredients` no
    tiene unique por nombre (dos filas «Ajo» son legales) y entre las dos
    escrituras nadie lee la tabla.
  */
  const { data: previousRows, error: prevErr } = await supabase
    .from("recipe_ingredients")
    .select("id")
    .eq("household_id", household.id)
    .eq("recipe_id", id);
  if (prevErr) return { error: "No se pudieron guardar los ingredientes." };
  const previousIds = (previousRows ?? []).map((r) => r.id);

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

  if (previousIds.length > 0) {
    const { error: delErr } = await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("household_id", household.id)
      .in("id", previousIds);
    if (delErr) {
      return {
        error:
          "Se guardaron los ingredientes, pero no se pudieron quitar los anteriores. Ábrela y revisa si hay repetidos.",
      };
    }
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
  const { data: deleted, error } = await supabase
    .from("recipes")
    .delete()
    .eq("household_id", household.id)
    .eq("id", id)
    .select("id");
  if (error) return { error: "No se pudo eliminar la receta." };
  // Mismo caso que al guardar: sin filas, decir «eliminada» sería mentir.
  if (!deleted || deleted.length === 0) {
    return { error: "Esa receta ya no está en este hogar." };
  }
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

/**
 * Trae una receta para leerla, con sus ingredientes y sus pasos. Es una LECTURA
 * en una Server Action, y no una query de servidor, porque quien la pide es el
 * panel de un plato del menú ya montado en el cliente: los pasos no viajan en la
 * consulta de la semana (serían catorce recetas completas para que se lea una), y
 * una receta efímera de la IA no está en el recetario que ese panel ya tiene.
 * Mismo patrón que `computeCookedDeductionsAction`.
 *
 * Vale igual para una receta guardada que para una efímera: no filtra por
 * `is_saved` a propósito, porque el plato que la IA inventó al planificar la
 * semana es justo el que nadie sabe cocinar.
 */
export async function getRecipeCookingAction(
  recipeId: string,
): Promise<RecipeCookingState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  // La consulta la comparte con el modo cocinado (`getRecipeForCooking`): son la
  // misma receta leída para lo mismo, y si cada lado la trajera por su cuenta
  // podrían acabar enseñando ingredientes distintos.
  const recipe = await getRecipeForCooking(recipeId);
  if (!recipe) return { error: "No se encontró la receta." };
  return { recipe };
}

/**
 * Le pide al modelo cómo se cocina un plato y devuelve el resultado ya mezclado
 * con lo que la receta tuviera escrito (`ai-draft.ts`).
 *
 * No consulta la base ni escribe nada: recibe los ingredientes que ya hay y
 * devuelve el borrador. Es lo que permite que la MISMA generación sirva para el
 * formulario (que enseña el borrador antes de guardar) y para un plato del menú
 * (que lo guarda), sin que cada lado le pida al modelo cosas distintas.
 */
async function askForRecipeDetails(input: {
  name: string;
  description: string | null;
  servings: number;
  mealTypes: string[];
  existing: DraftIngredient[];
}): Promise<{ error?: string; details?: RecipeDetailsDraft }> {
  let generated;
  try {
    const { object } = await generateObject({
      model: getModel("recipes"),
      schema: recipeDetailsSchema,
      // Un plato, no una semana: 45 s frente a los 60 s del menú. Si tarda más
      // que esto, lo que llegue tarde ya no lo está esperando nadie.
      abortSignal: AbortSignal.timeout(45_000),
      prompt: buildRecipeDetailsPrompt({
        name: input.name,
        description: input.description,
        servings: input.servings,
        mealTypes: input.mealTypes,
        existing: input.existing.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
        })),
      }),
    });
    generated = object;
  } catch (err) {
    console.error("Error al escribir la receta:", err);
    const kind = classifyAiError(err);
    return {
      error:
        kind === "rate_limit"
          ? "El servicio de IA está saturado ahora mismo. Espera un minuto y vuelve a intentarlo."
          : kind === "timeout"
            ? "La receta tardó demasiado en escribirse. Vuelve a intentarlo."
            : kind === "config"
              ? "La escritura con IA no está bien configurada. Repetirlo no lo va a arreglar: hay que revisar la configuración de la app."
              : "No se pudo escribir la receta. Vuelve a intentarlo.",
    };
  }

  /*
    Aquí es donde se comprueba que ha llegado algo, y no en el schema:
    `recipe-schema.ts` renuncia a `.min()` a propósito para que una lista vacía no
    tire la respuesta ENTERA, y el precio de eso es que la respuesta vacía llega
    hasta aquí. A cambio, el aviso puede nombrar el plato, que es lo que le dice
    al usuario qué cambiar.
  */
  if (generated.steps.length === 0 && generated.ingredients.length === 0) {
    return {
      error: `No he sabido escribir la receta de «${input.name}». Prueba con un nombre más concreto.`,
    };
  }

  return {
    details: {
      prepMinutes: sanitizePrepMinutes(generated.prep_minutes),
      ingredients: mergeGeneratedIngredients(
        input.existing,
        generated.ingredients,
      ),
      steps: sanitizeGeneratedSteps(generated.steps),
    },
  };
}

/**
 * Escribe con IA los ingredientes y los pasos de un plato y los devuelve al
 * formulario SIN guardar nada. Sirve igual en «nueva receta» (donde solo hay un
 * nombre) que al editar una que ya tiene media lista puesta.
 *
 * Que no escriba es la decisión importante: lo que vuelve es un borrador que
 * pasa por delante de una persona y se guarda con el botón de siempre. Por eso
 * aquí SÍ se puede rehacer una receta que ya tenía pasos —no se pierde nada
 * hasta que se guarda—, mientras que `fillRecipeDetailsAction`, que escribe
 * directo, solo rellena lo que está vacío.
 */
export async function generateRecipeDetailsAction(
  input: RecipeDetailsRequest,
): Promise<RecipeDetailsState> {
  try {
    return await generateRecipeDetails(input);
  } catch (err) {
    return { error: serverFailureMessage("generateRecipeDetailsAction", err) };
  }
}

async function generateRecipeDetails(
  input: RecipeDetailsRequest,
): Promise<RecipeDetailsState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  // Escribir una receta manda a la IA de Google el nombre del plato y lo que el
  // hogar tenga apuntado en él: mismo gate que los tickets y los menús.
  // Puerta de IA: el consentimiento y también el caso de no haberlo podido
  // comprobar (ver `aiConsentError`). Las seis rutas la cruzan con esta misma
  // llamada, para que no puedan divergir.
  const consentError = aiConsentError(await getAiConsent());
  if (consentError) return consentError;

  const parsed = recipeDetailsRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;

  const supabase = createServerSupabaseClient();
  const rateError = await enforceAiRateLimit(supabase, "recipe", household.id);
  if (rateError) return { error: rateError };

  const result = await askForRecipeDetails({
    name: d.name,
    description: d.description,
    servings: d.servings,
    mealTypes: d.mealTypes,
    existing: d.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      optional: i.optional,
      productId: i.productId,
    })),
  });
  if (!result.details) {
    // Sin borrador no hay nada que enseñar, así que la cuota apuntada arriba se
    // devuelve. Va en el llamador y no en `askForRecipeDetails` porque ese
    // helper no toca la base a propósito: es lo que le permite servir a las dos
    // generaciones (la del formulario y la del menú) sin saber de dónde vienen.
    await refundAiUsage("recipe", household.id);
    return { error: result.error ?? "No se pudo escribir la receta." };
  }
  return { details: result.details };
}

/**
 * Escribe con IA los pasos que le faltan a una receta que YA existe y los
 * guarda. Es la vía del menú: un plato que la IA inventó al planificar la semana
 * trae nombre e ingredientes pero nunca pasos, y una receta del pack curado
 * tampoco los trae, así que «¿cómo se cocina esto?» no tiene respuesta hasta que
 * alguien la pide.
 *
 * Lo que escribe es ADITIVO por diseño: los pasos solo si no había ninguno, los
 * minutos solo si estaban vacíos, y de los ingredientes solo las cantidades que
 * faltaban más los que no estaban. Un ingrediente que ya estaba no se renombra
 * ni se borra nunca (`mergeGeneratedIngredients`), porque su nombre es el vínculo
 * con el catálogo del hogar del que cuelgan la lista de la compra y el descuento
 * de la despensa.
 */
export async function fillRecipeDetailsAction(
  recipeId: string,
): Promise<RecipeDetailsState> {
  try {
    return await fillRecipeDetails(recipeId);
  } catch (err) {
    return { error: serverFailureMessage("fillRecipeDetailsAction", err) };
  }
}

async function fillRecipeDetails(
  recipeId: string,
): Promise<RecipeDetailsState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  // Puerta de IA: el consentimiento y también el caso de no haberlo podido
  // comprobar (ver `aiConsentError`). Las seis rutas la cruzan con esta misma
  // llamada, para que no puedan divergir.
  const consentError = aiConsentError(await getAiConsent());
  if (consentError) return consentError;

  const supabase = createServerSupabaseClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, name, description, servings, prep_minutes, meal_types, steps")
    .eq("household_id", household.id)
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return { error: "No se encontró la receta." };

  /*
    Una receta que ya tiene pasos no se rehace por aquí. Desde el menú no hay
    revisión previa —lo que devuelva el modelo se guarda—, así que rehacerlos
    sería borrar sin preguntar, y sin deshacer, lo que escribió el hogar. Para
    rehacerlos está el formulario de la receta, donde el borrador se ve antes de
    guardarse.

    Va ANTES del rate limit a propósito, igual que la guarda del reroll en
    `menus/actions.ts`: negar algo no debe gastar cuota de IA.
  */
  if ((recipe.steps ?? []).length > 0) {
    return {
      error: "Esta receta ya tiene sus pasos: puedes cambiarlos en «Mis recetas».",
    };
  }

  // El `id` de cada fila viaja porque las cantidades se escriben una a una sobre
  // la fila que ya existe. Borrar e insertar de nuevo (lo que hace el formulario
  // al guardar) perdería aquí un `product_id` elegido a mano en el
  // autocompletado: al reinsertar solo se recupera el vínculo cuyo nombre
  // coincide exactamente con el del catálogo.
  const { data: ings, error: ingsErr } = await supabase
    .from("recipe_ingredients")
    .select("id, name, quantity, unit, optional, product_id")
    .eq("household_id", household.id)
    .eq("recipe_id", recipeId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  /*
    Aquí NO vale el `?? []` de costumbre, y es la diferencia entre un fallo y un
    destrozo: «esta receta no tiene ingredientes» y «no he podido leerlos» dan la
    misma lista vacía, pero con la segunda el modelo devuelve el plato entero,
    todo cuenta como AÑADIDO y se insertan otra vez los ingredientes que ya
    estaban —duplicados y sin `product_id`—. A partir de ahí «lo que falta» pide
    el doble y cocinar descuenta el doble, sin un solo error por ningún lado.
    Y no es hipotético: el PGRST303 por desfase de reloj Clerk↔Supabase de este
    repo es exactamente un fallo transitorio de una lectura como esta.
  */
  if (ingsErr) {
    return { error: "No se pudieron leer los ingredientes. Vuelve a intentarlo." };
  }

  // El cobro de cuota va DESPUÉS de leer los ingredientes: si esa lectura
  // falla, la acción devuelve error sin llamar al modelo, y cobrar antes
  // gastaba una unidad por nada (ese camino no devolvía la cuota).
  const rateError = await enforceAiRateLimit(supabase, "recipe", household.id);
  if (rateError) return { error: rateError };

  const rows = ings ?? [];
  const existing: DraftIngredient[] = rows.map((i) => ({
    name: i.name,
    quantity: i.quantity === null ? null : Number(i.quantity),
    unit: i.unit,
    optional: i.optional,
    productId: i.product_id,
  }));

  const result = await askForRecipeDetails({
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings ?? 2,
    mealTypes: recipe.meal_types ?? [],
    existing,
  });
  if (!result.details) {
    await refundAiUsage("recipe", household.id);
    return { error: result.error ?? "No se pudo escribir la receta." };
  }
  const details = result.details;

  /*
    Sin pasos no se escribe nada. Aquí se llega desde un botón que dice «Escribir
    los pasos con IA», así que guardar un array vacío gastaba la cuota y luego el
    panel cantaba «Ya tienes la receta» sobre un plato que seguía sin decir cómo
    se hace. Es un caso vivo, no una precaución: `askForRecipeDetails` solo falla
    cuando vienen vacías las DOS listas, y `recipe-schema.ts` renuncia al `.min()`
    a propósito. No escribir tampoco las cantidades es lo que deja el intento
    limpio: la guarda de arriba no lo bloquea y se puede volver a pedir.
  */
  if (details.steps.length === 0) {
    return {
      error: `No he sabido escribir los pasos de «${recipe.name}». Puedes escribirlos a mano en «Mis recetas».`,
    };
  }

  const { error: updErr } = await supabase
    .from("recipes")
    .update({
      steps: details.steps,
      // Los minutos solo si la receta no los declaraba: los del hogar manda.
      ...(recipe.prep_minutes === null && details.prepMinutes !== null
        ? { prep_minutes: details.prepMinutes }
        : {}),
    })
    .eq("household_id", household.id)
    .eq("id", recipeId);
  if (updErr) return { error: "No se pudieron guardar los pasos." };

  // El orden de la mezcla es contrato (ver `mergeGeneratedIngredients`): los que
  // ya estaban, uno a uno y en su sitio, y detrás los añadidos.
  const filled = details.ingredients.slice(0, existing.length);
  const added = details.ingredients.slice(existing.length);

  let cantidadesFallidas = 0;
  for (let i = 0; i < filled.length; i += 1) {
    const before = existing[i];
    const after = filled[i];
    // Solo se toca la fila a la que le faltaba la cantidad y ahora la tiene.
    if (before.quantity !== null || after.quantity === null) continue;
    const { error: qtyErr } = await supabase
      .from("recipe_ingredients")
      .update({ quantity: after.quantity, unit: after.unit })
      .eq("household_id", household.id)
      .eq("id", rows[i].id);
    // Se cuenta en vez de abortar: los pasos ya están guardados y las demás
    // cantidades siguen siendo buenas, así que se termina el bucle y se avisa al
    // final. Callarse era decir «ya tienes la receta» sobre unas cantidades que
    // no se escribieron — la regla del repo: una escritura con filtro que no
    // comprueba nada convierte el éxito en una suposición.
    if (qtyErr) cantidadesFallidas += 1;
  }

  if (added.length > 0) {
    // Detrás de los que ya había: el orden es contrato (ver `ai-draft.ts`).
    const newRows = await buildIngredientRows(
      supabase,
      household.id,
      recipeId,
      added,
      existing.length,
    );
    const { error: ingErr } = await supabase
      .from("recipe_ingredients")
      .insert(newRows);
    // Los pasos ya están guardados: un fallo aquí deja la receta con sus pasos y
    // sin los ingredientes nuevos, que es recuperable a mano. Se avisa, no se
    // deshace: borrar los pasos que sí salieron bien sería peor.
    if (ingErr) {
      return {
        error: "Se guardaron los pasos, pero no los ingredientes nuevos.",
      };
    }
  }

  revalidatePath("/recetas");
  revalidatePath(`/recetas/${recipeId}`);
  revalidatePath("/menus");

  // Los pasos están guardados, así que esto no es un fracaso: es un éxito con una
  // pega concreta, y quien llama vuelve a leer la receta en los dos casos.
  if (cantidadesFallidas > 0) {
    return {
      details,
      error:
        cantidadesFallidas === 1
          ? "Ya tienes los pasos, pero una cantidad no se pudo guardar."
          : `Ya tienes los pasos, pero ${cantidadesFallidas} cantidades no se pudieron guardar.`,
    };
  }
  return { details };
}
