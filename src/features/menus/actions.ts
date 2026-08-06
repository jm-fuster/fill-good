"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { getModel } from "@/lib/ai/models";
import { classifyAiError } from "@/lib/ai/errors";
import { menuSchema, singleDishSchema } from "@/lib/ai/menu-schema";
import {
  buildMenuPrompt,
  buildRerollPrompt,
  type MenuInventoryLine,
  type MenuPinnedLine,
  type MenuRecentDish,
  type MenuRecipeLine,
  type MenuRuleLine,
} from "@/lib/ai/menu-prompt";
import {
  getCurrentSeason,
  getExpiryStatus,
  getWeekDays,
  getWeekStart,
  hourInSpain,
  relativeDaysLabel,
  shiftWeek,
  todayLocalISO,
} from "@/lib/dates";
import { normalizeName } from "@/lib/normalize";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, UnitType } from "@/lib/supabase/types";
import { convertQuantity, roundQuantity, type UnitContent } from "@/lib/units";
import { enforceAiRateLimit } from "@/lib/ai/rate-limit";
import { getCurrentHousehold } from "@/features/household/queries";
import { getAiConsent } from "@/features/ai-consent/queries";
import { AI_CONSENT_REQUIRED_ERROR } from "@/features/ai-consent/version";
import { recordStockEvent } from "@/features/inventory/events";
import { getInventory } from "@/features/inventory/queries";
import { getInventoryStatus } from "@/features/inventory/status";
import {
  getActiveList,
  getActiveListContents,
  getProductCatalog,
  getRestockCandidates,
  type RestockCandidate,
} from "@/features/shopping-list/queries";
import {
  getRecipeCostsForIds,
  getRecipeSignals,
  getSavedRecipesForMenu,
  type SavedRecipeForMenu,
} from "@/features/recipes/queries";
import { rankTonight, type TonightCard, type TonightSoonInfo } from "./tonight";
import {
  getMenuEntries,
  getMenuPrefs,
  getMenuRules,
  getWeekMenusWithEntries,
  type MenuPrefs,
  type MenuRule,
} from "./queries";
import { activeSlots, slotLabel } from "./slots";
import {
  buildCatalogIndex,
  collectRecentDishes,
  recipeFitsActiveSlots,
  selectRecipesForPrompt,
  summarizeAvailability,
  type RecipeAvailability,
} from "./prompt-context";
import { isSkipReason } from "./skip-reason";
import { weeklyBudgetTarget } from "./week-budget";
import type { MissingCandidate } from "./missing";
import { computeMissingForRecipes } from "./missing-server";
import {
  computeCookedDeductions,
  resolveStockTarget,
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
  addMenuEntrySchema,
  addRecipeToSlotSchema,
  cookedDeductionsSchema,
  menuPrefsInputSchema,
  menuRuleInputSchema,
  slotTargetSchema,
  updateMenuEntrySchema,
  type MenuPrefsInput,
  type MenuRuleInput,
} from "./schemas";

export type MenuState = {
  error?: string;
  ok?: boolean;
  added?: number;
  /**
   * Id del menú de la semana, que devuelve `generateMenuAction` porque puede
   * acabar de CREARLO (`ensureMenu`). La vista lo recibe como prop del servidor,
   * o sea que en una semana virgen lo tiene en null hasta que aterriza el
   * `router.refresh()`; sin esto, la acción de «añadir lo que falte» del toast
   * de éxito no tenía a qué menú apuntar durante esa ventana.
   */
  menuId?: string;
  /** true si falta el consentimiento de IA: la UI debe pedirlo antes de reintentar. */
  needsAiConsent?: boolean;
};

async function ensureMenu(
  supabase: SupabaseClient<Database>,
  householdId: string,
  weekStart: string,
): Promise<string | null> {
  // La unicidad de `week_start` es POR hogar: sin el filtro, un usuario con dos
  // hogares con menú esa semana recibía dos filas y `.maybeSingle()` fallaba.
  const { data: existing } = await supabase
    .from("weekly_menus")
    .select("id")
    .eq("household_id", householdId)
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
  householdId: string,
  menuId: string,
  date: string,
  slot: string,
): Promise<number> {
  const { data: last } = await supabase
    .from("menu_entries")
    .select("position")
    .eq("household_id", householdId)
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
    await supabase
      .from("recipes")
      .delete()
      .eq("household_id", householdId)
      .in("id", orphans);
  }
}

// ---------------------------------------------------------------------------
// Contexto del hogar que ven los prompts de menú
// ---------------------------------------------------------------------------

/** Lo que la IA sabe del hogar al proponer platos, ya cocinado para el prompt. */
type HouseholdMenuContext = {
  season: "winter" | "summer";
  inventory: MenuInventoryLine[];
  /** Recetario de temporada, de más a menos recomendable y con el tope aplicado. */
  recipes: MenuRecipeLine[];
  rules: MenuRuleLine[];
  /** Nombres apuntados en la lista de la compra activa. */
  shoppingList: string[];
  /** Platos de las dos semanas anteriores, sin repetidos. */
  recentDishes: MenuRecentDish[];
  /** Objetivo de gasto semanal en € (del presupuesto mensual), o null. */
  weeklyBudget: number | null;
  prefs: MenuPrefs;
  /** Reglas ACTIVAS, para la validación determinista posterior (`rules.ts`). */
  activeRules: MenuRule[];
  /** Recetario COMPLETO (sin filtrar por temporada ni recortar): resuelve ids. */
  savedRecipes: SavedRecipeForMenu[];
};

/** Semanas hacia atrás de las que se arrastran platos para no repetirlos. */
const RECENT_WEEKS = 2;

/**
 * Reúne el contexto que ven los DOS prompts de menú —la semana entera y el plato
 * suelto de «otra idea»/«+»—, para que los dos decidan con la misma información.
 * Antes cada uno se lo montaba por su cuenta con las mismas cinco consultas
 * copiadas, y cualquier señal nueva había que acordarse de añadirla dos veces.
 *
 * Lo que aporta sobre las señales de siempre (inventario, recetario, reglas y
 * perfil):
 *   · La LISTA DE LA COMPRA. Lo apuntado se compra en los próximos días, así que
 *     al planificar una semana cuenta como disponible; sin esto, una receta a la
 *     que solo le faltaba lo que ya ibas a comprar parecía igual de cara que una
 *     que obliga a comprar cuatro cosas nuevas.
 *   · Qué ingredientes faltan DE VERDAD, con el mismo emparejado que «añadir a
 *     la lista lo que falte» (ver `prompt-context.ts`). El modelo ya no tiene
 *     que contar marcas de "(en casa)" ingrediente a ingrediente.
 *   · El COSTE por ración (M7) y los minutos de preparación, que ya existían en
 *     la ficha de cada receta y no llegaban al generador.
 *   · Los platos de las DOS SEMANAS ANTERIORES: la variedad era solo dentro de
 *     la semana, así que dos generaciones seguidas salían casi calcadas.
 */
async function loadHouseholdMenuContext(
  householdId: string,
  weekStart: string,
): Promise<HouseholdMenuContext> {
  const previousWeekStarts = Array.from({ length: RECENT_WEEKS }, (_, i) =>
    shiftWeek(weekStart, -(i + 1)),
  );

  const [
    inventory,
    recipesAndCosts,
    signals,
    allRules,
    prefs,
    catalog,
    listContents,
    previousWeeks,
    household,
  ] = await Promise.all([
    getInventory(),
    // El coste necesita los ids del recetario, así que son dos consultas
    // encadenadas; encadenarlas AQUÍ las deja corriendo en paralelo con las
    // demás en vez de añadir una tanda secuencial más.
    (async () => {
      const saved = await getSavedRecipesForMenu();
      const costs = await getRecipeCostsForIds(saved.map((r) => r.id));
      return { saved, costs };
    })(),
    getRecipeSignals(householdId),
    getMenuRules(),
    getMenuPrefs(),
    getProductCatalog(),
    getActiveListContents(),
    getWeekMenusWithEntries(previousWeekStarts),
    // Va en `cache()` y este request ya la ha llamado: sale gratis, y trae el
    // presupuesto mensual del que se deriva el objetivo de la semana.
    getCurrentHousehold(),
  ]);

  const { saved: savedRecipes, costs } = recipesAndCosts;
  const season = getCurrentSeason();
  const activeRules = allRules.filter((r) => r.active);

  // Existencias reales: suma por producto > 0, el mismo criterio que D3 (una
  // fila a cero es un producto agotado, no uno disponible).
  const stockByProduct = new Map<string, number>();
  for (const i of inventory) {
    stockByProduct.set(
      i.productId,
      (stockByProduct.get(i.productId) ?? 0) + i.quantity,
    );
  }
  const stockProductIds = new Set<string>();
  for (const [productId, qty] of stockByProduct) {
    if (qty > 0) stockProductIds.add(productId);
  }
  const stockNames = new Set<string>();
  for (const i of inventory) {
    if (i.quantity > 0) stockNames.add(normalizeName(i.productName));
  }

  const catalogIndex = buildCatalogIndex(
    catalog.map((c) => ({
      id: c.id,
      name: c.name,
      normalizedName: c.normalizedName,
      defaultUnit: c.defaultUnit,
    })),
  );

  const signalsById = new Map(signals.map((s) => [s.recipeId, s]));
  const ruleRecipeIds = new Set(
    activeRules
      .map((r) => r.recipeId)
      .filter((id): id is string => id !== null),
  );

  // Dos filtros, no uno: la temporada y el HUECO. Una receta de solo desayuno en
  // un hogar que no planifica desayuno no tiene dónde ir, y ofrecérsela al modelo
  // solo consigue que la ponga de cena. Las nombradas por una regla activa
  // sobreviven al filtro, la misma promesa que con el tope de recetas: si la
  // regla existe, el modelo tiene que saber que la receta existe.
  const activeSlotKeys = activeSlots(prefs.planBreakfast).map((s) => s.key);
  const seasonalRecipes = savedRecipes.filter(
    (r) =>
      (r.seasons.includes("all") || r.seasons.includes(season)) &&
      (recipeFitsActiveSlots(r.mealTypes, activeSlotKeys) ||
        ruleRecipeIds.has(r.id)),
  );
  const availabilityById = new Map<string, RecipeAvailability>();
  for (const r of seasonalRecipes) {
    availabilityById.set(
      r.id,
      summarizeAvailability({
        ingredients: r.ingredients,
        index: catalogIndex,
        stockProductIds,
        stockNames,
        listProductIds: listContents.productIds,
        listNames: listContents.names,
      }),
    );
  }

  const chosenIds = selectRecipesForPrompt(
    seasonalRecipes.map((r) => ({
      id: r.id,
      availability: availabilityById.get(r.id)!,
      avgRating: signalsById.get(r.id)?.avgRating ?? null,
      lastCookedAt: signalsById.get(r.id)?.lastCookedAt ?? null,
      requiredByRule: ruleRecipeIds.has(r.id),
    })),
    { todayISO: todayLocalISO() },
  );

  const seasonalById = new Map(seasonalRecipes.map((r) => [r.id, r]));
  const recipeLines: MenuRecipeLine[] = chosenIds.map((id) => {
    const recipe = seasonalById.get(id)!;
    const sig = signalsById.get(id);
    const cost = costs.get(id);
    return {
      id,
      name: recipe.name,
      mealTypes: recipe.mealTypes,
      avgRating: sig?.avgRating ?? null,
      timesCooked: sig?.timesCooked ?? 0,
      lastCookedLabel: sig?.lastCookedAt
        ? relativeDaysLabel(sig.lastCookedAt)
        : null,
      prepMinutes: recipe.prepMinutes,
      // El coste de M7 es el de la receta ENTERA, escrita para sus raciones:
      // sin dividir, una receta para seis parecería el plato caro de la semana.
      costPerServing:
        cost && cost.pricedCount > 0 ? cost.total / recipe.servings : null,
      costPartial: cost ? !cost.complete : false,
      availability: availabilityById.get(id)!,
      ingredients: recipe.ingredients.map((i) => i.name),
    };
  });

  const invLines: MenuInventoryLine[] = inventory.map((i) => {
    const exp = getExpiryStatus(i.expiryDate, 7);
    return {
      name: i.productName,
      quantity: i.quantity,
      unit: i.unit as string,
      expiresInDays: exp ? exp.days : null,
      useSoon: i.useSoon,
    };
  });

  // `skip_slot` NO entra aquí: viaja al prompt en su propia sección, con el día
  // y el hueco ya en palabras (ver `skippedSlotsSection`).
  const ruleLines: MenuRuleLine[] = activeRules.flatMap((r): MenuRuleLine[] => {
    if (r.kind === "free_text") {
      return r.textRule ? [{ kind: "free_text", text: r.textRule }] : [];
    }
    if (r.kind === "recipe_min_week" || r.kind === "recipe_max_week") {
      if (r.recipeName && r.value != null) {
        return [{ kind: r.kind, recipeName: r.recipeName, value: r.value }];
      }
    }
    return [];
  });

  // Platos recientes sin repetidos, de la semana más antigua a la más reciente.
  // Quién se cae de la lista (lo descartado, salvo lo rechazado por no apetecer)
  // lo decide `collectRecentDishes`, que es puro y lo fija `npm run check:menu`.
  const recentDishes = collectRecentDishes(
    previousWeekStarts.flatMap(
      (week) => previousWeeks.get(week)?.entries ?? [],
    ),
  );

  return {
    season,
    inventory: invLines,
    recipes: recipeLines,
    rules: ruleLines,
    shoppingList: listContents.labels,
    recentDishes,
    weeklyBudget: weeklyBudgetTarget(household?.monthlyBudget ?? null),
    prefs,
    activeRules,
    savedRecipes,
  };
}

/**
 * Resuelve a qué receta guardada se refiere un plato propuesto por la IA: el id
 * explícito si existe y, si no cuadra, el nombre normalizado. Trabaja sobre el
 * recetario COMPLETO, no sobre el recortado del prompt: el modelo puede nombrar
 * de memoria una receta que no vio listada, y enlazarla es mejor que crear un
 * duplicado efímero con el mismo nombre.
 */
function makeSavedRecipeResolver(savedRecipes: SavedRecipeForMenu[]) {
  const byId = new Map(savedRecipes.map((r) => [r.id, r]));
  const byNormalizedName = new Map<string, string>();
  for (const r of savedRecipes) {
    const norm = normalizeName(r.name);
    if (norm && !byNormalizedName.has(norm)) byNormalizedName.set(norm, r.id);
  }
  return {
    byId,
    resolve(savedRecipeId: string | null, recipeName: string): string | null {
      if (savedRecipeId && byId.has(savedRecipeId)) return savedRecipeId;
      return byNormalizedName.get(normalizeName(recipeName)) ?? null;
    },
  };
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

  // El contexto del hogar (inventario, recetario, lista de la compra, platos de
  // las semanas anteriores y preferencias) se envía a la IA de Google: sin
  // consentimiento no generamos. Al ampliar lo que viaja hay que repasar el
  // aviso de `ai-consent` y subir `AI_CONSENT_VERSION`.
  const consent = await getAiConsent();
  if (!consent.consented) {
    return { error: AI_CONSENT_REQUIRED_ERROR, needsAiConsent: true };
  }

  const weekDays = getWeekDays(weekStart);
  const today = todayLocalISO();
  /**
   * Un día que YA HA PASADO no se replanifica, en ninguno de los dos modos.
   *
   * No es una sutileza: al regenerar un jueves, el borrado se llevaba por
   * delante el lunes, el martes y el miércoles con su `cooked_at` dentro, que es
   * de donde salen `timesCooked` y `lastCookedAt` (`getRecipeSignals`). O sea que
   * rehacer la semana borraba la prueba de que cocinaste algo, el generador
   * volvía a creer que no lo habías hecho nunca y te lo proponía otra vez —
   * justo lo contrario de lo que buscan las señales—. Y encima metía platos
   * inventados en días ya vividos, que luego el repaso preguntaba uno a uno
   * («¿cocinasteis esto el lunes?») sin que nadie los hubiera planificado.
   *
   * Solo afecta a la regeneración en bloque: el «+» de un hueco suelto sigue
   * pudiendo poner algo en un día pasado, porque ahí lo pide el usuario a mano.
   */
  const isPast = (date: string) => date < today;
  if (weekDays.every(isPast)) {
    return {
      error: "Esa semana ya ha pasado: no se puede volver a planificar.",
    };
  }

  const supabase = createServerSupabaseClient();

  const rateError = await enforceAiRateLimit(supabase, "menu");
  if (rateError) return { error: rateError };

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  // Entradas que la regeneración conserva: las de días pasados SIEMPRE, y en
  // modo "fill" además las fijadas y las manuales. Se cuentan para las reglas y
  // se listan en el prompt para que la IA no las repita.
  const existingEntries = await getMenuEntries(menuId);
  const preserved = existingEntries.filter(
    (e) =>
      isPast(e.date) || (mode === "fill" && (e.pinned || e.source === "manual")),
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

  const context = await loadHouseholdMenuContext(household.id, weekStart);
  const { prefs, savedRecipes, activeRules } = context;
  const slotKeys = activeSlots(prefs.planBreakfast).map((s) => s.key);

  // Huecos que el hogar ha dicho que no se planifiquen («los miércoles no
  // planifiques cena»). Se cierran igual que los días pasados: la IA no los
  // rellena y el validador de reglas no coloca nada en ellos. Lo que ya hubiera
  // ahí NO se toca: la regla dice "no me lo planifiques", no "bórralo".
  const skippedSlots = new Set(
    activeRules
      .filter((r) => r.kind === "skip_slot" && r.weekday !== null && r.mealSlot)
      .map((r) => `${r.weekday}|${r.mealSlot}`),
  );
  const isSkipped = (dayIndex: number, slot: string) =>
    skippedSlots.has(`${dayIndex}|${slot}`);
  const skippedLines = weekDays.flatMap((date, dayIndex) =>
    slotKeys
      .filter((slot) => isSkipped(dayIndex, slot))
      .map(
        (slot) =>
          `${format(parseISO(date), "EEEE", { locale: es })}: ${slotLabel(
            slot,
          ).toLowerCase()}`,
      ),
  );

  let generated;
  try {
    const { object } = await generateObject({
      model: getModel("menus"),
      schema: menuSchema,
      abortSignal: AbortSignal.timeout(60_000),
      prompt: buildMenuPrompt({
        today: todayLocalISO(),
        season: context.season,
        inventory: context.inventory,
        recipes: context.recipes,
        rules: context.rules,
        shoppingList: context.shoppingList,
        recentDishes: context.recentDishes,
        weeklyBudget: context.weeklyBudget,
        skippedSlots: skippedLines,
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
    const kind = classifyAiError(err);
    return {
      error:
        kind === "rate_limit"
          ? "El servicio de IA está saturado ahora mismo. Espera un minuto y vuelve a intentarlo."
          : kind === "timeout"
            ? "La generación del menú tardó demasiado. Vuelve a intentarlo."
            : "No se pudo generar el menú. Inténtalo de nuevo.",
    };
  }

  // --- Construir la estructura para validar reglas ---
  const savedResolver = makeSavedRecipeResolver(savedRecipes);

  // Cada día lleva SIEMPRE comida y cena (aunque vacías) para que las reglas de
  // mínimo puedan colocar platos en cualquiera de los dos huecos. En modo "fill",
  // un hueco ocupado por platos conservados se rellena con esos platos marcados
  // como `immutable` (el validador los cuenta pero no los toca) y se ignoran los
  // platos que la IA haya propuesto para ese mismo hueco.
  //
  // Los días pasados entran igualmente en la estructura —lo que ya comiste
  // CUENTA para los mínimos y los máximos de la semana— pero con el hueco
  // marcado `locked`, que además cierra los que quedaron vacíos.
  const generatedByIndex = new Map(generated.days.map((d) => [d.day_index, d]));
  const structDays: MenuDay[] = [];
  // Huecos que la IA tenía que rellenar y platos que puso en ellos. El schema ya
  // no exige platos por hueco (ver `menu-schema.ts`: un hueco vacío es una
  // respuesta legítima y rechazar la respuesta entera por eso dejaba sin menú a
  // los hogares con un hueco cerrado), así que el «no ha generado nada» se
  // detecta aquí, que es donde se le puede decir al usuario que reintente.
  let openSlots = 0;
  let aiDishes = 0;
  for (let dayIndex = 0; dayIndex < weekDays.length; dayIndex += 1) {
    const date = weekDays[dayIndex];
    const locked = isPast(date);
    const genDay = generatedByIndex.get(dayIndex);
    const meals: MenuMeal[] = slotKeys.map((slot) => {
      // Cerrado por pasado o porque el hogar no quiere que se planifique.
      const closed = locked || isSkipped(dayIndex, slot);
      // Hueco conservado o cerrado: sus platos son inmutables; ignoramos la
      // propuesta de la IA para ese hueco.
      if (closed || occupiedSlots.has(`${date}|${slot}`)) {
        const dishes: MenuDish[] = preserved
          .filter((e) => e.date === date && e.slot === slot)
          .map((e) => ({
            savedRecipeId: e.recipeId,
            name: e.recipeName ?? e.freeText ?? "",
            immutable: true,
          }));
        return { slot, dishes, locked: closed };
      }
      openSlots += 1;
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
          savedRecipeId: savedResolver.resolve(
            dish.saved_recipe_id,
            dish.recipe_name,
          ),
          name: dish.recipe_name,
          payload,
        };
      });
      aiDishes += dishes.length;
      return { slot, dishes };
    });
    structDays.push({ dayIndex, meals });
  }

  // Ni un solo plato para toda una semana por rellenar: eso no es un menú con
  // huecos, es una generación que no ha salido. Se dice y se puede reintentar,
  // en vez de dejar al hogar mirando catorce huecos vacíos sin explicación. Con
  // `openSlots` a cero no hay nada que reprochar: en modo "fill" puede estar
  // todo conservado o cerrado, y entonces no había nada que generar.
  if (openSlots > 0 && aiDishes === 0) {
    console.error("La IA no propuso ningún plato para la semana", { weekStart });
    return { error: "No se pudo generar el menú. Inténtalo de nuevo." };
  }

  // Reglas de frecuencia enriquecidas con los metadatos de su receta.
  const validatable: ValidatableRule[] = activeRules.map((r) => {
    const meta = r.recipeId ? savedResolver.byId.get(r.recipeId) : null;
    return {
      kind: r.kind,
      recipeId: r.recipeId,
      value: r.value,
      recipe: meta ? { name: meta.name, mealTypes: meta.mealTypes } : null,
    };
  });

  const patched = validateAndPatchRules({ days: structDays }, validatable);

  // --- Inserción sin contaminar la tabla recipes ---
  // "replace" arrasa el resto de la semana; "fill" borra solo lo generado por IA
  // que no esté fijado y deja intactas las entradas conservadas. El `gte` de la
  // fecha es lo que salva los días ya vividos —y el "lo cocinamos" que llevan
  // dentro— del borrado de las dos ramas.
  const deleteFromToday = supabase
    .from("menu_entries")
    .delete()
    .eq("household_id", household.id)
    .eq("menu_id", menuId)
    .gte("date", today);
  if (mode === "replace") {
    await deleteFromToday;
  } else {
    await deleteFromToday.eq("source", "ai").eq("pinned", false);
  }

  for (const day of patched.days) {
    const date = weekDays[day.dayIndex];
    if (!date) continue;
    // Un día pasado no recibe platos nuevos. El validador ya no coloca nada en
    // él (`locked`), así que esto es el cinturón sobre los tirantes.
    if (isPast(date)) continue;
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
    .eq("household_id", household.id)
    .eq("id", menuId);

  // Limpia recetas efímeras huérfanas de generaciones anteriores.
  await cleanupOrphanEphemeralRecipes(supabase, household.id);

  revalidatePath("/menus");
  return { ok: true, menuId };
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

  const parsed = addMenuEntrySchema.safeParse({ weekStart, date, slot, freeText });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  ({ weekStart, date, slot, freeText } = parsed.data);
  const supabase = createServerSupabaseClient();

  const text = freeText.trim();
  if (!text) return { error: "Escribe el nombre del plato." };

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  const position = await nextPosition(
    supabase,
    household.id,
    menuId,
    date,
    slot,
  );

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

  const parsed = updateMenuEntrySchema.safeParse({ entryId, freeText });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  ({ entryId, freeText } = parsed.data);
  const supabase = createServerSupabaseClient();

  const text = freeText.trim();
  // Sin texto = quitar el plato (misma semántica que el botón "Quitar").
  if (!text) return removeMenuEntryAction(entryId);

  /*
    Guardar el MISMO nombre que ya tiene la receta enlazada no es una edición, y
    tratarlo como tal la desvinculaba sin que nadie hubiera cambiado nada: el
    panel llega con el nombre de la receta ya escrito en el campo, así que bastaba
    abrirlo —a fijar, a mover, a marcar cocinado— y pulsar «Guardar».

    Y desvincular no es cosmético. Con `recipe_id` a null se van, en silencio y a
    la vez: el coste de la semana (que pasa a «parcial»), los ingredientes que
    aporta a «añadir a la lista lo que falte», el descuento de inventario al
    cocinarla y las señales de `getRecipeSignals` —`timesCooked`/`lastCookedAt`,
    que son las que evitan que el generador te repita lo de la semana pasada—. Si
    además el plato estaba cocinado, con la señal se iba la prueba de que lo
    cocinaste.

    La vista ya no manda un guardado sin cambios, pero la regla vive aquí: un
    cliente viejo o la voz llaman igual.
  */
  const { data: linked } = await supabase
    .from("menu_entries")
    .select("recipe:recipes(name)")
    .eq("household_id", household.id)
    .eq("id", entryId)
    .maybeSingle();
  const linkedName = (linked as { recipe: { name: string } | null } | null)
    ?.recipe?.name;
  if (linkedName && normalizeName(linkedName) === normalizeName(text)) {
    return { ok: true };
  }

  // Editar una entrada la vuelve manual (ya se desvinculaba de la receta): así la
  // regeneración respetuosa (N2) no la pisa.
  const { error } = await supabase
    .from("menu_entries")
    .update({ free_text: text, recipe_id: null, source: "manual" })
    .eq("household_id", household.id)
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
    .eq("household_id", household.id)
    .eq("id", entryId);
  if (error) return { error: "No se pudo quitar el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Mueve un plato a otro hueco (N1). Actualiza `date`, `meal_slot` y `position`
 * (siguiente libre del destino, para no colisionar con el unique del hueco);
 * conserva `recipe_id`/`free_text` intactos, de modo que el coste (M7) y el
 * descuento de stock (M2) siguen funcionando. Mover a su propio hueco es un
 * no-op silencioso; no se puede mover a un día futuro un plato ya cocinado.
 *
 * El destino puede caer en OTRA semana: entonces la entrada cambia también de
 * `menu_id` (creando el menú de esa semana si no existe). Lo necesita el repaso
 * (R2), donde "lo haré otro día" para un plato del viernes pasado solo tiene
 * sentido si puede aterrizar en la semana en curso. Sin esto la entrada se
 * quedaría con una fecha fuera de la semana de su menú: invisible en la UI.
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
    .select("menu_id, date, meal_slot, cooked_at, menu:weekly_menus(week_start)")
    .eq("household_id", household.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  // Mover al hueco de origen: nada que hacer.
  if (entry.date === date && entry.meal_slot === slot) return { ok: true };

  // Un plato ya cocinado no puede viajar a un día futuro.
  if (entry.cooked_at && date > todayLocalISO()) {
    return { error: "No puedes mover a un día futuro un plato ya cocinado." };
  }

  // ¿Cambia de semana? Entonces cambia de menú (y se crea si hace falta).
  const originWeek =
    (entry as { menu: { week_start: string } | null }).menu?.week_start ?? null;
  const targetWeek = getWeekStart(new Date(`${date}T00:00:00`));
  let menuId = entry.menu_id;
  if (originWeek && originWeek !== targetWeek) {
    const targetMenuId = await ensureMenu(supabase, household.id, targetWeek);
    if (!targetMenuId) return { error: "No se pudo mover el plato." };
    menuId = targetMenuId;
  }

  const position = await nextPosition(
    supabase,
    household.id,
    menuId,
    date,
    slot,
  );

  // Mover es un gesto manual: la entrada pasa a protegerse de la regeneración (N2).
  const { error } = await supabase
    .from("menu_entries")
    .update({ menu_id: menuId, date, meal_slot: slot, position, source: "manual" })
    .eq("household_id", household.id)
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
    .select("menu_id, recipe_id, free_text, menu:weekly_menus(week_start)")
    .eq("household_id", household.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  /*
    El destino tiene que caer en la semana del menú de origen, porque la copia se
    inserta con el `menu_id` del original. Una fecha de otra semana creaba una
    fila con la fecha fuera de la semana de su menú: invisible en la UI —que pinta
    semana por semana— y a la vez VIVA para el repaso, que busca por rango de
    fechas y no por `menu_id` (a propósito: el domingo pendiente pertenece al menú
    de la semana anterior). O sea un plato que la app te pregunta y no te deja
    ver, ni marcar, ni quitar.

    Es el mismo desfase que `moveMenuEntryAction` documenta y esquiva cambiando de
    `menu_id`. Aquí no hace falta resolverlo: duplicar solo se ofrece dentro de la
    semana visible, así que la regla es negar lo de fuera.
  */
  const originWeek = (entry as { menu: { week_start: string } | null }).menu
    ?.week_start;
  if (!originWeek || !getWeekDays(originWeek).includes(date)) {
    return { error: "Solo se puede duplicar dentro de la misma semana." };
  }

  const position = await nextPosition(
    supabase,
    household.id,
    entry.menu_id,
    date,
    slot,
  );

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

  /*
    Mismo veto que en `generateMenuAction`, y por el mismo motivo: sembrar platos
    en días que ya han ocurrido crea entradas sin `cooked_at` que el repaso (R2)
    pregunta una a una («¿cocinaste esto el lunes?») sin que nadie las haya
    planificado nunca. Allí el veto se escribió para el borrado; aquí faltaba, así
    que copiar era la puerta de atrás al mismo destrozo — y encima la abría un
    botón que solo aparece en semanas VACÍAS, que es justo lo que es una semana
    pasada que nunca se planificó.
  */
  if (getWeekDays(weekStart).every((date) => date < todayLocalISO())) {
    return { error: "Esa semana ya ha pasado: no se puede planificar." };
  }

  const supabase = createServerSupabaseClient();

  const prevWeekStart = shiftWeek(weekStart, -1);
  const prevMenu = await supabase
    .from("weekly_menus")
    .select("id")
    .eq("household_id", household.id)
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
    .eq("household_id", household.id)
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
    .eq("household_id", household.id)
    .eq("id", entryId);
  if (error) return { error: "No se pudo actualizar el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Pide UN plato a la IA para un hueco concreto y lo materializa, devolviendo el
 * `recipe_id` con el que enlazar la entrada: la receta del recetario que el
 * modelo haya elegido o una receta efímera nueva (`is_saved = false`) creada a
 * partir de su payload.
 *
 * Lo comparten los dos gestos de "un solo plato" —1 llamada pequeña a Gemini,
 * aceptable en free tier—: «Otra idea» (N2), que sustituye una entrada, y
 * generar un hueco vacío desde el «+», que inserta una nueva. Lo único que
 * cambia es si hay un plato del que diferenciarse (`currentEntryId`), que además
 * se excluye del "no repitas el resto de la semana".
 *
 * No comprueba el consentimiento de IA ni el rate-limit: eso es de las Server
 * Actions que lo llaman, que son la frontera con el usuario.
 */
async function generateDishForSlot({
  supabase,
  householdId,
  userId,
  menuId,
  weekStart,
  slot,
  currentEntryId,
  what,
}: {
  supabase: SupabaseClient<Database>;
  householdId: string;
  userId: string | null;
  menuId: string;
  /** Lunes de la semana del hueco: acota qué platos cuentan como recientes. */
  weekStart: string;
  slot: string;
  /** Entrada que se va a sustituir, o null si el hueco está vacío. */
  currentEntryId: string | null;
  /** Qué se genera, para el mensaje de error ("otra idea", "el plato"). */
  what: string;
}): Promise<{ recipeId?: string; error?: string }> {
  const [context, menuEntries] = await Promise.all([
    loadHouseholdMenuContext(householdId, weekStart),
    getMenuEntries(menuId),
  ]);
  const { prefs, savedRecipes } = context;

  // El plato actual (a cambiar; null si el hueco está vacío) y el resto de la
  // semana, para no repetir. Sin `currentEntryId` no se excluye ninguno.
  const current = currentEntryId
    ? menuEntries.find((e) => e.id === currentEntryId)
    : null;
  const currentDish = current
    ? (current.recipeName ?? current.freeText ?? "este plato")
    : null;
  const otherDishes = menuEntries
    .filter((e) => e.id !== currentEntryId)
    .map((e) => e.recipeName ?? e.freeText ?? "")
    .filter((n) => n !== "");

  let dish;
  try {
    const { object } = await generateObject({
      model: getModel("menus"),
      schema: singleDishSchema,
      abortSignal: AbortSignal.timeout(60_000),
      prompt: buildRerollPrompt({
        today: todayLocalISO(),
        season: context.season,
        slot,
        currentDish,
        inventory: context.inventory,
        recipes: context.recipes,
        rules: context.rules,
        shoppingList: context.shoppingList,
        recentDishes: context.recentDishes,
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
    console.error("Error al generar el plato:", err);
    const kind = classifyAiError(err);
    return {
      error:
        kind === "rate_limit"
          ? "El servicio de IA está saturado ahora mismo. Espera un minuto y vuelve a intentarlo."
          : kind === "timeout"
            ? "La generación tardó demasiado. Vuelve a intentarlo."
            : `No se pudo generar ${what}. Inténtalo de nuevo.`,
    };
  }

  const savedId = makeSavedRecipeResolver(savedRecipes).resolve(
    dish.saved_recipe_id,
    dish.recipe_name,
  );

  // Determina el recipe_id destino: receta guardada o receta efímera nueva.
  if (savedId) return { recipeId: savedId };

  const { data: recipe } = await supabase
    .from("recipes")
    .insert({
      household_id: householdId,
      name: dish.recipe_name,
      normalized_name: normalizeName(dish.recipe_name),
      description: dish.description ?? null,
      servings: prefs.servings,
      meal_types: [slot],
      source: "ai",
      created_by: userId,
    })
    .select("id")
    .single();
  if (!recipe) return { error: "No se pudo crear el plato." };

  if (dish.ingredients.length > 0) {
    await supabase.from("recipe_ingredients").insert(
      dish.ingredients.map((ing) => ({
        recipe_id: recipe.id,
        household_id: householdId,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
      })),
    );
  }

  return { recipeId: recipe.id };
}

/**
 * "Otra idea" por hueco (N2): pide UN plato alternativo a la IA para una entrada
 * concreta y la reemplaza en su misma posición (source = 'ai'), sin tocar el
 * resto de la semana. Tras reemplazar, limpia la receta efímera que pudiera
 * quedar huérfana.
 */
export async function rerollMenuEntryAction(
  entryId: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  // El reroll también pasa el contexto del hogar a la IA de Google: mismo gate.
  const consent = await getAiConsent();
  if (!consent.consented) {
    return { error: AI_CONSENT_REQUIRED_ERROR, needsAiConsent: true };
  }

  const supabase = createServerSupabaseClient();

  // El `week_start` del menú viaja con la entrada: es lo que fija qué platos
  // cuentan como "de las semanas anteriores" al pedir la alternativa.
  const { data: entry } = await supabase
    .from("menu_entries")
    .select(
      "menu_id, meal_slot, cooked_at, skipped_at, menu:weekly_menus(week_start)",
    )
    .eq("household_id", household.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  /*
    Un plato ya RESUELTO —cocinado o «no se hizo»— no se cambia por otra idea:
    deja de ser un plan y pasa a ser lo que ocurrió. Cambiarlo borraba justo la
    prueba de que ocurrió, que es lo mismo que protege el veto de días pasados de
    `generateMenuAction`: el `update` de abajo pone `cooked_at` a null, así que la
    entrada volvía al repaso («¿cocinaste esto?») y `timesCooked`/`lastCookedAt`
    (`getRecipeSignals`) perdían esa vez —el generador volvía a creer que nunca
    habías cocinado esa receta y te la proponía otra vez—. Y el descuento de
    inventario que disparó el «lo cocinamos» NO se revierte, así que la despensa
    se quedaba pagando un plato que ya no está en el menú.

    Con `skipped_at` el destrozo era distinto y más callado: el `update` no lo
    limpia, así que el plato NUEVO nacía marcado como «no se hizo» y ni aparecía
    en el repaso ni contaba como cocinado.

    Va ANTES del rate limit a propósito: negar esto no debe gastar cuota de IA.
  */
  if (entry.cooked_at || entry.skipped_at) {
    return {
      error: "Ese plato ya está resuelto: para cambiarlo, deshaz la marca.",
    };
  }

  const rateError = await enforceAiRateLimit(supabase, "menu");
  if (rateError) return { error: rateError };

  const dish = await generateDishForSlot({
    supabase,
    householdId: household.id,
    userId,
    menuId: entry.menu_id,
    weekStart:
      (entry as { menu: { week_start: string } | null }).menu?.week_start ??
      getWeekStart(),
    slot: entry.meal_slot,
    currentEntryId: entryId,
    what: "otra idea",
  });
  if (!dish.recipeId) {
    return { error: dish.error ?? "No se pudo cambiar el plato." };
  }

  // Reemplaza la entrada en su sitio: nueva receta, sin texto libre, source 'ai'
  // y sin cocinar. Con el veto de arriba `cooked_at` ya llega a null; se deja
  // escrito para que relajar el veto no reviva el desfase en silencio.
  const { error } = await supabase
    .from("menu_entries")
    .update({
      recipe_id: dish.recipeId,
      free_text: null,
      source: "ai",
      cooked_at: null,
    })
    .eq("household_id", household.id)
    .eq("id", entryId);
  if (error) return { error: "No se pudo cambiar el plato." };

  // La receta efímera anterior puede haber quedado huérfana.
  await cleanupOrphanEphemeralRecipes(supabase, household.id);

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Genera con IA UN plato para un hueco concreto y lo AÑADE (el «+» de la semana).
 * Mismo plato-a-plato que «Otra idea», pero sin nada que sustituir: es la vía
 * para rellenar un hueco suelto sin rehacer la semana entera.
 *
 * Nace como `source = 'ai'`, igual que un reroll: «Completar menú con IA» puede
 * reemplazarlo, y fijarlo lo protege.
 */
export async function generateSlotEntryAction(
  weekStart: string,
  date: string,
  slot: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const parsed = slotTargetSchema.safeParse({ weekStart, date, slot });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  ({ weekStart, date, slot } = parsed.data);

  const consent = await getAiConsent();
  if (!consent.consented) {
    return { error: AI_CONSENT_REQUIRED_ERROR, needsAiConsent: true };
  }

  const supabase = createServerSupabaseClient();

  const rateError = await enforceAiRateLimit(supabase, "menu");
  if (rateError) return { error: rateError };

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  const dish = await generateDishForSlot({
    supabase,
    householdId: household.id,
    userId,
    menuId,
    weekStart,
    slot,
    currentEntryId: null,
    what: "el plato",
  });
  if (!dish.recipeId) {
    return { error: dish.error ?? "No se pudo añadir el plato." };
  }

  const position = await nextPosition(
    supabase,
    household.id,
    menuId,
    date,
    slot,
  );

  const { error } = await supabase.from("menu_entries").insert({
    menu_id: menuId,
    household_id: household.id,
    date,
    meal_slot: slot,
    recipe_id: dish.recipeId,
    position,
    source: "ai",
  });
  if (error) return { error: "No se pudo añadir el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Añade una receta del recetario a un hueco concreto (el «+» de la semana). Es la
 * alternativa buena al texto libre: la entrada queda ENLAZADA a la receta
 * (`recipe_id`), así que suma al coste de la semana (M7), entra en "Añadir a la
 * lista lo que falte" (D3) y puede descontar del inventario al marcarla cocinada
 * (M2). `addRecipeToMenuAction` hace lo mismo, pero solo para HOY (M6).
 *
 * `source` se queda en su default 'manual': elegir tú la receta es un gesto
 * manual y «Completar menú con IA» debe respetarlo.
 */
export async function addRecipeToSlotAction(
  weekStart: string,
  date: string,
  slot: string,
  recipeId: string,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const parsed = addRecipeToSlotSchema.safeParse({
    weekStart,
    date,
    slot,
    recipeId,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  ({ weekStart, date, slot, recipeId } = parsed.data);
  const supabase = createServerSupabaseClient();

  // La receta debe ser del hogar activo y estar en el recetario: el buscador solo
  // ofrece guardadas, pero el id viene del cliente.
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id")
    .eq("household_id", household.id)
    .eq("id", recipeId)
    .eq("is_saved", true)
    .maybeSingle();
  if (!recipe) return { error: "Elige una receta de tu recetario." };

  const menuId = await ensureMenu(supabase, household.id, weekStart);
  if (!menuId) return { error: "No se pudo crear el menú." };

  const position = await nextPosition(
    supabase,
    household.id,
    menuId,
    date,
    slot,
  );

  const { error } = await supabase.from("menu_entries").insert({
    menu_id: menuId,
    household_id: household.id,
    date,
    meal_slot: slot,
    recipe_id: recipeId,
    position,
  });
  if (error) return { error: "No se pudo añadir el plato." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Marca o desmarca "Lo cocinamos" en una entrada del menú. Al marcar, fija
 * cooked_at con la propia fecha de la entrada (señal de apetencia para C3);
 * al desmarcar, la deja en null. Solo tiene sentido en entradas de hoy o
 * pasadas: la UI oculta el botón en fechas futuras, pero aquí se valida igual.
 *
 * Marcar cocinado limpia `skipped_at`: las dos marcas son excluyentes (R2), así
 * que contestar "sí, lo hicimos" borra un "no se hizo" anterior. Y con la marca
 * se va su MOTIVO, porque un motivo sin descarte no significa nada: la base lo
 * exige con un check, así que olvidarlo aquí no dejaría un dato raro, haría
 * fallar el "sí, lo cocinamos".
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
      .eq("household_id", household.id)
      .eq("id", entryId);
    if (error) return { error: "No se pudo actualizar la entrada." };
    revalidatePath("/menus");
    return { ok: true };
  }

  // Recupera la fecha real de la entrada, acotada al hogar activo.
  const { data: entry } = await supabase
    .from("menu_entries")
    .select("date")
    .eq("household_id", household.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  if (entry.date > todayLocalISO()) {
    return { error: "Solo puedes marcar como cocinado un día que ya ha pasado." };
  }

  const { error } = await supabase
    .from("menu_entries")
    .update({ cooked_at: entry.date, skipped_at: null, skipped_reason: null })
    .eq("household_id", household.id)
    .eq("id", entryId);
  if (error) return { error: "No se pudo actualizar la entrada." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Marca o desmarca "no se hizo" (R2): espejo de `toggleEntryCookedAction`.
 * `skipped_at` guarda la fecha de la ENTRADA (mismo criterio que `cooked_at`) y
 * al marcarlo se limpia `cooked_at`, porque las dos marcas son excluyentes.
 *
 * Sirve para no volver a preguntar por un plato que no se cocinó. El MOTIVO se
 * pregunta después, en un segundo gesto opcional (`setEntrySkippedReasonAction`),
 * y es lo único que hace algo con esta señal: sin motivo, el descarte solo evita
 * la pregunta.
 *
 * Al desmarcar se limpia el motivo con la marca: un motivo sin descarte lo
 * rechaza la base (y no significaría nada).
 */
export async function toggleEntrySkippedAction(
  entryId: string,
  skipped: boolean,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  if (!skipped) {
    const { error } = await supabase
      .from("menu_entries")
      .update({ skipped_at: null, skipped_reason: null })
      .eq("household_id", household.id)
      .eq("id", entryId);
    if (error) return { error: "No se pudo actualizar la entrada." };
    revalidatePath("/menus");
    return { ok: true };
  }

  const { data: entry } = await supabase
    .from("menu_entries")
    .select("date")
    .eq("household_id", household.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return { error: "No se encontró la entrada del menú." };

  if (entry.date > todayLocalISO()) {
    return { error: "Ese día todavía no ha pasado." };
  }

  const { error } = await supabase
    .from("menu_entries")
    .update({ skipped_at: entry.date, cooked_at: null })
    .eq("household_id", household.id)
    .eq("id", entryId);
  if (error) return { error: "No se pudo actualizar la entrada." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Guarda (o quita) el motivo de un plato ya descartado: los cuatro chips que
 * aparecen justo después de decir «no se hizo». `null` lo borra, así que el chip
 * ya elegido funciona como interruptor y se puede corregir.
 *
 * La entrada tiene que estar DESCARTADA, y el filtro lo dice: sin él, poner un
 * motivo a un plato sin marca lo rechazaría el check de la base con un error
 * genérico, y con él —pero sin contar filas— la app diría «guardado» sobre una
 * escritura que no tocó nada, porque un `update` que no encuentra fila no es un
 * error para Supabase. De ahí el `.select("id")`: es la única forma de saber si
 * hubo fila.
 */
export async function setEntrySkippedReasonAction(
  entryId: string,
  reason: string | null,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  if (reason !== null && !isSkipReason(reason)) {
    return { error: "Ese motivo no existe." };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_entries")
    .update({ skipped_reason: reason })
    .eq("household_id", household.id)
    .eq("id", entryId)
    .not("skipped_at", "is", null)
    .select("id");
  if (error) return { error: "No se pudo guardar el motivo." };
  if (!data || data.length === 0) {
    return { error: "Ese plato ya no está marcado como «no se hizo»." };
  }

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
    .eq("household_id", household.id)
    .eq("recipe_id", recipeId);
  if (!ingredients || ingredients.length === 0) return { deductions: [] };

  const [inventory, catalog] = await Promise.all([
    getInventory(),
    getProductCatalog(),
  ]);

  // Stock (cantidad > 0) por producto y unidad, y el contenido declarado de cada
  // producto: con él, una receta en gramos puede salir de un bote contado en ud.
  const stockByProductUnit = new Map<string, Map<UnitType, number>>();
  const contentByProduct = new Map<string, UnitContent>();
  for (const i of inventory) {
    if (!contentByProduct.has(i.productId)) {
      contentByProduct.set(
        i.productId,
        i.contentSize === null || i.contentUnit === null
          ? null
          : {
              size: i.contentSize,
              unit: i.contentUnit,
              estimate: i.contentIsEstimate,
            },
      );
    }
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
    contentByProduct,
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
 * a 0 se conserva como agotado, igual que `setInventoryQuantityAction`).
 *
 * Las cantidades llegan en la unidad de la RECETA y se restan en la del
 * INVENTARIO: de qué unidad y con qué factor lo decide `resolveStockTarget`, el
 * mismo que calculó la propuesta que vio el usuario. Resolverlo aquí por separado
 * restaría de una fila distinta de la prometida, así que la regla vive en un solo
 * sitio (`cooked.ts`) y esta acción la consume.
 *
 * Cada producto descontado deja su movimiento en el historial (F5). Sin esto,
 * cocinar era la ÚNICA forma de gastar stock que no dejaba rastro: la nevera se
 * vaciaba y los movimientos del inventario no se enteraban, así que la lista no
 * cuadraba con las existencias y lo primero que se piensa es que la app falla.
 *
 * Devuelve además lo que se ha quedado a cero o bajo mínimo (`restock`), para
 * ofrecer apuntarlo en el mismo gesto. Cocinar es justo el momento en que nace la
 * necesidad de comprar: hasta ahora el aviso existía —las sugerencias de /lista
 * cubren "agotado" y "bajo mínimo"— pero solo aparecía cuando alguien abría esa
 * pantalla, que puede ser tres días después y ya en la puerta del supermercado.
 */
export async function confirmCookedDeductionsAction(
  deductions: CookedDeductionInput[],
): Promise<{
  error?: string;
  ok?: boolean;
  deducted?: number;
  restock?: RestockCandidate[];
}> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  // Venía del cliente sin esquema: tipos a mano y sin tope de tamaño.
  const parsed = cookedDeductionsSchema.safeParse(deductions);
  if (!parsed.success) return { error: "Los descuentos no son válidos." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  // El contenido declarado de los productos implicados, en UNA consulta: es el
  // factor con el que 160 g de receta salen de un bote que se cuenta en ud.
  // Acotado al hogar activo porque los ids los manda el cliente.
  const productIds = [...new Set(parsed.data.map((d) => d.productId))];
  const { data: products } = await supabase
    .from("products")
    .select("id, content_size, content_unit, content_is_estimate")
    .eq("household_id", household.id)
    .in("id", productIds);
  const contentById = new Map<string, UnitContent>();
  for (const p of products ?? []) {
    contentById.set(
      p.id,
      p.content_size === null || p.content_unit === null
        ? null
        : {
            size: Number(p.content_size),
            unit: p.content_unit,
            estimate: p.content_is_estimate,
          },
    );
  }

  let deducted = 0;
  // Productos de los que se ha gastado algo DE VERDAD: los únicos que pueden
  // haberse quedado a cero por este consumo.
  const touchedProductIds: string[] = [];
  for (const d of parsed.data) {
    // Un id que no sea del hogar activo no aparece aquí: se ignora en silencio y
    // el resto entra, igual que hace el alta múltiple de la lista.
    if (!contentById.has(d.productId)) continue;
    const content = contentById.get(d.productId) ?? null;

    // Lotes del producto en TODAS las unidades, del que antes caduca al que
    // después (nulls al final). Cada "lote" es una fila (ubicación) del mismo
    // producto. La unidad de la que se resta NO la decide la receta.
    const { data: lots } = await supabase
      .from("inventory_items")
      .select("id, quantity, unit, expiry_date")
      .eq("household_id", household.id)
      .eq("product_id", d.productId)
      .gt("quantity", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false });

    const stockByUnit = new Map<UnitType, number>();
    for (const lot of lots ?? []) {
      stockByUnit.set(
        lot.unit,
        (stockByUnit.get(lot.unit) ?? 0) + Number(lot.quantity),
      );
    }

    const target = resolveStockTarget(d.unit, stockByUnit, content);
    if (!target) continue;
    const wanted = convertQuantity(
      d.quantity,
      d.unit,
      target.stockUnit,
      content,
    );
    if (wanted === null || wanted <= 0) continue;

    let remaining = wanted;
    // Lo que de VERDAD ha salido de las filas, sumando fila a fila. No se deduce
    // de `remaining`: la cantidad guardada se redondea a 2 decimales, así que
    // pedir 1 g de un lote en kg (0,001) no mueve la fila, y anotar ese consumo
    // sería apuntar un gasto que el inventario no refleja.
    let takenReal = 0;
    for (const lot of lots ?? []) {
      if (remaining <= 0) break;
      if (lot.unit !== target.stockUnit) continue;
      const current = Number(lot.quantity);
      const take = Math.min(current, remaining);
      const newQty = roundQuantity(Math.max(0, current - take));
      // Cambio invisible tras redondear: no se escribe (bumpear `updated_by`
      // diría que alguien tocó la fila) y se prueba con el lote siguiente.
      if (newQty === current) continue;
      const { error } = await supabase
        .from("inventory_items")
        .update({ quantity: newQty, updated_by: userId })
        .eq("household_id", household.id)
        .eq("id", lot.id);
      if (error) return { error: "No se pudo actualizar el inventario." };
      takenReal += current - newQty;
      remaining -= take;
    }

    const taken = roundQuantity(takenReal);
    if (taken <= 0) continue;
    deducted += 1;
    touchedProductIds.push(d.productId);
    // `fold` agrupa con un movimiento reciente del mismo producto y autor, igual
    // que el stepper: cocinar dos recetas que comparten tomate deja una línea de
    // «4 ud», no dos de dos. La unidad del movimiento es la del INVENTARIO (de
    // donde ha salido), no la de la receta: el historial cuenta lo que se movió
    // en la despensa.
    await recordStockEvent(supabase, {
      householdId: household.id,
      productId: d.productId,
      quantity: taken,
      unit: target.stockUnit,
      kind: "consumed",
      userId,
      fold: true,
    });
  }

  // El stock ha cambiado, así que las sugerencias de /lista también: sin
  // revalidarla, el usuario que acepte apuntar lo agotado vería la lista vieja.
  revalidatePath("/inventario");
  revalidatePath("/menus");
  revalidatePath("/lista");

  const restock = await getRestockCandidates(touchedProductIds);
  return { ok: true, deducted, restock };
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
  // Hora ESPAÑOLA, no la del proceso: en Vercel (UTC) el corte de las 16:00
  // eran las 18:00 en España y «¿qué hago hoy?» metía la cena en la comida.
  const slot = hourInSpain() < 16 ? "lunch" : "dinner";

  const position = await nextPosition(
    supabase,
    household.id,
    menuId,
    date,
    slot,
  );

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
    .eq("household_id", household.id)
    .eq("menu_id", menuId)
    .not("recipe_id", "is", null);
  const recipeIds = [...new Set((entries ?? []).map((e) => e.recipe_id))].filter(
    (id): id is string => Boolean(id),
  );
  if (recipeIds.length === 0) {
    return { error: "El menú no tiene recetas con ingredientes." };
  }

  const candidates = await computeMissingForRecipes(
    household.id,
    list.id,
    recipeIds,
  );
  return { candidates };
}

/**
 * Lo mismo para UNA receta: lo que usa el repaso de ingredientes con el que
 * arranca el modo cocinado. Comparte el cálculo con la versión del menú
 * (`computeMissingForRecipes`) a propósito — son la misma pregunta hecha sobre
 * un plato en vez de sobre catorce, y si contestaran distinto el modo cocinado
 * diría «te falta comino» sobre algo que la lista se niega a apuntar.
 */
export async function computeMissingForRecipeAction(
  recipeId: string,
): Promise<MissingState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  const candidates = await computeMissingForRecipes(household.id, list.id, [
    recipeId,
  ]);
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
  const computed = await computeMissingForMenuAction(menuId);
  if (computed.error) return { error: computed.error };
  return insertMissingToList(computed.candidates ?? [], includedKeys);
}

/**
 * Y la versión de una receta, para el repaso de ingredientes del modo cocinado.
 * Recalcula en el servidor igual que su hermana y usa `includedKeys` SOLO para
 * filtrar: los datos de producto que mande el cliente no se miran nunca.
 */
export async function confirmMissingForRecipeAction(
  recipeId: string,
  includedKeys: string[],
): Promise<MenuState> {
  const computed = await computeMissingForRecipeAction(recipeId);
  if (computed.error) return { error: computed.error };
  return insertMissingToList(computed.candidates ?? [], includedKeys);
}

/**
 * Inserta en la lista activa los faltantes que el usuario dejó marcados. Los que
 * casaron con el catálogo entran vinculados (`product_id`), para que «Finalizar
 * compra» los mande a su ubicación por defecto; los sin match, como texto libre.
 *
 * Recibe los candidatos YA recalculados en servidor: quien la llama es el único
 * que sabe de qué se estaba hablando (un menú o una receta), y así la regla de
 * no fiarse de lo que manda el cliente se cumple una sola vez y en los dos
 * caminos.
 */
async function insertMissingToList(
  candidates: MissingCandidate[],
  includedKeys: string[],
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  const included = new Set(includedKeys);
  const toInsert = candidates.filter((c) => included.has(c.key));
  if (toInsert.length === 0) return { ok: true, added: 0 };

  const { data: last } = await supabase
    .from("shopping_list_items")
    .select("position")
    .eq("household_id", household.id)
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
  } else if (d.kind === "skip_slot") {
    const { error } = await supabase.from("menu_rules").insert({
      household_id: household.id,
      kind: d.kind,
      weekday: d.weekday,
      meal_slot: d.mealSlot,
    });
    // El índice único (hogar + día + hueco) hace idempotente decir dos veces lo
    // mismo: no es un fallo que enseñarle a nadie, ya está dicho.
    if (error && error.code !== "23505") {
      return { error: "No se pudo crear la regla." };
    }
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
    .eq("household_id", household.id)
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

  const { error } = await supabase
    .from("menu_rules")
    .delete()
    .eq("household_id", household.id)
    .eq("id", ruleId);
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
      // Sin valor explícito se conserva el default de la columna (true) en un
      // insert; en un update no se toca porque supabase-js omite el undefined.
      checkin_enabled: d.checkinEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "household_id" },
  );
  if (error) return { error: "No se pudieron guardar las preferencias." };

  revalidatePath("/menus");
  return { ok: true };
}

/**
 * Apaga (o vuelve a encender) el repaso de platos pasados del hogar (R3). Action
 * ligera y dedicada porque se llama desde el propio modal de repaso —"No volver a
 * preguntar"—, donde no hay formulario de preferencias que enviar: `upsert` con
 * los defaults de la tabla si el hogar aún no tiene fila.
 *
 * La tarjeta del repaso vive en el shell (todas las páginas), pero el layout de
 * la app es `force-dynamic`: cada navegación la reevalúa, así que basta con
 * revalidar /menus (por el interruptor de Ajustes) y con el `router.refresh()`
 * que hace quien llama para la página en curso.
 */
export async function setCheckinEnabledAction(
  enabled: boolean,
): Promise<MenuState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("household_menu_prefs").upsert(
    {
      household_id: household.id,
      checkin_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "household_id" },
  );
  if (error) return { error: "No se pudo guardar la preferencia." };

  revalidatePath("/menus");
  return { ok: true };
}
