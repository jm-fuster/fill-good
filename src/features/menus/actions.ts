"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getModel } from "@/lib/ai/models";
import { menuSchema } from "@/lib/ai/menu-schema";
import { buildMenuPrompt, type MenuRuleLine } from "@/lib/ai/menu-prompt";
import {
  getCurrentSeason,
  getExpiryStatus,
  getWeekDays,
  relativeDaysLabel,
} from "@/lib/dates";
import { normalizeName } from "@/lib/normalize";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, UnitType } from "@/lib/supabase/types";
import { getCurrentHousehold } from "@/features/household/queries";
import { getInventory } from "@/features/inventory/queries";
import { getActiveList } from "@/features/shopping-list/queries";
import {
  getRecipeSignals,
  getSavedRecipesForMenu,
} from "@/features/recipes/queries";
import { getMenuRules } from "./queries";
import {
  validateAndPatchRules,
  type MenuDay,
  type MenuDish,
  type MenuMeal,
  type ValidatableRule,
} from "./rules";
import { menuRuleInputSchema, type MenuRuleInput } from "./schemas";

export type MenuState = { error?: string; ok?: boolean; added?: number };

async function ensureMenu(
  supabase: SupabaseClient<Database>,
  householdId: string,
  weekStart: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("weekly_menus")
    .select("id")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("weekly_menus")
    .insert({ household_id: householdId, week_start: weekStart })
    .select("id")
    .single();
  return created?.id ?? null;
}

/** Datos del plato inventado que se transportan por la validación (rules.ts). */
type DishPayload = {
  description: string | null;
  ingredients: { name: string; quantity: number | null; unit: UnitType | null }[];
};

/** Fecha local de hoy (YYYY-MM-DD), para la temporada de los platos nuevos. */
function todayLocalISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Housekeeping: borra las recetas efímeras (is_saved = false) del hogar que ya
 * no referencia ninguna entrada de menú. Se ejecuta tras regenerar para que la
 * tabla `recipes` no crezca indefinidamente al rehacer la misma semana.
 */
async function cleanupOrphanEphemeralRecipes(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<void> {
  const { data: ephemeral } = await supabase
    .from("recipes")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_saved", false);
  const ephemeralIds = (ephemeral ?? []).map((r) => r.id);
  if (ephemeralIds.length === 0) return;

  const { data: refs } = await supabase
    .from("menu_entries")
    .select("recipe_id")
    .eq("household_id", householdId)
    .in("recipe_id", ephemeralIds);
  const referenced = new Set(
    (refs ?? [])
      .map((e) => e.recipe_id)
      .filter((id): id is string => Boolean(id)),
  );

  const orphans = ephemeralIds.filter((id) => !referenced.has(id));
  if (orphans.length > 0) {
    await supabase.from("recipes").delete().in("id", orphans);
  }
}

export async function generateMenuAction(
  weekStart: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  // --- Contexto completo para el prompt ---
  const [inventory, savedRecipes, signals, allRules] = await Promise.all([
    getInventory(),
    getSavedRecipesForMenu(),
    getRecipeSignals(household.id),
    getMenuRules(),
  ]);

  const season = getCurrentSeason();
  const activeRules = allRules.filter((r) => r.active);

  // Ingredientes "en stock": por product_id o por nombre normalizado (cantidad > 0).
  const inStockProductIds = new Set(
    inventory.filter((i) => i.quantity > 0).map((i) => i.productId),
  );
  const inStockNames = new Set(
    inventory
      .filter((i) => i.quantity > 0)
      .map((i) => normalizeName(i.productName)),
  );
  const isIngredientInStock = (name: string, productId: string | null) =>
    (productId != null && inStockProductIds.has(productId)) ||
    inStockNames.has(normalizeName(name));

  const signalsById = new Map(signals.map((s) => [s.recipeId, s]));

  // Recetario filtrado por la temporada actual (all o la estación de hoy).
  const seasonalRecipes = savedRecipes.filter(
    (r) => r.seasons.includes("all") || r.seasons.includes(season),
  );
  const recipeLines = seasonalRecipes.map((r) => {
    const sig = signalsById.get(r.id);
    return {
      id: r.id,
      name: r.name,
      mealTypes: r.mealTypes,
      avgRating: sig?.avgRating ?? null,
      timesCooked: sig?.timesCooked ?? 0,
      lastCookedLabel: sig?.lastCookedAt
        ? relativeDaysLabel(sig.lastCookedAt)
        : null,
      ingredients: r.ingredients.map((ing) => ({
        name: ing.name,
        inStock: isIngredientInStock(ing.name, ing.productId),
      })),
    };
  });

  const invLines = inventory.map((i) => {
    const exp = getExpiryStatus(i.expiryDate, 7);
    return {
      name: i.productName,
      quantity: i.quantity,
      unit: i.unit as string,
      expiresInDays: exp ? exp.days : null,
      useSoon: i.useSoon,
    };
  });

  const ruleLines: MenuRuleLine[] = activeRules.flatMap((r): MenuRuleLine[] => {
    if (r.kind === "free_text") {
      return r.textRule ? [{ kind: "free_text", text: r.textRule }] : [];
    }
    if (r.recipeName && r.value != null) {
      return [{ kind: r.kind, recipeName: r.recipeName, value: r.value }];
    }
    return [];
  });

  let generated;
  try {
    const { object } = await generateObject({
      model: getModel("menus"),
      schema: menuSchema,
      prompt: buildMenuPrompt({
        today: todayLocalISO(),
        season,
        inventory: invLines,
        recipes: recipeLines,
        rules: ruleLines,
      }),
    });
    generated = object;
  } catch (err) {
    console.error("Error al generar el menú:", err);
    return { error: "No se pudo generar el menú. Inténtalo de nuevo." };
  }

  const weekDays = getWeekDays(weekStart);

  // --- Construir la estructura para validar reglas ---
  // Resolución de saved_recipe_id contra TODO el recetario (no solo el de
  // temporada): el id explícito o, como fallback, por nombre normalizado.
  const savedById = new Map(savedRecipes.map((r) => [r.id, r]));
  const savedByNorm = new Map<string, string>();
  for (const r of savedRecipes) {
    const norm = normalizeName(r.name);
    if (norm && !savedByNorm.has(norm)) savedByNorm.set(norm, r.id);
  }
  const resolveSavedId = (dish: {
    saved_recipe_id: string | null;
    recipe_name: string;
  }): string | null => {
    if (dish.saved_recipe_id && savedById.has(dish.saved_recipe_id)) {
      return dish.saved_recipe_id;
    }
    return savedByNorm.get(normalizeName(dish.recipe_name)) ?? null;
  };

  // Cada día lleva SIEMPRE comida y cena (aunque vacías) para que las reglas de
  // mínimo puedan colocar platos en cualquiera de los dos huecos.
  const slots: ("lunch" | "dinner")[] = ["lunch", "dinner"];
  const structDays: MenuDay[] = [];
  for (const day of generated.days) {
    const date = weekDays[day.day_index];
    if (!date) continue;
    const meals: MenuMeal[] = slots.map((slot) => {
      const m = day.meals.find((x) => x.slot === slot);
      const dishes: MenuDish[] = (m?.dishes ?? []).slice(0, 2).map((dish) => {
        const payload: DishPayload = {
          description: dish.description,
          ingredients: dish.ingredients.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
          })),
        };
        return {
          savedRecipeId: resolveSavedId(dish),
          name: dish.recipe_name,
          payload,
        };
      });
      return { slot, dishes };
    });
    structDays.push({ dayIndex: day.day_index, meals });
  }

  // Reglas de frecuencia enriquecidas con los metadatos de su receta.
  const validatable: ValidatableRule[] = activeRules.map((r) => {
    const meta = r.recipeId ? savedById.get(r.recipeId) : null;
    return {
      kind: r.kind,
      recipeId: r.recipeId,
      value: r.value,
      recipe: meta ? { name: meta.name, mealTypes: meta.mealTypes } : null,
    };
  });

  const patched = validateAndPatchRules({ days: structDays }, validatable);

  // --- Inserción sin contaminar la tabla recipes ---
  // Regenerar reemplaza el menú de la semana.
  await supabase.from("menu_entries").delete().eq("menu_id", menuId);

  for (const day of patched.days) {
    const date = weekDays[day.dayIndex];
    if (!date) continue;
    for (const meal of day.meals) {
      let position = 0;
      for (const dish of meal.dishes) {
        // Receta guardada: enlace directo, sin crear fila nueva.
        if (dish.savedRecipeId) {
          await supabase.from("menu_entries").insert({
            menu_id: menuId,
            household_id: household.id,
            date,
            meal_slot: meal.slot,
            recipe_id: dish.savedRecipeId,
            position,
          });
          position += 1;
          continue;
        }
        // Marcador de exceso recortado: texto libre "(elegir plato)".
        if (dish.placeholder) {
          await supabase.from("menu_entries").insert({
            menu_id: menuId,
            household_id: household.id,
            date,
            meal_slot: meal.slot,
            free_text: dish.name,
            position,
          });
          position += 1;
          continue;
        }
        // Plato inventado: receta efímera (is_saved = false) desde el payload.
        const payload = (dish.payload ?? null) as DishPayload | null;
        const { data: recipe } = await supabase
          .from("recipes")
          .insert({
            household_id: household.id,
            name: dish.name,
            normalized_name: normalizeName(dish.name),
            description: payload?.description ?? null,
            servings: 2,
            meal_types: [meal.slot],
            source: "ai",
            created_by: userId,
          })
          .select("id")
          .single();
        if (!recipe) continue;

        const ings = payload?.ingredients ?? [];
        if (ings.length > 0) {
          await supabase.from("recipe_ingredients").insert(
            ings.map((ing) => ({
              recipe_id: recipe.id,
              household_id: household.id,
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
            })),
          );
        }

        await supabase.from("menu_entries").insert({
          menu_id: menuId,
          household_id: household.id,
          date,
          meal_slot: meal.slot,
          recipe_id: recipe.id,
          position,
        });
        position += 1;
      }
    }
  }

  await supabase
    .from("weekly_menus")
    .update({ generated_by: "ai" })
    .eq("id", menuId);

  // Limpia recetas efímeras huérfanas de generaciones anteriores.
  await cleanupOrphanEphemeralRecipes(supabase, household.id);

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Añade un plato (texto libre) a un hueco (comida/cena de un día). Cada hueco
 * admite varios platos: la posición del nuevo es la siguiente libre (0..n).
 */
export async function addMenuEntryAction(
  weekStart: string,
  date: string,
  slot: string,
  freeText: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const text = freeText.trim();
  if (!text) return { error: "Escribe el nombre del plato." };

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  // Siguiente posición dentro del hueco.
  const { data: last } = await supabase
    .from("menu_entries")
    .select("position")
    .eq("menu_id", menuId)
    .eq("date", date)
    .eq("meal_slot", slot)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = last ? last.position + 1 : 0;

  const { error } = await supabase.from("menu_entries").insert({
    menu_id: menuId,
    household_id: household.id,
    date,
    meal_slot: slot,
    free_text: text,
    position,
  });
  if (error) return { error: "No se pudo añadir el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Edita el texto de un plato concreto. Si la entrada apuntaba a una receta, la
 * convierte en texto libre (desvincula la receta), igual que hacía la edición
 * de un solo plato por hueco.
 */
export async function updateMenuEntryAction(
  entryId: string,
  freeText: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const text = freeText.trim();
  // Sin texto = quitar el plato (misma semántica que el botón "Quitar").
  if (!text) return removeMenuEntryAction(entryId);

  const { error } = await supabase
    .from("menu_entries")
    .update({ free_text: text, recipe_id: null })
    .eq("id", entryId);
  if (error) return { error: "No se pudo guardar el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/** Quita un plato concreto del menú. */
export async function removeMenuEntryAction(
  entryId: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("menu_entries")
    .delete()
    .eq("id", entryId);
  if (error) return { error: "No se pudo quitar el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Marca o desmarca "Lo cocinamos" en una entrada del menú. Al marcar, fija
 * cooked_at con la propia fecha de la entrada (señal de apetencia para C3);
 * al desmarcar, la deja en null. Solo tiene sentido en entradas de hoy o
 * pasadas: la UI oculta el botón en fechas futuras, pero aquí se valida igual.
 */
export async function toggleEntryCookedAction(
  entryId: string,
  cooked: boolean,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  if (!cooked) {
    const { error } = await supabase
      .from("menu_entries")
      .update({ cooked_at: null })
      .eq("id", entryId);
    if (error) return { error: "No se pudo actualizar la entrada." };
    revalidatePath("/menus");
    return { ok: true };
  }

  // Recupera la fecha real de la entrada (RLS garantiza que es del hogar).
  const { data: entry } = await supabase
    .from("menu_entries")
    .select("date")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(`${entry.date}T00:00:00`) > today) {
    return { error: "Solo puedes marcar como cocinado un día que ya ha pasado." };
  }

  const { error } = await supabase
    .from("menu_entries")
    .update({ cooked_at: entry.date })
    .eq("id", entryId);
  if (error) return { error: "No se pudo actualizar la entrada." };

  revalidatePath("/menus");
  return { ok: true };
}

export async function addMissingToListAction(
  menuId: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  // Ingredientes de las recetas del menú.
  const { data: entries } = await supabase
    .from("menu_entries")
    .select("recipe_id")
    .eq("menu_id", menuId)
    .not("recipe_id", "is", null);
  const recipeIds = [...new Set((entries ?? []).map((e) => e.recipe_id))].filter(
    (id): id is string => Boolean(id),
  );
  if (recipeIds.length === 0) {
    return { error: "El menú no tiene recetas con ingredientes." };
  }

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("name, quantity, unit")
    .in("recipe_id", recipeIds);

  // Lo que ya hay en inventario y lo que ya está en la lista (por nombre).
  const inventory = await getInventory();
  const inStock = new Set(inventory.map((i) => normalizeName(i.productName)));
  const { data: listItems } = await supabase
    .from("shopping_list_items")
    .select("name")
    .eq("list_id", list.id);
  const onList = new Set((listItems ?? []).map((i) => normalizeName(i.name)));

  // Ingredientes faltantes, deduplicados por nombre normalizado.
  const toAdd = new Map<string, { name: string; unit: UnitType | null }>();
  for (const ing of ingredients ?? []) {
    const key = normalizeName(ing.name);
    if (!key || inStock.has(key) || onList.has(key) || toAdd.has(key)) continue;
    toAdd.set(key, { name: ing.name, unit: ing.unit });
  }

  if (toAdd.size === 0) return { ok: true, added: 0 };

  const { error } = await supabase.from("shopping_list_items").insert(
    [...toAdd.values()].map((v) => ({
      list_id: list.id,
      household_id: household.id,
      name: v.name,
      unit: v.unit,
      added_by: userId,
    })),
  );
  if (error) return { error: "No se pudieron añadir los ingredientes." };

  revalidatePath("/lista");
  return { ok: true, added: toAdd.size };
}

// ---------------------------------------------------------------------------
// Reglas del menú (C2)
// ---------------------------------------------------------------------------

export type RuleState = { error?: string; ok?: boolean };

/**
 * Crea una regla del menú. Las reglas de frecuencia (recipe_min/max_week) exigen
 * una receta guardada del hogar; las libres, un texto. El CHECK de coherencia de
 * la BD respalda la forma; aquí validamos con zod y comprobamos la receta.
 */
export async function createRuleAction(
  input: MenuRuleInput,
): Promise<RuleState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const parsed = menuRuleInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  const supabase = createServerSupabaseClient();

  if (d.kind === "free_text") {
    const { error } = await supabase.from("menu_rules").insert({
      household_id: household.id,
      kind: d.kind,
      text_rule: d.textRule,
    });
    if (error) return { error: "No se pudo crear la regla." };
  } else {
    // La receta debe existir, pertenecer al hogar y estar guardada.
    const { data: recipe } = await supabase
      .from("recipes")
      .select("id")
      .eq("id", d.recipeId)
      .eq("household_id", household.id)
      .eq("is_saved", true)
      .maybeSingle();
    if (!recipe) return { error: "Elige una receta de tu recetario." };

    const { error } = await supabase.from("menu_rules").insert({
      household_id: household.id,
      kind: d.kind,
      recipe_id: d.recipeId,
      value: d.value,
    });
    if (error) return { error: "No se pudo crear la regla." };
  }

  revalidatePath("/menus");
  return { ok: true };
}

/** Activa o desactiva una regla (una regla inactiva no se aplica en C3). */
export async function toggleRuleAction(
  ruleId: string,
  active: boolean,
): Promise<RuleState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("menu_rules")
    .update({ active })
    .eq("id", ruleId);
  if (error) return { error: "No se pudo actualizar la regla." };

  revalidatePath("/menus");
  return { ok: true };
}

/** Borra una regla del menú. */
export async function deleteRuleAction(ruleId: string): Promise<RuleState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("menu_rules").delete().eq("id", ruleId);
  if (error) return { error: "No se pudo borrar la regla." };

  revalidatePath("/menus");
  return { ok: true };
}
