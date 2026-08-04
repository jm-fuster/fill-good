/**
 * Compara modelos de IA generando el menú semanal. Lo ejecuta
 * `npm run compare:menu` (ver `scripts/compare-menu-models.mjs`, que lo empaqueta
 * con esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * A diferencia de los `check:*`, esto NO es una comprobación: no afirma nada, hace
 * llamadas de verdad a la API y mide. Existe porque subir de modelo es un commit
 * de una línea (`DEFAULT_MODELS` en `src/lib/ai/models.ts`) y la única forma de
 * saber si conviene es generar semanas y contarlas.
 *
 * Lo que hace comparable la medida:
 *   · Un ÚNICO prompt, el de `buildMenuPrompt` con el hogar de
 *     `menu-models.fixture.ts`, que reciben todos los modelos carácter a carácter.
 *   · El schema de producción (`menuSchema`) y la vía de producción para elegir
 *     modelo: se escribe `AI_MODEL_MENUS` y se llama a `getModel("menus")`, así
 *     que se prueba el mismo camino que usa la app, no uno paralelo.
 *   · Puntuación determinista y con el código del repo: `validateAndPatchRules`
 *     para las reglas, `summarizeAvailability` para lo que habría que comprar,
 *     `computeRecipeCost` + `assessWeekBudget` para el dinero. Ninguna métrica la
 *     juzga un modelo.
 *   · Llamadas ALTERNADAS entre modelos, para que un mal momento de la API no
 *     caiga entero sobre uno.
 *
 * La métrica que más dice no es ninguna de las bonitas: es cuánto tuvo que
 * PARCHEAR el validador de reglas. Todo lo que arregla `rules.ts` es trabajo que
 * el modelo no hizo, y se arregla en silencio.
 *
 * Env vars: COMPARE_MODELS (lista separada por comas), RUNS, TIMEOUT_MS,
 * COMPARE_TODAY, SKIP_RULE, DRY. Las que fijan el hogar viven en el fixture.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { generateObject } from "ai";
import type { z } from "zod";

import {
  MAX_DISHES_PER_SLOT,
  PLACEHOLDER_DISH_TEXT,
  validateAndPatchRules,
  type MenuDay,
  type MenuDish,
  type MenuMeal,
  type MenuStructure,
  type ValidatableRule,
} from "@/features/menus/rules";
import { summarizeAvailability } from "@/features/menus/prompt-context";
import { assessWeekBudget, servingsFactor } from "@/features/menus/week-budget";
import { buildMenuPrompt } from "@/lib/ai/menu-prompt";
import { menuSchema } from "@/lib/ai/menu-schema";
import { getModel } from "@/lib/ai/models";
import { normalizeName } from "@/lib/normalize";

import {
  buildFixture,
  MONTHLY_BUDGET,
  PREFS,
  RECENT_DISHES,
  REPO_ROOT,
  requireEnv,
  RULES,
  SKIP_ENABLED,
  TODAY,
  URGENT_PRODUCTS,
  type Fixture,
} from "./menu-models.fixture";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/** Dónde se dejan informe, prompt y respuestas crudas. Lo fija el envoltorio. */
const OUT_DIR = requireEnv("COMPARE_OUT");

/** Modelos a comparar. Por defecto, el de producción contra la generación siguiente. */
const MODELS = (
  process.env.COMPARE_MODELS ?? "gemini-3.5-flash,gemini-3.6-flash"
)
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m.length > 0);

const RUNS = Number(process.env.RUNS ?? 3);
/** Respiro entre llamadas: el free tier limita PETICIONES por minuto. */
const PAUSE_MS = 4_000;
/**
 * Producción aborta a los 60 s (`AbortSignal.timeout(60_000)` en la Server
 * Action). Aquí se deja más margen para poder MEDIR la latencia real y avisar
 * aparte de cada generación que se habría pasado del tope: un menú que tarda 70 s
 * es un menú que el usuario no recibe.
 */
const PROD_TIMEOUT_MS = 60_000;
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 150_000);

const SLOTS = ["lunch", "dinner"] as const;
const DAY_NAMES = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

type MenuOut = z.infer<typeof menuSchema>;

/** La clave vive en `.env.local`; el provider de Google la lee del entorno. */
function loadApiKey(): void {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return;
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) {
    throw new Error(`No encuentro ${envPath} (hace falta la key del free tier)`);
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^GOOGLE_GENERATIVE_AI_API_KEY=(.*)$/.exec(line.trim());
    if (m) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = m[1]
        .trim()
        .replace(/^"|"$/g, "");
      return;
    }
  }
  throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no está en .env.local");
}

// ---------------------------------------------------------------------------
// Resolución de recetas
//
// Copia de `makeSavedRecipeResolver` (features/menus/actions.ts): es local a un
// fichero "use server", así que no se puede importar. Importa que sea la misma
// función porque el rescate por NOMBRE es lo que salva un id mal copiado, y sin
// ella un modelo que inventa ids parecería peor de lo que es en la app.
// ---------------------------------------------------------------------------

function makeSavedRecipeResolver(saved: readonly { id: string; name: string }[]) {
  const byId = new Map(saved.map((r) => [r.id, r]));
  const byNormalizedName = new Map<string, string>();
  for (const r of saved) {
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

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

type Metrics = {
  ms: number;
  overProdTimeout: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  daysReturned: number;
  dayIndexProblems: string[];
  slotsExpected: number;
  slotsFilled: number;
  dishes: number;
  dishesInClosedSlot: number;
  overMaxDishes: number;
  savedDishes: number;
  inventedDishes: number;
  hallucinatedIds: string[];
  mealTypeViolations: string[];
  breakfastRecipesUsed: string[];
  repeatedDishes: string[];
  recentClashes: string[];
  newPurchases: string[];
  urgentUsed: string[];
  weekCost: number | null;
  weekCostComplete: boolean;
  overBudgetBy: number | null;
  minBefore: number;
  maxBefore: number;
  patchAdded: string[];
  patchRemoved: string[];
  patchPlaceholders: number;
};

const isSkipped = (dayIndex: number, slot: string) =>
  SKIP_ENABLED && dayIndex === RULES.skip.weekday && slot === RULES.skip.slot;

/** Estructura del menú tal como la construye `generateMenuAction` antes de validar. */
function toStructure(
  generated: MenuOut,
  resolver: ReturnType<typeof makeSavedRecipeResolver>,
): { struct: MenuStructure; dishesInClosedSlot: number; overMax: number } {
  const byIndex = new Map(generated.days.map((d) => [d.day_index, d]));
  let dishesInClosedSlot = 0;
  let overMax = 0;
  const days: MenuDay[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const genDay = byIndex.get(dayIndex);
    const meals: MenuMeal[] = SLOTS.map((slot) => {
      const proposed = genDay?.meals.find((m) => m.slot === slot)?.dishes ?? [];
      if (isSkipped(dayIndex, slot)) {
        // Lo que el modelo proponga para un hueco cerrado se tira: es esfuerzo
        // gastado en un plato que nadie va a comer.
        dishesInClosedSlot += proposed.length;
        return { slot, dishes: [], locked: true };
      }
      if (proposed.length > MAX_DISHES_PER_SLOT) overMax += 1;
      const dishes: MenuDish[] = proposed
        .slice(0, MAX_DISHES_PER_SLOT)
        .map((d) => ({
          savedRecipeId: resolver.resolve(d.saved_recipe_id, d.recipe_name),
          name: d.recipe_name,
        }));
      return { slot, dishes };
    });
    days.push({ dayIndex, meals });
  }
  return { struct: { days }, dishesInClosedSlot, overMax };
}

function dishKeys(struct: MenuStructure): string[] {
  const out: string[] = [];
  for (const day of struct.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        out.push(`${DAY_NAMES[day.dayIndex]} ${meal.slot}: ${dish.name}`);
      }
    }
  }
  return out;
}

function countRecipe(struct: MenuStructure, recipeId: string): number {
  let n = 0;
  for (const day of struct.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        if (dish.savedRecipeId === recipeId) n += 1;
      }
    }
  }
  return n;
}

function readUsage(usage: unknown): { input: number | null; output: number | null } {
  if (typeof usage !== "object" || usage === null) return { input: null, output: null };
  const u = usage as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    input: num(u.inputTokens) ?? num(u.promptTokens),
    output: num(u.outputTokens) ?? num(u.completionTokens),
  };
}

function score(
  generated: MenuOut,
  fx: Fixture,
  ms: number,
  usage: unknown,
): Metrics {
  const resolver = makeSavedRecipeResolver(fx.seasonal);
  const seasonalById = new Map(fx.seasonal.map((r) => [r.id, r]));
  const { struct, dishesInClosedSlot, overMax } = toStructure(generated, resolver);

  // --- estructura: siete días, una vez cada uno ---
  const indices = generated.days.map((d) => d.day_index);
  const dayIndexProblems: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const n = indices.filter((x) => x === i).length;
    if (n === 0) dayIndexProblems.push(`falta el día ${i}`);
    if (n > 1) dayIndexProblems.push(`día ${i} repetido ×${n}`);
  }
  for (const i of indices) {
    if (i < 0 || i > 6) dayIndexProblems.push(`day_index fuera de rango: ${i}`);
  }

  let slotsFilled = 0;
  for (const day of struct.days) {
    for (const meal of day.meals) {
      if (!meal.locked && meal.dishes.length > 0) slotsFilled += 1;
    }
  }

  // --- recetario, tipo de comida, variedad, aprovechamiento ---
  let savedDishes = 0;
  let inventedDishes = 0;
  const hallucinatedIds: string[] = [];
  const mealTypeViolations: string[] = [];
  const breakfastRecipesUsed: string[] = [];
  const nameCounts = new Map<string, { name: string; n: number }>();
  const recentNorm = new Set(
    RECENT_DISHES.map((d) => normalizeName(d.name)).filter((n) => n.length > 0),
  );
  const recentClashes: string[] = [];
  const usedIngredients = new Set<string>();
  const missingUnion = new Map<string, string>();
  const rawByIndex = new Map(generated.days.map((d) => [d.day_index, d]));

  for (const day of struct.days) {
    for (const meal of day.meals) {
      if (meal.locked) continue;
      const rawDishes =
        rawByIndex.get(day.dayIndex)?.meals.find((m) => m.slot === meal.slot)
          ?.dishes ?? [];
      const where = `${DAY_NAMES[day.dayIndex]} ${meal.slot}`;

      for (const [i, dish] of meal.dishes.entries()) {
        const raw = rawDishes[i];
        const recipe = dish.savedRecipeId
          ? seasonalById.get(dish.savedRecipeId)
          : undefined;

        // Id que no existe en el recetario, aunque el nombre lo haya rescatado.
        if (raw?.saved_recipe_id && !resolver.byId.has(raw.saved_recipe_id)) {
          hallucinatedIds.push(`${raw.saved_recipe_id} → "${dish.name}"`);
        }

        if (recipe) {
          savedDishes += 1;
          if (recipe.mealTypes.length === 1 && recipe.mealTypes[0] === "breakfast") {
            // No cuenta como fallo del modelo: `mealTypesLabel` no contempla
            // `breakfast`, así que el prompt le ofrece esa receta como
            // "comida o cena". Se anota aparte para no culpar a quien obedece.
            breakfastRecipesUsed.push(`${where}: ${dish.name}`);
          } else if (!recipe.mealTypes.includes(meal.slot)) {
            mealTypeViolations.push(
              `${where}: "${dish.name}" (${recipe.mealTypes.join("/")})`,
            );
          }
          for (const ing of recipe.ingredients) {
            usedIngredients.add(normalizeName(ing.name));
          }
          for (const miss of fx.availabilityById.get(recipe.id)?.missing ?? []) {
            missingUnion.set(normalizeName(miss), miss);
          }
        } else {
          inventedDishes += 1;
          // Un plato inventado no tiene ficha: lo que falta se calcula con sus
          // ingredientes y el mismo emparejado que «añadir lo que falte».
          const ingredients = (raw?.ingredients ?? []).map((ing) => ({
            name: ing.name,
            productId: null,
          }));
          for (const ing of ingredients) usedIngredients.add(normalizeName(ing.name));
          const availability = summarizeAvailability({
            ingredients,
            index: fx.catalogIndex,
            stockProductIds: fx.stockProductIds,
            stockNames: fx.stockNames,
            listProductIds: fx.listProductIds,
            listNames: fx.listNames,
          });
          for (const miss of availability.missing) {
            missingUnion.set(normalizeName(miss), miss);
          }
        }

        const key = normalizeName(dish.name);
        const seen = nameCounts.get(key);
        if (seen) seen.n += 1;
        else nameCounts.set(key, { name: dish.name, n: 1 });
        if (recentNorm.has(key)) recentClashes.push(`${where}: ${dish.name}`);
      }
    }
  }

  // --- reglas: qué cumplió el modelo y qué tuvo que arreglar el validador ---
  const minBefore = countRecipe(struct, RULES.min.recipeId);
  const maxBefore = countRecipe(struct, RULES.max.recipeId);
  const validatable: ValidatableRule[] = (
    [
      { kind: "recipe_min_week", ...RULES.min },
      { kind: "recipe_max_week", ...RULES.max },
    ] as const
  ).map((r) => {
    const recipe = seasonalById.get(r.recipeId);
    return {
      kind: r.kind,
      recipeId: r.recipeId,
      value: r.value,
      recipe: recipe ? { name: recipe.name, mealTypes: recipe.mealTypes } : null,
    };
  });
  const patched = validateAndPatchRules(struct, validatable);

  const before = new Set(dishKeys(struct));
  const after = new Set(dishKeys(patched));
  let patchPlaceholders = 0;
  for (const day of patched.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        if (dish.placeholder || dish.name === PLACEHOLDER_DISH_TEXT) {
          patchPlaceholders += 1;
        }
      }
    }
  }

  // --- dinero: la misma cuenta que /menus, sobre el menú ya parcheado ---
  let total = 0;
  let complete = true;
  let priced = false;
  for (const day of patched.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        const cost = dish.savedRecipeId ? fx.costById.get(dish.savedRecipeId) : null;
        if (cost && cost.pricedCount > 0) {
          total += cost.total * servingsFactor(cost.servings, PREFS.servings);
          priced = true;
          if (!cost.complete) complete = false;
        } else {
          complete = false;
        }
      }
    }
  }
  const weekCost = priced ? { total, complete } : null;
  const warning = assessWeekBudget(weekCost, MONTHLY_BUDGET);
  const tokens = readUsage(usage);

  return {
    ms,
    overProdTimeout: ms > PROD_TIMEOUT_MS,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    daysReturned: generated.days.length,
    dayIndexProblems,
    slotsExpected: 7 * SLOTS.length - (SKIP_ENABLED ? 1 : 0),
    slotsFilled,
    dishes: before.size,
    dishesInClosedSlot,
    overMaxDishes: overMax,
    savedDishes,
    inventedDishes,
    hallucinatedIds,
    mealTypeViolations,
    breakfastRecipesUsed,
    repeatedDishes: [...nameCounts.values()]
      .filter((v) => v.n > 1)
      .map((v) => `${v.name} ×${v.n}`),
    recentClashes,
    newPurchases: [...missingUnion.values()].sort((a, b) => a.localeCompare(b, "es")),
    urgentUsed: URGENT_PRODUCTS.filter((p) => usedIngredients.has(normalizeName(p))),
    weekCost: weekCost ? Math.round(weekCost.total * 100) / 100 : null,
    weekCostComplete: weekCost?.complete ?? false,
    overBudgetBy: warning?.overBy ?? null,
    minBefore,
    maxBefore,
    patchAdded: [...after].filter((k) => !before.has(k)),
    patchRemoved: [...before].filter((k) => !after.has(k)),
    patchPlaceholders,
  };
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

type Run = { model: string; index: number; metrics: Metrics; generated: MenuOut };

function renderWeek(generated: MenuOut): string {
  const byIndex = new Map(generated.days.map((d) => [d.day_index, d]));
  const lines: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = byIndex.get(i);
    const cells = SLOTS.map((slot) => {
      const dishes = day?.meals.find((m) => m.slot === slot)?.dishes ?? [];
      const label = dishes.map((d) => d.recipe_name).join(" + ") || "—";
      return `${slot === "lunch" ? "C" : "N"}: ${label}`;
    });
    lines.push(`| ${DAY_NAMES[i].padEnd(10)} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

/** Media de una métrica por modelo, con los valores crudos entre paréntesis. */
function aggregate(
  runs: Run[],
  model: string,
  pick: (m: Metrics) => number,
): string {
  const xs = runs.filter((r) => r.model === model).map((r) => pick(r.metrics));
  if (xs.length === 0) return "—";
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  const rounded = Math.round(avg * 100) / 100;
  return xs.length > 1 ? `${rounded}  (${xs.join(", ")})` : `${rounded}`;
}

const SUMMARY_ROWS: [string, (m: Metrics) => number][] = [
  ["Latencia (ms)", (m) => m.ms],
  ["Generaciones que pasan de 60 s", (m) => (m.overProdTimeout ? 1 : 0)],
  ["Tokens de salida", (m) => m.outputTokens ?? 0],
  ["Huecos rellenados", (m) => m.slotsFilled],
  ["Platos", (m) => m.dishes],
  ["Del recetario", (m) => m.savedDishes],
  ["Inventados", (m) => m.inventedDishes],
  ["Ids inventados", (m) => m.hallucinatedIds.length],
  ["Días mal numerados", (m) => m.dayIndexProblems.length],
  ["Platos en un hueco cerrado", (m) => m.dishesInClosedSlot],
  ["Tipo de comida incumplido", (m) => m.mealTypeViolations.length],
  ["Platos repetidos", (m) => m.repeatedDishes.length],
  ["Choques con las 2 semanas antes", (m) => m.recentClashes.length],
  ["Compras nuevas distintas", (m) => m.newPurchases.length],
  ["Urgentes aprovechados", (m) => m.urgentUsed.length],
  ["Coste semana (€)", (m) => m.weekCost ?? 0],
  ["Se pasa del objetivo (€)", (m) => m.overBudgetBy ?? 0],
  ["Regla de mínimo: veces", (m) => m.minBefore],
  ["Regla de máximo: veces", (m) => m.maxBefore],
  ["Parches del validador", (m) => m.patchAdded.length + m.patchRemoved.length],
];

function buildReport(
  runs: Run[],
  errors: string[],
  fx: Fixture,
  prompt: string,
): string {
  const md: string[] = [];
  md.push(`# Comparación de modelos — menú semanal\n`);
  md.push(
    `Modelos: ${MODELS.join(" · ")}. ${RUNS} generaciones por modelo, alternadas. ` +
      `Mismo prompt (${prompt.length} caracteres, en \`prompt.txt\`) y el schema de producción.\n`,
  );
  md.push(
    `Hogar: ${PREFS.servings} raciones, ${fx.recipes.length} recetas de ` +
      `${fx.season === "summer" ? "verano" : "invierno"} en el prompt, ` +
      `objetivo semanal ${fx.weeklyBudget} €, hoy ${TODAY}` +
      `${SKIP_ENABLED ? `, regla de hueco cerrado ACTIVA (${RULES.skip.label})` : ""}.\n`,
  );
  md.push(`Urgentes que el menú debería gastar: ${URGENT_PRODUCTS.join(", ")}.\n`);

  md.push("## Resumen\n");
  md.push(`| | ${MODELS.join(" | ")} |`);
  md.push(`|---|${MODELS.map(() => "---").join("|")}|`);
  for (const [label, pick] of SUMMARY_ROWS) {
    md.push(
      `| ${label} | ${MODELS.map((m) => aggregate(runs, m, pick)).join(" | ")} |`,
    );
  }

  md.push("\n## Semanas generadas\n");
  for (const run of runs) {
    const m = run.metrics;
    md.push(`### ${run.model} · generación ${run.index}\n`);
    md.push("```");
    md.push(renderWeek(run.generated));
    md.push("```\n");
    const detail: string[] = [];
    detail.push(
      `${m.ms} ms${m.overProdTimeout ? " ⚠ se pasa del tope de 60 s de producción" : ""}` +
        `${m.outputTokens === null ? "" : ` · ${m.outputTokens} tokens de salida`}`,
    );
    if (m.dayIndexProblems.length) detail.push(`días: ${m.dayIndexProblems.join("; ")}`);
    if (m.hallucinatedIds.length) {
      detail.push(`ids inventados: ${m.hallucinatedIds.join("; ")}`);
    }
    if (m.mealTypeViolations.length) {
      detail.push(`tipo de comida incumplido: ${m.mealTypeViolations.join("; ")}`);
    }
    if (m.breakfastRecipesUsed.length) {
      detail.push(
        `recetas de desayuno en comida o cena (el prompt se las ofrece así): ${m.breakfastRecipesUsed.join("; ")}`,
      );
    }
    if (m.repeatedDishes.length) detail.push(`repetidos: ${m.repeatedDishes.join("; ")}`);
    if (m.recentClashes.length) {
      detail.push(`ya comido hace menos de 2 semanas: ${m.recentClashes.join("; ")}`);
    }
    if (m.dishesInClosedSlot) {
      detail.push(`platos propuestos para el hueco cerrado: ${m.dishesInClosedSlot}`);
    }
    if (m.patchAdded.length) detail.push(`el validador añadió: ${m.patchAdded.join("; ")}`);
    if (m.patchRemoved.length) detail.push(`el validador quitó: ${m.patchRemoved.join("; ")}`);
    if (m.patchPlaceholders) {
      detail.push(`marcadores «${PLACEHOLDER_DISH_TEXT}»: ${m.patchPlaceholders}`);
    }
    detail.push(`urgentes usados: ${m.urgentUsed.join(", ") || "ninguno"}`);
    detail.push(
      `coste: ${m.weekCost ?? "—"} €${m.weekCostComplete ? "" : " (parcial)"}` +
        (m.overBudgetBy ? ` — se pasa ${m.overBudgetBy} €` : " — cabe en el objetivo"),
    );
    detail.push(
      `compras nuevas (${m.newPurchases.length}): ${m.newPurchases.join(", ") || "ninguna"}`,
    );
    md.push(detail.map((d) => `- ${d}`).join("\n") + "\n");
  }

  if (errors.length > 0) {
    md.push("\n## Generaciones fallidas\n");
    md.push(errors.map((e) => `- ${e}`).join("\n"));
  }
  return md.join("\n");
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Detalle de un fallo. Sin esto, «no cuadró con el schema» no distingue un modelo
 * que se cortó a medias de uno que devolvió una semana entera con un solo campo
 * inválido — que es justo lo que pasa con los huecos cerrados.
 */
function describeFailure(err: unknown, model: string, index: number, ms: number) {
  const e = (typeof err === "object" && err !== null ? err : {}) as Record<
    string,
    unknown
  >;
  const message = err instanceof Error ? err.message : String(err);
  const text = typeof e.text === "string" ? e.text : null;
  const cause = e.cause instanceof Error ? e.cause.message : "";
  return {
    text,
    line:
      `${model} #${index} (${ms} ms): ${message}` +
      `\n  finishReason: ${e.finishReason ? String(e.finishReason) : "?"}` +
      `\n  usage: ${e.usage ? JSON.stringify(e.usage) : "?"}` +
      (cause ? `\n  cause: ${cause.slice(0, 400)}` : "") +
      (text ? `\n  respuesta cruda: ${text.length} caracteres (guardada aparte)` : ""),
  };
}

async function main(): Promise<void> {
  const fx = buildFixture();
  const prompt = buildMenuPrompt({
    today: TODAY,
    season: fx.season,
    inventory: fx.inventory,
    recipes: fx.recipes,
    rules: fx.rules,
    shoppingList: fx.shoppingList,
    recentDishes: fx.recentDishes,
    weeklyBudget: fx.weeklyBudget,
    skippedSlots: fx.skippedSlots,
    prefs: fx.prefs,
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "prompt.txt"), prompt, "utf8");

  console.log("=== Contexto ===");
  console.log(`temporada        : ${fx.season}`);
  console.log(
    `recetas al prompt: ${fx.recipes.length} (de ${fx.seasonal.length} de temporada)`,
  );
  console.log(`inventario       : ${fx.inventory.length} líneas`);
  console.log(`urgentes         : ${URGENT_PRODUCTS.join(", ")}`);
  console.log(
    `objetivo semanal : ${fx.weeklyBudget} € (mensual ${MONTHLY_BUDGET} €)`,
  );
  console.log(
    `hueco cerrado    : ${SKIP_ENABLED ? `SÍ (${RULES.skip.label})` : "no"}`,
  );
  console.log(`prompt           : ${prompt.length} caracteres`);
  console.log(`modelos          : ${MODELS.join(", ")}`);
  console.log(`generaciones     : ${RUNS} por modelo\n`);

  // DRY=1: revisar el contexto y el prompt sin gastar cuota.
  if (process.env.DRY === "1") {
    console.log("=== Coste por ración de las 10 primeras del prompt ===");
    for (const r of fx.recipes.slice(0, 10)) {
      const cost =
        r.costPerServing === null
          ? "sin precio"
          : `${r.costPerServing.toFixed(2)} €/ración${r.costPartial ? " (parcial)" : ""}`;
      console.log(
        `${r.name.padEnd(38)} ${cost}  · en casa ${r.availability.inStock}/${r.availability.total}`,
      );
    }
    const totals = [...fx.costById.values()].map((c) => c.total);
    console.log(
      `\nrecetas con precio: ${totals.length}/${fx.seasonal.length} · receta entera de ` +
        `${Math.min(...totals).toFixed(2)} a ${Math.max(...totals).toFixed(2)} €`,
    );
    console.log(`\nPrompt escrito en ${path.join(OUT_DIR, "prompt.txt")}`);
    return;
  }

  loadApiKey();

  const runs: Run[] = [];
  const errors: string[] = [];
  for (let i = 1; i <= RUNS; i += 1) {
    for (const model of MODELS) {
      // La vía de producción: la Server Action también elige por esta env var.
      process.env.AI_MODEL_MENUS = model;
      const started = Date.now();
      try {
        const result = await generateObject({
          model: getModel("menus"),
          schema: menuSchema,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
          prompt,
        });
        const ms = Date.now() - started;
        const metrics = score(result.object, fx, ms, result.usage);
        runs.push({ model, index: i, metrics, generated: result.object });
        console.log(
          `✔ ${model} #${i} — ${ms} ms` +
            `${metrics.overProdTimeout ? " ⚠ SE PASA DEL TOPE DE PRODUCCIÓN" : ""}` +
            ` · ${metrics.dishes} platos · ${metrics.savedDishes} del recetario` +
            ` · ${metrics.newPurchases.length} compras nuevas` +
            ` · ${metrics.patchAdded.length + metrics.patchRemoved.length} parches`,
        );
      } catch (err) {
        const ms = Date.now() - started;
        const failure = describeFailure(err, model, i, ms);
        errors.push(failure.line);
        console.log(`✘ ${model} #${i} — ${failure.line.split("\n").join("\n ")}`);
        if (failure.text) {
          const file = path.join(OUT_DIR, `fallo-${model}-${i}.txt`);
          writeFileSync(file, failure.text, "utf8");
          console.log(`   respuesta cruda en ${file}`);
        }
      }
      await sleep(PAUSE_MS);
    }
  }

  const report = buildReport(runs, errors, fx, prompt);
  const reportFile = path.join(OUT_DIR, "informe.md");
  writeFileSync(reportFile, report, "utf8");
  writeFileSync(
    path.join(OUT_DIR, "runs.json"),
    JSON.stringify(runs, null, 2),
    "utf8",
  );

  // El resumen a consola; el detalle por semana, en el informe.
  const summaryEnd = report.indexOf("\n## Semanas generadas");
  console.log(`\n${report.slice(report.indexOf("## Resumen"), summaryEnd)}`);
  console.log(`\nInforme: ${reportFile}`);
  if (errors.length > 0) {
    console.log(`Fallos: ${errors.length} de ${RUNS * MODELS.length} generaciones`);
  }
}

await main();
