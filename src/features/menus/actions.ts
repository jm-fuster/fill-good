"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getModel } from "@/lib/ai/models";
import { menuSchema } from "@/lib/ai/menu-schema";
import { buildMenuPrompt } from "@/lib/ai/menu-prompt";
import { getExpiryStatus } from "@/lib/dates";
import { getWeekDays } from "@/lib/dates";
import { normalizeName } from "@/lib/normalize";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, UnitType } from "@/lib/supabase/types";
import { getCurrentHousehold } from "@/features/household/queries";
import { getInventory } from "@/features/inventory/queries";
import { getActiveList } from "@/features/shopping-list/queries";
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

export async function generateMenuAction(
  weekStart: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  // Inventario para el prompt (prioriza lo que caduca).
  const inventory = await getInventory();
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

  let generated;
  try {
    const { object } = await generateObject({
      model: getModel("menus"),
      schema: menuSchema,
      prompt: buildMenuPrompt(invLines),
    });
    generated = object;
  } catch (err) {
    console.error("Error al generar el menú:", err);
    return { error: "No se pudo generar el menú. Inténtalo de nuevo." };
  }

  const weekDays = getWeekDays(weekStart);

  // Regenerar reemplaza el menú de la semana.
  await supabase.from("menu_entries").delete().eq("menu_id", menuId);

  for (const day of generated.days) {
    const date = weekDays[day.day_index];
    if (!date) continue;
    for (const meal of day.meals) {
      // Como mucho 2 platos por hueco (el schema lo pide, pero lo garantizamos).
      const dishes = meal.dishes.slice(0, 2);
      let position = 0;
      for (const dish of dishes) {
        const { data: recipe } = await supabase
          .from("recipes")
          .insert({
            household_id: household.id,
            name: dish.recipe_name,
            normalized_name: normalizeName(dish.recipe_name),
            description: dish.description,
            servings: 2,
            meal_types: [meal.slot],
            source: "ai",
            created_by: userId,
          })
          .select("id")
          .single();
        if (!recipe) continue;

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
