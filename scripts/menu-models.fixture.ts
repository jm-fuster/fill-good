/**
 * Hogar de referencia para comparar modelos de IA generando el menú semanal.
 * Lo usa `scripts/menu-models.compare.ts` (`npm run compare:menu`).
 *
 * Monta el contexto con las MISMAS cuentas que `loadHouseholdMenuContext`
 * (features/menus/actions.ts) pero sin base de datos ni credenciales, para que
 * comparar dos modelos no dependa de qué haya hoy en la despensa de nadie.
 *
 * Qué es dato real del repo:
 *   · Las recetas del pack inicial (`src/features/recipes/seed`), filtradas por
 *     temporada igual que en producción.
 *   · Los 75 productos del catálogo sembrado, leídos de su propia migración
 *     (`20260721170000_seed_default_products.sql`): nombre, normalizado y unidad.
 *   · Todo el cálculo: `summarizeAvailability`, `selectRecipesForPrompt`,
 *     `computeRecipeCost`, `weeklyBudgetTarget` y `buildMenuPrompt`.
 *
 * Qué es sintético, declarado aquí y NO medida de nada real: inventario, lista de
 * la compra, valoraciones, platos de las semanas anteriores, reglas, presupuesto
 * mensual y la tabla de precios. Sirven porque los dos modelos reciben el mismo
 * prompt carácter a carácter: los importes valen para comparar entre modelos, no
 * como el gasto de un hogar de verdad.
 *
 * Por qué la fecha va FIJA (`COMPARE_TODAY`): `promptRecipeScore` puntúa por días
 * desde la última vez cocinada, así que con la fecha del reloj el mismo hogar
 * mandaría un prompt distinto cada día y dos comparaciones no serían comparables.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildCatalogIndex,
  selectRecipesForPrompt,
  summarizeAvailability,
  type CatalogEntry,
  type CatalogIndex,
  type RecipeAvailability,
} from "@/features/menus/prompt-context";
import { weeklyBudgetTarget } from "@/features/menus/week-budget";
import {
  computeRecipeCost,
  type PriceInfo,
  type RecipeCost,
} from "@/features/recipes/cost";
import { SEED_RECIPES, type SeedRecipe } from "@/features/recipes/seed";
import type {
  MenuInventoryLine,
  MenuPrefs,
  MenuRecentDish,
  MenuRecipeLine,
  MenuRuleLine,
} from "@/lib/ai/menu-prompt";
import { getCurrentSeason } from "@/lib/dates";
import { normalizeName } from "@/lib/normalize";
import type { UnitType } from "@/lib/supabase/types";

/**
 * Variable de entorno obligatoria. Devuelve `string` (no `string | undefined`)
 * para que el resto del módulo no vaya sembrado de comprobaciones: si falta, esto
 * no puede funcionar y conviene enterarse en la primera línea.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} sin definir: lanza esto con npm run compare:menu (scripts/compare-menu-models.mjs)`,
    );
  }
  return value;
}

/** Raíz del repo; la pone el envoltorio, que es quien sabe dónde está. */
export const REPO_ROOT = requireEnv("COMPARE_ROOT");

/** Día que ve el modelo. Fijo a propósito (ver cabecera). */
export const TODAY = process.env.COMPARE_TODAY ?? "2026-08-04";
/** Presupuesto mensual del hogar; de aquí sale el objetivo semanal. */
export const MONTHLY_BUDGET = 400;

/**
 * Regla `skip_slot` activada (`SKIP_RULE=1`). Apagada por defecto porque hoy
 * hace fallar la generación ENTERA en cualquier modelo: el prompt pide dejar el
 * hueco vacío, el modelo contesta `"dishes": []` y `menuSchema` exige `.min(1)`
 * platos por hueco. Con la regla puesta esto reproduce ese fallo; sin ella
 * compara el camino que funciona.
 */
export const SKIP_ENABLED = process.env.SKIP_RULE === "1";

// ---------------------------------------------------------------------------
// 1. Catálogo: los 75 productos sembrados, leídos de la migración
// ---------------------------------------------------------------------------

function loadSeededCatalog(): CatalogEntry[] {
  const sql = readFileSync(
    path.join(
      REPO_ROOT,
      "supabase/migrations/20260721170000_seed_default_products.sql",
    ),
    "utf8",
  );
  // Las filas del `values` son ('Nombre', 'normalizado', 'Categoría', unidad, ubicación).
  const re = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g;
  const out: CatalogEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out.push({
      id: `prod-${String(out.length + 1).padStart(3, "0")}`,
      name: m[1],
      normalizedName: m[2],
      defaultUnit: m[4] as UnitType,
    });
  }
  if (out.length < 50) {
    throw new Error(
      `No reconozco el catálogo sembrado (${out.length} filas): ¿cambió el formato de la migración?`,
    );
  }
  return out;
}

const CATALOG = loadSeededCatalog();
const CATALOG_BY_NORM = new Map(CATALOG.map((c) => [c.normalizedName, c]));

/**
 * Producto del catálogo por nombre. Revienta si no existe: un nombre mal escrito
 * aquí no daría un error, daría un hogar donde ese producto no está en casa —y
 * una comparación midiendo otra cosa sin avisar.
 */
function product(name: string): CatalogEntry {
  const c = CATALOG_BY_NORM.get(normalizeName(name));
  if (!c) throw new Error(`El catálogo sembrado no tiene "${name}"`);
  return c;
}

// ---------------------------------------------------------------------------
// 2. El hogar: cuatro personas, agosto, despensa media con cosas a punto de caducar
// ---------------------------------------------------------------------------

export const PREFS: MenuPrefs = {
  goal: "balanced",
  dietStyle: "omnivore",
  avoidText: null,
  servings: 4,
  planBreakfast: false,
};

/** [producto, cantidad, unidad, días para caducar | null, consumir pronto]. */
const INVENTORY_RAW: [string, number, UnitType, number | null, boolean][] = [
  ["Huevos", 12, "ud", 9, false],
  ["Patatas", 2, "kg", null, false],
  ["Tomates", 1.5, "kg", 3, false],
  ["Lechuga", 1, "ud", 2, false],
  ["Pepinos", 3, "ud", 6, false],
  ["Pimientos", 4, "ud", 5, false],
  ["Calabacines", 2, "ud", null, true],
  ["Cebollas", 1, "kg", null, false],
  ["Ajos", 6, "ud", null, false],
  ["Limones", 4, "ud", null, false],
  ["Zanahorias", 0.5, "kg", 8, false],
  ["Arroz", 1, "kg", null, false],
  ["Macarrones", 0.5, "kg", null, false],
  ["Atún en lata", 6, "ud", null, false],
  ["Tomate frito", 3, "ud", null, false],
  ["Aceite de oliva virgen extra", 2, "l", null, false],
  ["Sal", 1, "kg", null, false],
  ["Vinagre", 500, "ml", null, false],
  ["Leche", 4, "l", 12, false],
  ["Yogures", 8, "ud", 10, false],
  ["Pan de molde", 1, "ud", 4, false],
  ["Queso rallado", 200, "g", 5, false],
  ["Pechugas de pollo", 0.8, "kg", 2, false],
  ["Garbanzos cocidos", 2, "ud", null, false],
];

/**
 * Lo que caduca en tres días o menos, más lo marcado «consumir pronto»: es lo que
 * un menú bueno tiene que gastar, y el objetivo 3 del prompt se lo pide.
 */
export const URGENT_PRODUCTS = INVENTORY_RAW.filter(
  ([, , , days, useSoon]) => useSoon || (days !== null && days <= 3),
).map(([name]) => name);

/** Ya apuntado en la lista: el prompt lo cuenta como disponible. */
const SHOPPING_LIST = [
  "Merluza",
  "Salmón",
  "Gambas congeladas",
  "Jamón serrano",
  "Nata para cocinar",
  "Guisantes congelados",
  "Pan",
  "Plátanos",
];

/** [receta, valoración, veces cocinada, días desde la última vez]. */
const SIGNALS_RAW: [string, number | null, number, number | null][] = [
  ["gazpacho", 4.7, 9, 20],
  ["tortilla-de-patatas", 4.5, 14, 16],
  ["pollo-al-ajillo", 4.2, 7, 5],
  ["espaguetis-bolonesa", 4.0, 11, 6],
  ["ensalada-mixta", 3.8, 12, 4],
  ["macarrones-con-tomate", 3.5, 8, 7],
  ["pisto", 4.4, 5, 3],
  ["salmorejo", 4.6, 4, 6],
  ["merluza-al-horno", 4.1, 3, 26],
  ["salmon-al-horno-con-verduras", 4.8, 2, 33],
  ["arroz-con-gambas", 4.3, 2, 41],
  ["huevos-rotos-con-jamon", 4.0, 6, 22],
  ["crema-de-calabacin", 3.2, 4, 19],
  ["ensalada-de-garbanzos", 3.9, 3, 29],
  ["sandwich-mixto", 2.8, 9, 8],
  ["pechuga-a-la-plancha-con-ensalada", 3.6, 5, 13],
  ["albondigas-en-salsa", 4.5, 4, 37],
  ["arroz-a-la-cubana", 3.4, 3, 44],
  ["merluza-a-la-plancha", 3.7, 2, 9],
  ["tomates-rellenos-de-atun", 4.2, 1, 52],
];

/**
 * Platos de las dos semanas anteriores. Son diez de las treinta y cuatro recetas
 * de temporada: suficientes para que evitar la repetición cueste algo y se vea
 * qué modelo lo consigue.
 */
export const RECENT_DISHES: MenuRecentDish[] = [
  { name: "Ensalada mixta con atún", cooked: true },
  { name: "Espaguetis a la boloñesa", cooked: true },
  { name: "Pisto de verduras", cooked: true },
  { name: "Pollo al ajillo", cooked: true },
  { name: "Salmorejo cordobés", cooked: true },
  { name: "Macarrones con tomate", cooked: true },
  { name: "Sándwich mixto", cooked: false },
  { name: "Merluza a la plancha", cooked: false },
  { name: "Pizza con lo que había", cooked: true },
  { name: "Croquetas de la abuela", cooked: true },
];

/** Reglas activas del hogar: una de mínimo, una de máximo, una de texto y un hueco cerrado. */
export const RULES = {
  min: { recipeId: "gazpacho", value: 2 },
  max: { recipeId: "tortilla-de-patatas", value: 1 },
  freeText: "El domingo, comida más elaborada: comemos en familia.",
  /** weekday 2 = miércoles (0 = lunes), igual que `getWeekDays`. */
  skip: { weekday: 2, slot: "dinner", label: "miércoles: cena" },
} as const;

// ---------------------------------------------------------------------------
// 3. Precios → coste con el cálculo real de M7
// ---------------------------------------------------------------------------

/**
 * [producto, importe, unidad, contenido del envase].
 *
 * `computeRecipeCost` espera el precio de UNA unidad de la `unit` declarada, así
 * que en lo que se vende por envase (gambas a 9,80 € la bolsa de 400 g) el cuarto
 * valor es ese contenido y abajo se reparte. Sin repartirlo se cobraba la bolsa
 * entera por cada gramo de la receta y la semana costaba miles de euros.
 *
 * Un producto sin entrada se queda sin precio: el coste sale parcial, que es lo
 * que pasa de verdad en un hogar (aquí la sal, por ejemplo).
 */
const PRICES_RAW: [string, number, UnitType, number?][] = [
  ["Patatas", 1.29, "kg"],
  ["Cebollas", 1.15, "kg"],
  ["Tomates", 1.95, "kg"],
  ["Zanahorias", 0.99, "kg"],
  ["Pimientos", 0.85, "ud"],
  ["Calabacines", 0.79, "ud"],
  ["Lechuga", 1.1, "ud"],
  ["Pepinos", 0.65, "ud"],
  ["Ajos", 0.25, "ud"],
  ["Limones", 0.35, "ud"],
  ["Plátanos", 0.3, "ud"],
  ["Manzanas", 0.45, "ud"],
  ["Pechugas de pollo", 6.9, "kg"],
  ["Carne picada", 8.5, "kg"],
  ["Lomo de cerdo", 7.2, "kg"],
  ["Jamón cocido", 1.85, "g", 200],
  ["Jamón serrano", 3.4, "g", 100],
  ["Salmón", 13.9, "kg"],
  ["Merluza", 11.5, "kg"],
  ["Gambas congeladas", 9.8, "g", 400],
  ["Huevos", 0.28, "ud"],
  ["Leche", 0.89, "l"],
  ["Yogures", 0.35, "ud"],
  ["Queso rallado", 2.2, "g", 150],
  ["Queso curado", 3.1, "g", 250],
  ["Mantequilla", 2.45, "g", 250],
  ["Nata para cocinar", 1.1, "ml", 500],
  ["Arroz", 1.45, "kg"],
  ["Macarrones", 1.1, "kg"],
  ["Espaguetis", 1.1, "kg"],
  ["Garbanzos cocidos", 0.89, "ud"],
  ["Atún en lata", 1.35, "ud"],
  ["Tomate frito", 0.95, "ud"],
  ["Aceite de oliva virgen extra", 8.95, "l"],
  ["Pan", 0.85, "ud"],
  ["Pan de molde", 1.25, "ud"],
  ["Pan rallado", 1.05, "g", 500],
  ["Mayonesa", 1.75, "ud"],
  ["Guisantes congelados", 1.95, "g", 400],
  ["Vinagre", 0.95, "ml", 750],
  ["Frutos secos", 4.5, "g", 200],
  ["Miel", 3.2, "ud"],
  ["Cereales", 2.6, "ud"],
  ["Cacao soluble", 2.9, "g", 400],
];

const PRICE_BY_PRODUCT = new Map<string, PriceInfo>();
for (const [name, price, unit, packAmount] of PRICES_RAW) {
  PRICE_BY_PRODUCT.set(product(name).id, {
    price: packAmount ? price / packAmount : price,
    unit,
  });
}

// ---------------------------------------------------------------------------
// 4. Montaje del contexto
// ---------------------------------------------------------------------------

export type Fixture = {
  season: "winter" | "summer";
  inventory: MenuInventoryLine[];
  recipes: MenuRecipeLine[];
  rules: MenuRuleLine[];
  shoppingList: string[];
  recentDishes: MenuRecentDish[];
  weeklyBudget: number | null;
  skippedSlots: string[];
  prefs: MenuPrefs;
  /** Recetas de temporada: las que el modelo puede citar por id. */
  seasonal: SeedRecipe[];
  costById: Map<string, RecipeCost>;
  availabilityById: Map<string, RecipeAvailability>;
  catalogIndex: CatalogIndex;
  stockProductIds: Set<string>;
  stockNames: Set<string>;
  listProductIds: Set<string>;
  listNames: Set<string>;
};

export function buildFixture(): Fixture {
  const season = getCurrentSeason(new Date(`${TODAY}T12:00:00`));
  const catalogIndex = buildCatalogIndex(CATALOG);

  // Existencias con el criterio de producción: por producto y, como red de
  // seguridad para lo que no empareja, por nombre normalizado.
  const stockProductIds = new Set<string>();
  const stockNames = new Set<string>();
  const inventory: MenuInventoryLine[] = INVENTORY_RAW.map(
    ([name, quantity, unit, expiresInDays, useSoon]) => {
      const p = product(name);
      stockProductIds.add(p.id);
      stockNames.add(p.normalizedName);
      return { name: p.name, quantity, unit, expiresInDays, useSoon };
    },
  );

  const listProductIds = new Set<string>();
  const listNames = new Set<string>();
  for (const name of SHOPPING_LIST) {
    const p = product(name);
    listProductIds.add(p.id);
    listNames.add(p.normalizedName);
  }

  const seasonal = SEED_RECIPES.filter(
    (r) => r.seasons.includes("all") || r.seasons.includes(season),
  );

  // Los ingredientes del pack vienen por nombre; enlazarlos al catálogo es lo que
  // hace la app al sembrar el hogar. Sin `productId` no hay precio ni match de
  // primer nivel en `resolveIngredient`.
  const linkedById = new Map<
    string,
    { name: string; productId: string | null }[]
  >();
  for (const r of seasonal) {
    linkedById.set(
      r.id,
      r.ingredients.map((i) => ({
        name: i.name,
        productId: CATALOG_BY_NORM.get(normalizeName(i.name))?.id ?? null,
      })),
    );
  }
  const linked = (id: string) => linkedById.get(id) ?? [];

  const availabilityById = new Map<string, RecipeAvailability>();
  for (const r of seasonal) {
    availabilityById.set(
      r.id,
      summarizeAvailability({
        ingredients: linked(r.id),
        index: catalogIndex,
        stockProductIds,
        stockNames,
        listProductIds,
        listNames,
      }),
    );
  }

  const costById = new Map<string, RecipeCost>();
  for (const r of seasonal) {
    const ings = r.ingredients.map((i, idx) => ({
      productId: linked(r.id)[idx]?.productId ?? null,
      quantity: i.quantity,
      unit: i.unit,
    }));
    const cost = computeRecipeCost(ings, PRICE_BY_PRODUCT, r.servings);
    if (cost.pricedCount > 0) costById.set(r.id, cost);
  }

  const signalsById = new Map(
    SIGNALS_RAW.map(([id, avgRating, timesCooked, daysAgo]) => [
      id,
      { avgRating, timesCooked, daysAgo },
    ]),
  );

  const ruleRecipeIds = new Set<string>([RULES.min.recipeId, RULES.max.recipeId]);

  const chosenIds = selectRecipesForPrompt(
    seasonal.map((r) => {
      const sig = signalsById.get(r.id);
      return {
        id: r.id,
        availability:
          availabilityById.get(r.id) ??
          ({ total: 0, inStock: 0, inList: 0, missing: [] } as RecipeAvailability),
        avgRating: sig?.avgRating ?? null,
        lastCookedAt: sig?.daysAgo == null ? null : isoDaysAgo(sig.daysAgo),
        requiredByRule: ruleRecipeIds.has(r.id),
      };
    }),
    { todayISO: TODAY },
  );

  const seasonalById = new Map(seasonal.map((r) => [r.id, r]));
  const recipes: MenuRecipeLine[] = chosenIds.flatMap((id): MenuRecipeLine[] => {
    const r = seasonalById.get(id);
    const availability = availabilityById.get(id);
    if (!r || !availability) return [];
    const sig = signalsById.get(id);
    const cost = costById.get(id);
    return [
      {
        id,
        name: r.name,
        mealTypes: r.mealTypes,
        avgRating: sig?.avgRating ?? null,
        timesCooked: sig?.timesCooked ?? 0,
        lastCookedLabel:
          sig?.daysAgo == null ? null : relativeDaysLabelFromToday(sig.daysAgo),
        // El pack inicial no declara minutos de preparación.
        prepMinutes: null,
        costPerServing:
          cost && cost.pricedCount > 0 ? cost.total / r.servings : null,
        costPartial: cost ? !cost.complete : false,
        availability,
        ingredients: r.ingredients.map((i) => i.name),
      },
    ];
  });

  const rules: MenuRuleLine[] = [
    {
      kind: "recipe_min_week",
      recipeName: seasonalById.get(RULES.min.recipeId)?.name ?? RULES.min.recipeId,
      value: RULES.min.value,
    },
    {
      kind: "recipe_max_week",
      recipeName: seasonalById.get(RULES.max.recipeId)?.name ?? RULES.max.recipeId,
      value: RULES.max.value,
    },
    { kind: "free_text", text: RULES.freeText },
  ];

  return {
    season,
    inventory,
    recipes,
    rules,
    shoppingList: SHOPPING_LIST,
    recentDishes: RECENT_DISHES,
    weeklyBudget: weeklyBudgetTarget(MONTHLY_BUDGET),
    skippedSlots: SKIP_ENABLED ? [RULES.skip.label] : [],
    prefs: PREFS,
    seasonal,
    costById,
    availabilityById,
    catalogIndex,
    stockProductIds,
    stockNames,
    listProductIds,
    listNames,
  };
}

/** Fecha ISO de hace N días contando desde TODAY, no desde el reloj. */
function isoDaysAgo(days: number): string {
  const t = new Date(`${TODAY}T12:00:00`).getTime() - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Mismo texto que `relativeDaysLabel`, pero contra TODAY. La del repo mide contra
 * el reloj: con ella el prompt cambiaría cada día que pasara.
 */
function relativeDaysLabelFromToday(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}
