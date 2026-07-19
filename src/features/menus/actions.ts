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
      const { data: recipe } = await supabase
        .from("recipes")
        .insert({
          household_id: household.id,
          name: meal.recipe_name,
          description: meal.description,
          servings: 2,
          meal_types: [meal.slot],
          source: "ai",
          created_by: userId,
        })
        .select("id")
        .single();
      if (!recipe) continue;

      if (meal.ingredients.length > 0) {
        await supabase.from("recipe_ingredients").insert(
          meal.ingredients.map((ing) => ({
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
      });
    }
  }

  await supabase
    .from("weekly_menus")
    .update({ generated_by: "ai" })
    .eq("id", menuId);

  revalidatePath("/menus");
  return { ok: true };
}

export async function setMenuEntryAction(
  weekStart: string,
  date: string,
  slot: string,
  freeText: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  const text = freeText.trim();

  const { data: existing } = await supabase
    .from("menu_entries")
    .select("id")
    .eq("menu_id", menuId)
    .eq("date", date)
    .eq("meal_slot", slot)
    .maybeSingle();

  if (!text) {
    if (existing) await supabase.from("menu_entries").delete().eq("id", existing.id);
    revalidatePath("/menus");
    return { ok: true };
  }

  if (existing) {
    await supabase
      .from("menu_entries")
      .update({ free_text: text, recipe_id: null })
      .eq("id", existing.id);
  } else {
    await supabase.from("menu_entries").insert({
      menu_id: menuId,
      household_id: household.id,
      date,
      meal_slot: slot,
      free_text: text,
    });
  }

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
