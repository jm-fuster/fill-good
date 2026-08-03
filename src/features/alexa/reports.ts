import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeCookedDeductions } from "@/features/menus/cooked";
import { slotLabel, type MealSlotKey } from "@/features/menus/slots";
import { getExpiryStatus, getWeekStart, shiftDays, todayLocalISO } from "@/lib/dates";
import type { Database, UnitType } from "@/lib/supabase/types";

/**
 * Las consultas de SOLO LECTURA que contesta la skill: qué hay en la lista, qué
 * caduca y qué toca hoy de menú.
 *
 * Viven aquí y no en las `queries.ts` de cada feature porque aquellas leen con
 * el cliente de Clerk y el hogar activo de la cookie, y por voz no hay ninguna
 * de las dos cosas: el cliente es el service-role (sin RLS) y el hogar sale del
 * vínculo ya verificado. De ahí que cada consulta lleve su `household_id`
 * explícito — sin él saldrían mezclados los hogares de los que eres miembro.
 *
 * Devuelven datos, no frases: el texto lo pone `respond.ts`, como el resto.
 */

type Admin = SupabaseClient<Database>;

/** Nombre vivo de una fila que enlaza con el catálogo (ver `MergeResult.name`). */
function displayName(
  product: unknown,
  fallback: string | null,
): string | null {
  const name = (product as { name: string } | null)?.name;
  return name ?? fallback;
}

/**
 * Los artículos pendientes de la lista activa, en el orden de la lista.
 *
 * **No crea la lista activa** si no hay ninguna, al contrario que el apuntado:
 * una pregunta no debe dejar rastro. Sin lista, no hay nada que leer.
 */
export async function readShoppingList(
  admin: Admin,
  householdId: string,
): Promise<string[]> {
  const { data: list } = await admin
    .from("shopping_lists")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!list) return [];

  const { data } = await admin
    .from("shopping_list_items")
    .select("name, product:products(name)")
    .eq("household_id", householdId)
    .eq("list_id", list.id)
    .eq("is_checked", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  // El nombre lo manda el producto y la columna es el respaldo: el rótulo de la
  // fila es una copia del alta y puede haber quedado desfasado tras un
  // renombrado. El texto libre no tiene producto detrás, y ahí es lo único que
  // hay.
  return (data ?? [])
    .map((row) => displayName(row.product, row.name))
    .filter((name): name is string => name !== null);
}

export type ExpiringItem = { name: string; days: number };

/**
 * Lo que caduca dentro de la ventana de aviso, de lo más urgente a lo menos.
 * Misma consulta que el resumen diario por push, para que las dos vías digan lo
 * mismo. `days` es negativo en lo ya caducado.
 *
 * Se agrupa por producto quedándose con la fecha más próxima: dos lotes del
 * mismo yogur son una sola cosa de la que preocuparse, y recitar el nombre dos
 * veces suena a error.
 */
export async function readExpiring(
  admin: Admin,
  householdId: string,
  warnDays: number,
): Promise<ExpiringItem[]> {
  const { data } = await admin
    .from("inventory_items")
    .select("expiry_date, product:products(name)")
    .eq("household_id", householdId)
    .not("expiry_date", "is", null)
    .gt("quantity", 0)
    .lte("expiry_date", shiftDays(todayLocalISO(), warnDays))
    .order("expiry_date", { ascending: true });

  const porNombre = new Map<string, ExpiringItem>();
  for (const row of data ?? []) {
    const status = getExpiryStatus(row.expiry_date, warnDays);
    if (!status || status.status === "ok") continue;
    const name = displayName(row.product, null);
    if (name === null || porNombre.has(name)) continue;
    porNombre.set(name, { name, days: status.days });
  }
  return [...porNombre.values()];
}

export type MealToday = { slot: MealSlotKey; label: string; names: string[] };

/** Orden en que se cuentan las comidas del día, que no es el alfabético. */
const SLOT_ORDER: MealSlotKey[] = ["breakfast", "lunch", "dinner"];

/** El menú de esta semana, o null si el hogar no tiene ninguno. */
async function currentMenuId(
  admin: Admin,
  householdId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("weekly_menus")
    .select("id")
    .eq("household_id", householdId)
    .eq("week_start", getWeekStart())
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Lo planificado para hoy, por hueco de comida. `only` acota a uno solo cuando
 * la pregunta lo dice («qué hay de cena»).
 *
 * Lo saltado no cuenta: si ya dijiste que esa cena no la hacías, contestarla
 * sería repetir una decisión que ya tomaste.
 */
export async function readTodayMenu(
  admin: Admin,
  householdId: string,
  only: MealSlotKey | null,
): Promise<MealToday[]> {
  const menuId = await currentMenuId(admin, householdId);
  if (!menuId) return [];

  let query = admin
    .from("menu_entries")
    .select("meal_slot, free_text, recipe:recipes(name)")
    .eq("household_id", householdId)
    .eq("menu_id", menuId)
    .eq("date", todayLocalISO())
    .is("skipped_at", null)
    .order("position", { ascending: true });
  if (only) query = query.eq("meal_slot", only);
  const { data } = await query;

  const porHueco = new Map<string, string[]>();
  for (const row of data ?? []) {
    const name = displayName(row.recipe, row.free_text);
    if (name === null) continue;
    porHueco.set(row.meal_slot, [...(porHueco.get(row.meal_slot) ?? []), name]);
  }

  return SLOT_ORDER.filter((slot) => porHueco.has(slot)).map((slot) => ({
    slot,
    label: slotLabel(slot),
    names: porHueco.get(slot) ?? [],
  }));
}

export type TodayDish = {
  entryId: string;
  name: string;
  /** null en el texto libre: se puede marcar cocinado, pero no tiene receta. */
  recipeId: string | null;
  cookedAt: string | null;
};

/**
 * Los platos de hoy con su id de entrada, que es lo que hace falta para poder
 * marcarlos cocinados. Va aparte de {@link readTodayMenu}, que agrupa para
 * contarlos en voz alta y no necesita ids.
 *
 * Aquí NO se filtra lo saltado: si dices que has cocinado algo que habías dado
 * por no hecho, lo que quieres es corregirlo, no que te digan que no existe.
 */
export async function readTodayDishes(
  admin: Admin,
  householdId: string,
  only: MealSlotKey | null,
): Promise<TodayDish[]> {
  const menuId = await currentMenuId(admin, householdId);
  if (!menuId) return [];

  let query = admin
    .from("menu_entries")
    .select("id, free_text, cooked_at, recipe_id, recipe:recipes(name)")
    .eq("household_id", householdId)
    .eq("menu_id", menuId)
    .eq("date", todayLocalISO())
    .order("position", { ascending: true });
  if (only) query = query.eq("meal_slot", only);
  const { data } = await query;

  return (data ?? []).flatMap((row) => {
    const name = displayName(row.recipe, row.free_text);
    if (name === null) return [];
    return [
      {
        entryId: row.id,
        name,
        recipeId: row.recipe_id,
        cookedAt: row.cooked_at,
      },
    ];
  });
}

/** Un ingrediente que sí se puede descontar, ya resuelto contra el catálogo. */
export type CookedLine = {
  productId: string;
  productName: string;
  unit: UnitType;
  quantity: number;
};

export type CookedPlan = {
  lines: CookedLine[];
  /** Ingredientes que NO se pueden descontar, solo para poder decir cuántos. */
  skipped: number;
};

/**
 * Qué se puede descontar de una receta cocinada. El cálculo es el MISMO que usa
 * el modal de la app (`computeCookedDeductions`): así la voz no puede inventarse
 * una regla propia sobre unidades o emparejados. Con una diferencia deliberada en
 * los DATOS que se le pasan, no en las reglas: sin contenidos declarados, la voz
 * no usa el puente ud↔medida (ver el comentario en la llamada).
 *
 * Se queda solo con lo descontable y cuenta el resto. Los motivos de cada
 * descarte —«no está en tu catálogo», «está en otra unidad»— son valiosos en una
 * pantalla y ruido en un altavoz: por voz basta con cuántos se quedan fuera.
 */
export async function planCooked(
  admin: Admin,
  householdId: string,
  recipeId: string,
): Promise<CookedPlan> {
  const [{ data: ingredients }, { data: products }, { data: stock }] =
    await Promise.all([
      admin
        .from("recipe_ingredients")
        .select("name, quantity, unit, product_id")
        .eq("household_id", householdId)
        .eq("recipe_id", recipeId),
      admin
        .from("products")
        .select("id, name, normalized_name, default_unit")
        .eq("household_id", householdId),
      admin
        .from("inventory_items")
        .select("product_id, unit, quantity")
        .eq("household_id", householdId)
        .gt("quantity", 0),
    ]);
  if (!ingredients || ingredients.length === 0) return { lines: [], skipped: 0 };

  const stockByProductUnit = new Map<string, Map<UnitType, number>>();
  for (const row of stock ?? []) {
    const byUnit =
      stockByProductUnit.get(row.product_id) ?? new Map<UnitType, number>();
    byUnit.set(row.unit, (byUnit.get(row.unit) ?? 0) + Number(row.quantity));
    stockByProductUnit.set(row.product_id, byUnit);
  }

  const deductions = computeCookedDeductions({
    ingredients: ingredients.map((row) => ({
      name: row.name,
      productId: row.product_id,
      unit: row.unit,
      quantity: row.quantity === null ? null : Number(row.quantity),
    })),
    catalog: (products ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      defaultUnit: row.default_unit,
    })),
    stockByProductUnit,
    /*
      A propósito SIN contenidos declarados, o sea sin el puente ud↔medida que sí
      usa la app. Aquí quien escribe es `planDeduction` (`resolve.ts`), que conoce
      la conversión dentro de la misma familia (g↔kg, ml↔l) pero no ese puente: si
      el plan contara como descontable un ingrediente que luego no puede tocar, la
      skill diría en voz alta «descuento tres» y descontaría dos. Mejor que la voz
      se quede corta que no que mienta.

      Darle paridad con la app es cambiar `planDeduction`, que además sostiene la
      conversación de «gasta dos tomates» (`ask_unit` / `unit_mismatch`) y está
      cubierto por `check:alexa`: es una decisión aparte, no un olvido.
    */
    contentByProduct: new Map(),
  });

  const lines: CookedLine[] = [];
  for (const d of deductions) {
    if (!d.deductible || d.productId === null || d.unit === null) continue;
    if (!(d.suggestedQty > 0)) continue;
    lines.push({
      productId: d.productId,
      productName: d.productName ?? d.ingredientName,
      unit: d.unit,
      quantity: d.suggestedQty,
    });
  }
  return { lines, skipped: deductions.length - lines.length };
}
