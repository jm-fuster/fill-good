"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { getModel } from "@/lib/ai/models";
import { menuSchema, singleDishSchema } from "@/lib/ai/menu-schema";
import {
  buildMenuPrompt,
  buildRerollPrompt,
  type MenuPinnedLine,
  type MenuRuleLine,
} from "@/lib/ai/menu-prompt";
import {
  getCurrentSeason,
  getExpiryStatus,
  getWeekDays,
  getWeekStart,
  relativeDaysLabel,
  shiftWeek,
} from "@/lib/dates";
import { normalizeName } from "@/lib/normalize";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, UnitType } from "@/lib/supabase/types";
import { getCurrentHousehold } from "@/features/household/queries";
import { getInventory } from "@/features/inventory/queries";
import { getInventoryStatus } from "@/features/inventory/status";
import { getActiveList, getProductCatalog } from "@/features/shopping-list/queries";
import {
  getRecipeSignals,
  getSavedRecipesForMenu,
} from "@/features/recipes/queries";
import { rankTonight, type TonightCard, type TonightSoonInfo } from "./tonight";
import { getMenuEntries, getMenuPrefs, getMenuRules } from "./queries";
import { activeSlots } from "./slots";
import {
  computeMissingIngredients,
  type MissingCandidate,
} from "./missing";
import {
  computeCookedDeductions,
  type CookedDeduction,
} from "./cooked";
import {
  validateAndPatchRules,
  type MenuDay,
  type MenuDish,
  type MenuMeal,
  type ValidatableRule,
} from "./rules";
import {
  menuPrefsInputSchema,
  menuRuleInputSchema,
  type MenuPrefsInput,
  type MenuRuleInput,
} from "./schemas";

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

/**
 * Siguiente posición libre (0..n) dentro de un hueco (día + slot) de un menú.
 * Varios platos comparten hueco distinguiéndose por `position`; el unique
 * `(menu_id, date, meal_slot, position)` obliga a recalcularla al insertar/mover.
 */
async function nextPosition(
  supabase: SupabaseClient<Database>,
  menuId: string,
  date: string,
  slot: string,
): Promise<number> {
  const { data: last } = await supabase
    .from("menu_entries")
    .select("position")
    .eq("menu_id", menuId)
    .eq("date", date)
    .eq("meal_slot", slot)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return last ? last.position + 1 : 0;
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

/**
 * Genera el menú de la semana (C3 + N2). Dos modos:
 *   - "fill" (por defecto): regeneración RESPETUOSA. Conserva las entradas
 *     fijadas (`pinned`) y las manuales (`source = 'manual'`) y solo rellena los
 *     huecos libres con platos de IA. Los conservados se pasan al prompt (para
 *     variedad) y se cuentan en la validación de reglas.
 *   - "replace": rehace TODA la semana (comportamiento destructivo original),
 *     borrando también lo manual y lo fijado. La UI lo pide con confirmación.
 */
export async function generateMenuAction(
  weekStart: string,
  mode: "fill" | "replace" = "fill",
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  const weekDays = getWeekDays(weekStart);

  // Entradas conservadas (solo en modo "fill"): fijadas o manuales. La
  // regeneración no las toca; se cuentan para las reglas y se listan en el prompt.
  const existingEntries = mode === "fill" ? await getMenuEntries(menuId) : [];
  const preserved = existingEntries.filter(
    (e) => e.pinned || e.source === "manual",
  );
  const occupiedSlots = new Set(preserved.map((e) => `${e.date}|${e.slot}`));
  const pinnedLines: MenuPinnedLine[] = preserved
    .map((e): MenuPinnedLine | null => {
      if (!weekDays.includes(e.date)) return null;
      return {
        day: format(parseISO(e.date), "EEEE d", { locale: es }),
        slot: e.slot === "dinner" ? "cena" : "comida",
        name: e.recipeName ?? e.freeText ?? "",
      };
    })
    .filter((l): l is MenuPinnedLine => l !== null && l.name !== "");

  // --- Contexto completo para el prompt ---
  const [inventory, savedRecipes, signals, allRules, prefs] =
    await Promise.all([
      getInventory(),
      getSavedRecipesForMenu(),
      getRecipeSignals(household.id),
      getMenuRules(),
      getMenuPrefs(),
    ]);

  const season = getCurrentSeason();
  const activeRules = allRules.filter((r) => r.active);
  const slotKeys = activeSlots(prefs.planBreakfast).map((s) => s.key);

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
        pinned: pinnedLines,
        prefs: {
          goal: prefs.goal,
          dietStyle: prefs.dietStyle,
          avoidText: prefs.avoidText,
          servings: prefs.servings,
          planBreakfast: prefs.planBreakfast,
        },
      }),
    });
    generated = object;
  } catch (err) {
    console.error("Error al generar el menú:", err);
    return { error: "No se pudo generar el menú. Inténtalo de nuevo." };
  }

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
  // mínimo puedan colocar platos en cualquiera de los dos huecos. En modo "fill",
  // un hueco ocupado por platos conservados se rellena con esos platos marcados
  // como `immutable` (el validador los cuenta pero no los toca) y se ignoran los
  // platos que la IA haya propuesto para ese mismo hueco.
  const generatedByIndex = new Map(generated.days.map((d) => [d.day_index, d]));
  const structDays: MenuDay[] = [];
  for (let dayIndex = 0; dayIndex < weekDays.length; dayIndex += 1) {
    const date = weekDays[dayIndex];
    const genDay = generatedByIndex.get(dayIndex);
    const meals: MenuMeal[] = slotKeys.map((slot) => {
      // Hueco conservado: sus platos son inmutables; ignoramos la propuesta IA.
      if (occupiedSlots.has(`${date}|${slot}`)) {
        const dishes: MenuDish[] = preserved
          .filter((e) => e.date === date && e.slot === slot)
          .map((e) => ({
            savedRecipeId: e.recipeId,
            name: e.recipeName ?? e.freeText ?? "",
            immutable: true,
          }));
        return { slot, dishes };
      }
      const m = genDay?.meals.find((x) => x.slot === slot);
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
    structDays.push({ dayIndex, meals });
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
  // "replace" arrasa toda la semana; "fill" borra solo lo generado por IA que no
  // esté fijado y deja intactas las entradas conservadas.
  if (mode === "replace") {
    await supabase.from("menu_entries").delete().eq("menu_id", menuId);
  } else {
    await supabase
      .from("menu_entries")
      .delete()
      .eq("menu_id", menuId)
      .eq("source", "ai")
      .eq("pinned", false);
  }

  for (const day of patched.days) {
    const date = weekDays[day.dayIndex];
    if (!date) continue;
    for (const meal of day.meals) {
      // Los huecos conservados ya están en la BD: no se tocan.
      if (occupiedSlots.has(`${date}|${meal.slot}`)) continue;
      let position = 0;
      for (const dish of meal.dishes) {
        // Los platos inmutables (conservados) no se reinsertan.
        if (dish.immutable) continue;
        // Receta guardada: enlace directo, sin crear fila nueva.
        if (dish.savedRecipeId) {
          await supabase.from("menu_entries").insert({
            menu_id: menuId,
            household_id: household.id,
            date,
            meal_slot: meal.slot,
            recipe_id: dish.savedRecipeId,
            position,
            source: "ai",
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
            source: "ai",
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
            servings: prefs.servings,
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
          source: "ai",
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

  const position = await nextPosition(supabase, menuId, date, slot);

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

  // Editar una entrada la vuelve manual (ya se desvinculaba de la receta): así la
  // regeneración respetuosa (N2) no la pisa.
  const { error } = await supabase
    .from("menu_entries")
    .update({ free_text: text, recipe_id: null, source: "manual" })
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
 * Mueve un plato a otro hueco de la MISMA semana (N1). Actualiza `date`,
 * `meal_slot` y `position` (siguiente libre del destino, para no colisionar con
 * el unique del hueco); conserva `recipe_id`/`free_text` intactos, de modo que
 * el coste (M7) y el descuento de stock (M2) siguen funcionando. Mover a su
 * propio hueco es un no-op silencioso; no se puede mover a un día futuro un
 * plato ya cocinado.
 */
export async function moveMenuEntryAction(
  entryId: string,
  date: string,
  slot: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { data: entry } = await supabase
    .from("menu_entries")
    .select("menu_id, date, meal_slot, cooked_at")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  // Mover al hueco de origen: nada que hacer.
  if (entry.date === date && entry.meal_slot === slot) return { ok: true };

  // Un plato ya cocinado no puede viajar a un día futuro.
  if (entry.cooked_at) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(`${date}T00:00:00`) > today) {
      return {
        error: "No puedes mover a un día futuro un plato ya cocinado.",
      };
    }
  }

  const position = await nextPosition(supabase, entry.menu_id, date, slot);

  // Mover es un gesto manual: la entrada pasa a protegerse de la regeneración (N2).
  const { error } = await supabase
    .from("menu_entries")
    .update({ date, meal_slot: slot, position, source: "manual" })
    .eq("id", entryId);
  if (error) return { error: "No se pudo mover el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Duplica un plato en otro hueco de la misma semana (N1): inserta una copia con
 * el mismo `recipe_id` o `free_text` en el destino. Nunca copia `cooked_at`: la
 * copia siempre nace sin cocinar.
 */
export async function duplicateMenuEntryAction(
  entryId: string,
  date: string,
  slot: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { data: entry } = await supabase
    .from("menu_entries")
    .select("menu_id, recipe_id, free_text")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  const position = await nextPosition(supabase, entry.menu_id, date, slot);

  const { error } = await supabase.from("menu_entries").insert({
    menu_id: entry.menu_id,
    household_id: household.id,
    date,
    meal_slot: slot,
    recipe_id: entry.recipe_id,
    free_text: entry.free_text,
    position,
    // La copia es una entrada manual nueva (sin fijar, sin cocinar).
    source: "manual",
  });
  if (error) return { error: "No se pudo duplicar el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Copia la semana anterior en la semana visible (N5). Solo actúa si la semana
 * visible está vacía y la anterior tiene entradas. Duplica cada entrada al mismo
 * hueco 7 días después conservando `recipe_id`/`free_text` y `position`; nunca
 * copia `cooked_at`; escribe `source = 'manual'` y `pinned = false`. Para hogares
 * con rutina estable, es el 80% del plan en un toque.
 */
export async function copyPreviousWeekAction(
  weekStart: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const prevWeekStart = shiftWeek(weekStart, -1);
  const prevMenu = await supabase
    .from("weekly_menus")
    .select("id")
    .eq("week_start", prevWeekStart)
    .maybeSingle();
  const prevMenuId = prevMenu.data?.id;
  if (!prevMenuId) return { error: "No hay semana anterior que copiar." };

  const prevEntries = await getMenuEntries(prevMenuId);
  if (prevEntries.length === 0) {
    return { error: "La semana anterior no tiene platos." };
  }

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  // No pisar una semana con contenido: copiar es solo para semanas vacías.
  const { data: existing } = await supabase
    .from("menu_entries")
    .select("id")
    .eq("menu_id", menuId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "La semana ya tiene platos." };
  }

  const prevDays = getWeekDays(prevWeekStart);
  const destDays = getWeekDays(weekStart);

  const rows = prevEntries
    .map((e) => {
      const idx = prevDays.indexOf(e.date);
      const date = destDays[idx];
      if (!date) return null;
      return {
        menu_id: menuId,
        household_id: household.id,
        date,
        meal_slot: e.slot,
        recipe_id: e.recipeId,
        free_text: e.freeText,
        position: e.position,
        source: "manual",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return { error: "No se pudo copiar la semana." };

  const { error } = await supabase.from("menu_entries").insert(rows);
  if (error) return { error: "No se pudo copiar la semana." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Fija o desfija una entrada del menú (N2). Una entrada fijada nunca la toca la
 * regeneración, sea de IA o manual.
 */
export async function toggleEntryPinnedAction(
  entryId: string,
  pinned: boolean,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("menu_entries")
    .update({ pinned })
    .eq("id", entryId);
  if (error) return { error: "No se pudo actualizar el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * "Otra idea" por hueco (N2): pide UN plato alternativo a la IA para una entrada
 * concreta y la reemplaza en su misma posición (source = 'ai'), sin tocar el
 * resto de la semana. Es 1 llamada pequeña a Gemini (aceptable en free tier).
 * Tras reemplazar, limpia la receta efímera que pudiera quedar huérfana.
 */
export async function rerollMenuEntryAction(
  entryId: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const { data: entry } = await supabase
    .from("menu_entries")
    .select("menu_id, date, meal_slot, position")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  const [inventory, savedRecipes, signals, allRules, menuEntries, prefs] =
    await Promise.all([
      getInventory(),
      getSavedRecipesForMenu(),
      getRecipeSignals(household.id),
      getMenuRules(),
      getMenuEntries(entry.menu_id),
      getMenuPrefs(),
    ]);

  const season = getCurrentSeason();
  const activeRules = allRules.filter((r) => r.active);

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

  // El plato actual (a cambiar) y el resto de la semana (para no repetir).
  const current = menuEntries.find((e) => e.id === entryId);
  const currentDish = current?.recipeName ?? current?.freeText ?? "este plato";
  const otherDishes = menuEntries
    .filter((e) => e.id !== entryId)
    .map((e) => e.recipeName ?? e.freeText ?? "")
    .filter((n) => n !== "");

  let dish;
  try {
    const { object } = await generateObject({
      model: getModel("menus"),
      schema: singleDishSchema,
      prompt: buildRerollPrompt({
        today: todayLocalISO(),
        season,
        slot: entry.meal_slot,
        currentDish,
        inventory: invLines,
        recipes: recipeLines,
        rules: ruleLines,
        otherDishes,
        prefs: {
          goal: prefs.goal,
          dietStyle: prefs.dietStyle,
          avoidText: prefs.avoidText,
          servings: prefs.servings,
          planBreakfast: prefs.planBreakfast,
        },
      }),
    });
    dish = object;
  } catch (err) {
    console.error("Error al generar el plato alternativo:", err);
    return { error: "No se pudo generar otra idea. Inténtalo de nuevo." };
  }

  // Resolución de saved_recipe_id: id explícito o, como fallback, por nombre.
  const savedById = new Map(savedRecipes.map((r) => [r.id, r]));
  const savedByNorm = new Map<string, string>();
  for (const r of savedRecipes) {
    const norm = normalizeName(r.name);
    if (norm && !savedByNorm.has(norm)) savedByNorm.set(norm, r.id);
  }
  const savedId =
    dish.saved_recipe_id && savedById.has(dish.saved_recipe_id)
      ? dish.saved_recipe_id
      : (savedByNorm.get(normalizeName(dish.recipe_name)) ?? null);

  // Determina el recipe_id destino: receta guardada o receta efímera nueva.
  let newRecipeId: string;
  if (savedId) {
    newRecipeId = savedId;
  } else {
    const { data: recipe } = await supabase
      .from("recipes")
      .insert({
        household_id: household.id,
        name: dish.recipe_name,
        normalized_name: normalizeName(dish.recipe_name),
        description: dish.description ?? null,
        servings: prefs.servings,
        meal_types: [entry.meal_slot],
        source: "ai",
        created_by: userId,
      })
      .select("id")
      .single();
    if (!recipe) return { error: "No se pudo crear el plato alternativo." };
    newRecipeId = recipe.id;

    if (dish.ingredients.length > 0) {
      await supabase.from("recipe_ingredients").insert(
        dish.ingredients.map((ing) => ({
          recipe_id: recipe.id,
          household_id: household.id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
        })),
      );
    }
  }

  // Reemplaza la entrada en su sitio: nueva receta, sin texto libre, source 'ai'
  // y sin cocinar (es un plato distinto).
  const { error } = await supabase
    .from("menu_entries")
    .update({
      recipe_id: newRecipeId,
      free_text: null,
      source: "ai",
      cooked_at: null,
    })
    .eq("id", entryId);
  if (error) return { error: "No se pudo cambiar el plato." };

  // La receta efímera anterior puede haber quedado huérfana.
  await cleanupOrphanEphemeralRecipes(supabase, household.id);

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

export type CookedDeductionsState = {
  error?: string;
  deductions?: CookedDeduction[];
};

/**
 * M2, fase 1: propone qué ingredientes de una receta descontar del inventario.
 * Reutiliza el matching de `missing.ts` (product_id → exacto → fuzzy) pero en
 * dirección inversa (lo que SÍ hay). No escribe nada: devuelve los candidatos
 * para que el usuario revise cantidades antes de confirmar. Determinista, sin IA.
 */
export async function computeCookedDeductionsAction(
  recipeId: string,
): Promise<CookedDeductionsState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("name, quantity, unit, product_id")
    .eq("recipe_id", recipeId);
  if (!ingredients || ingredients.length === 0) return { deductions: [] };

  const [inventory, catalog] = await Promise.all([
    getInventory(),
    getProductCatalog(),
  ]);

  // Stock (cantidad > 0) por producto y unidad, para el matching por unidad exacta.
  const stockByProductUnit = new Map<string, Map<UnitType, number>>();
  for (const i of inventory) {
    if (i.quantity <= 0) continue;
    let byUnit = stockByProductUnit.get(i.productId);
    if (!byUnit) {
      byUnit = new Map<UnitType, number>();
      stockByProductUnit.set(i.productId, byUnit);
    }
    byUnit.set(i.unit, (byUnit.get(i.unit) ?? 0) + i.quantity);
  }

  const deductions = computeCookedDeductions({
    ingredients: ingredients.map((i) => ({
      name: i.name,
      productId: i.product_id,
      unit: i.unit,
      quantity: i.quantity === null ? null : Number(i.quantity),
    })),
    catalog: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      normalizedName: c.normalizedName,
      defaultUnit: c.defaultUnit,
    })),
    stockByProductUnit,
  });

  return { deductions };
}

export type CookedDeductionInput = {
  productId: string;
  unit: UnitType;
  quantity: number;
};

/**
 * M2, fase 2: descuenta del inventario las cantidades confirmadas. Consumo FIFO
 * por caducidad (el lote que caduca antes primero; nulls al final), en cascada
 * si un lote no cubre la cantidad. Nunca deja stock negativo (clamp a 0; el lote
 * a 0 se conserva como agotado, igual que `setInventoryQuantityAction`). No hay
 * conversión de unidades: se descuenta solo de lotes en la misma unidad.
 */
export async function confirmCookedDeductionsAction(
  deductions: CookedDeductionInput[],
): Promise<{ error?: string; ok?: boolean; deducted?: number }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  let deducted = 0;
  for (const d of deductions) {
    if (!Number.isFinite(d.quantity) || d.quantity <= 0) continue;

    // Lotes del producto en esa unidad, del que antes caduca al que después
    // (nulls al final). Cada "lote" es una fila (ubicación) del mismo producto.
    const { data: lots } = await supabase
      .from("inventory_items")
      .select("id, quantity, expiry_date")
      .eq("household_id", household.id)
      .eq("product_id", d.productId)
      .eq("unit", d.unit)
      .gt("quantity", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false });

    let remaining = d.quantity;
    for (const lot of lots ?? []) {
      if (remaining <= 0) break;
      const current = Number(lot.quantity);
      const take = Math.min(current, remaining);
      const newQty = Math.max(0, current - take);
      const { error } = await supabase
        .from("inventory_items")
        .update({ quantity: newQty, updated_by: userId })
        .eq("id", lot.id);
      if (error) return { error: "No se pudo actualizar el inventario." };
      remaining -= take;
    }
    if (remaining < d.quantity) deducted += 1;
  }

  revalidatePath("/inventario");
  revalidatePath("/menus");
  return { ok: true, deducted };
}

export type TonightState = { error?: string; cards?: TonightCard[] };

/**
 * "¿Qué hago hoy?" (M6): ranking determinista (sin IA) de recetas del recetario
 * cocinables ahora mismo con lo que hay, priorizando lo que caduca. Devuelve
 * 2–3 tarjetas; el cálculo vive en `tonight.ts` (puro y testeable).
 */
export async function computeTonightAction(): Promise<TonightState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const [recipes, inventory, catalog, signals] = await Promise.all([
    getSavedRecipesForMenu(),
    getInventory(),
    getProductCatalog(),
    getRecipeSignals(household.id),
  ]);

  // Stock real por producto y por nombre (cantidad > 0).
  const stockByProduct = new Map<string, number>();
  for (const i of inventory) {
    stockByProduct.set(
      i.productId,
      (stockByProduct.get(i.productId) ?? 0) + i.quantity,
    );
  }
  const stockProductIds = new Set<string>();
  for (const [pid, qty] of stockByProduct) if (qty > 0) stockProductIds.add(pid);
  const stockNames = new Set<string>();
  for (const i of inventory) {
    if (i.quantity > 0) stockNames.add(normalizeName(i.productName));
  }

  // Productos "consumir pronto" (caducado o caduca pronto), el más urgente por
  // producto, para el bonus y la razón de la tarjeta.
  const soonByProduct = new Map<string, TonightSoonInfo>();
  for (const i of inventory) {
    if (i.quantity <= 0) continue;
    const status = getInventoryStatus({
      quantity: i.quantity,
      expiryDate: i.expiryDate,
      useSoon: i.useSoon,
      minQuantity: i.minQuantity,
    });
    if (!status.soon && !status.expired) continue;
    const exp = getExpiryStatus(i.expiryDate);
    const info: TonightSoonInfo = {
      name: i.productName,
      days: exp?.days ?? null,
      expired: status.expired,
    };
    const prev = soonByProduct.get(i.productId);
    const moreUrgent =
      !prev ||
      (info.expired && !prev.expired) ||
      (info.days !== null && (prev.days === null || info.days < prev.days));
    if (moreUrgent) soonByProduct.set(i.productId, info);
  }

  const cards = rankTonight({
    recipes: recipes.map((r) => ({
      id: r.id,
      name: r.name,
      ingredients: r.ingredients.map((i) => ({
        name: i.name,
        productId: i.productId,
      })),
    })),
    catalog: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      normalizedName: c.normalizedName,
      defaultUnit: c.defaultUnit,
    })),
    stockProductIds,
    stockNames,
    soonByProduct,
    signals: new Map(
      signals.map((s) => [
        s.recipeId,
        { avgRating: s.avgRating, lastCookedAt: s.lastCookedAt },
      ]),
    ),
    todayISO: todayLocalISO(),
  });

  return { cards };
}

/**
 * Añade una receta guardada al hueco de HOY (M6). El slot se elige por la hora
 * (comida antes de las 16:00, cena después). Va a la semana actual aunque la
 * vista muestre otra.
 */
export async function addRecipeToMenuAction(
  recipeId: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("household_id", household.id)
    .maybeSingle();
  if (!recipe) return { error: "Receta no encontrada." };

  const weekStart = getWeekStart();
  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  const date = todayLocalISO();
  const slot = new Date().getHours() < 16 ? "lunch" : "dinner";

  const position = await nextPosition(supabase, menuId, date, slot);

  const { error } = await supabase.from("menu_entries").insert({
    menu_id: menuId,
    household_id: household.id,
    date,
    meal_slot: slot,
    recipe_id: recipeId,
    position,
  });
  if (error) return { error: "No se pudo añadir al menú." };

  revalidatePath("/menus");
  return { ok: true };
}

export type MissingState = {
  error?: string;
  candidates?: MissingCandidate[];
};

/**
 * Fase 1 de "Añadir a la lista lo que falte" (D3): calcula qué ingredientes del
 * menú faltan, con matching en tres niveles (product_id → nombre exacto → fuzzy
 * trigram; ver `missing.ts`) y descartando lo que ya está en stock (cantidad >
 * 0, corrige el bug anterior que contaba productos a 0 como disponibles) o ya en
 * la lista. No inserta nada: devuelve los candidatos para que el usuario revise
 * y desmarque antes de confirmar.
 */
export async function computeMissingForMenuAction(
  menuId: string,
): Promise<MissingState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  // Ingredientes de las recetas del menú (con su product_id si B1 lo vinculó).
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
    .select("name, quantity, unit, product_id")
    .in("recipe_id", recipeIds);

  const [inventory, catalog] = await Promise.all([
    getInventory(),
    getProductCatalog(),
  ]);

  // Stock real: suma por producto > 0 (no basta con que exista la fila).
  const stockByProduct = new Map<string, number>();
  for (const i of inventory) {
    stockByProduct.set(
      i.productId,
      (stockByProduct.get(i.productId) ?? 0) + i.quantity,
    );
  }
  const stockProductIds = new Set<string>();
  for (const [pid, qty] of stockByProduct) {
    if (qty > 0) stockProductIds.add(pid);
  }
  const stockNames = new Set<string>();
  for (const i of inventory) {
    if (i.quantity > 0) stockNames.add(normalizeName(i.productName));
  }

  // Lo que ya está en la lista activa (por producto y por nombre).
  const { data: listItems } = await supabase
    .from("shopping_list_items")
    .select("name, product_id")
    .eq("list_id", list.id);
  const listProductIds = new Set<string>();
  const listNames = new Set<string>();
  for (const it of listItems ?? []) {
    if (it.product_id) listProductIds.add(it.product_id);
    listNames.add(normalizeName(it.name));
  }

  const candidates = computeMissingIngredients({
    ingredients: (ingredients ?? []).map((i) => ({
      name: i.name,
      productId: i.product_id,
      unit: i.unit,
    })),
    catalog: catalog.map((c) => ({
      id: c.id,
      name: c.name,
      normalizedName: c.normalizedName,
      defaultUnit: c.defaultUnit,
    })),
    stockProductIds,
    stockNames,
    listProductIds,
    listNames,
  });

  return { candidates };
}

/**
 * Fase 2 de "Añadir a la lista lo que falte" (D3): inserta en la lista los
 * ingredientes que el usuario dejó marcados. Recalcula los faltantes en el
 * servidor y solo usa `includedKeys` para filtrar (nunca confía en los datos de
 * producto que envíe el cliente). Los que casaron con el catálogo se insertan
 * vinculados (`product_id`), para que "Finalizar compra" los mande a su
 * ubicación por defecto; los sin match entran como texto libre.
 */
export async function confirmMissingToListAction(
  menuId: string,
  includedKeys: string[],
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  const computed = await computeMissingForMenuAction(menuId);
  if (computed.error) return { error: computed.error };

  const included = new Set(includedKeys);
  const toInsert = (computed.candidates ?? []).filter((c) =>
    included.has(c.key),
  );
  if (toInsert.length === 0) return { ok: true, added: 0 };

  const { data: last } = await supabase
    .from("shopping_list_items")
    .select("position")
    .eq("list_id", list.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (last?.position ?? 0) + 1;

  const rows = toInsert.map((c) => ({
    list_id: list.id,
    household_id: household.id,
    product_id: c.match?.productId ?? null,
    name: c.match?.productName ?? c.ingredientName,
    unit: c.match?.defaultUnit ?? c.unit ?? null,
    added_by: userId,
    position: position++,
  }));

  const { error } = await supabase.from("shopping_list_items").insert(rows);
  if (error) return { error: "No se pudieron añadir los ingredientes." };

  revalidatePath("/lista");
  return { ok: true, added: rows.length };
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

// ---------------------------------------------------------------------------
// Perfil de menús del hogar (N3)
// ---------------------------------------------------------------------------

/**
 * Guarda (upsert) el perfil de menús del hogar. Crear la fila —aunque sea con
 * defaults ("Ahora no")— marca el onboarding como resuelto y no vuelve a
 * aparecer. Revalida /menus para que el nuevo nº de huecos (desayuno) y el
 * sesgo del prompt tengan efecto inmediato.
 */
export async function saveMenuPrefsAction(
  input: MenuPrefsInput,
): Promise<RuleState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const parsed = menuPrefsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("household_menu_prefs").upsert(
    {
      household_id: household.id,
      goal: d.goal,
      diet_style: d.dietStyle,
      avoid_text: d.avoidText,
      servings: d.servings,
      plan_breakfast: d.planBreakfast,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "household_id" },
  );
  if (error) return { error: "No se pudieron guardar las preferencias." };

  revalidatePath("/menus");
  return { ok: true };
}
