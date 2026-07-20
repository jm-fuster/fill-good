export type MenuInventoryLine = {
  name: string;
  quantity: number;
  unit: string;
  expiresInDays: number | null;
  useSoon: boolean;
};

/** Una receta del recetario tal como se presenta al modelo. */
export type MenuRecipeLine = {
  id: string;
  name: string;
  /** ["lunch"], ["dinner"] o ambos. */
  mealTypes: string[];
  avgRating: number | null;
  timesCooked: number;
  /** Etiqueta relativa de la última vez que se cocinó ("hace 12 días") o null. */
  lastCookedLabel: string | null;
  ingredients: { name: string; inStock: boolean }[];
};

export type MenuRuleLine =
  | { kind: "recipe_min_week"; recipeName: string; value: number }
  | { kind: "recipe_max_week"; recipeName: string; value: number }
  | { kind: "free_text"; text: string };

export type MenuPromptContext = {
  /** Fecha de hoy (YYYY-MM-DD), para que los platos nuevos sean de temporada. */
  today: string;
  season: "winter" | "summer";
  inventory: MenuInventoryLine[];
  /** Recetario ya filtrado por la temporada actual. */
  recipes: MenuRecipeLine[];
  /** Reglas activas del hogar. */
  rules: MenuRuleLine[];
};

const SEASON_LABEL: Record<"winter" | "summer", string> = {
  winter: "invierno",
  summer: "verano",
};

function timesLabel(n: number): string {
  return n === 1 ? "vez" : "veces";
}

function mealTypesLabel(types: string[]): string {
  const hasLunch = types.includes("lunch");
  const hasDinner = types.includes("dinner");
  if (hasLunch && hasDinner) return "comida o cena";
  if (hasLunch) return "solo comida";
  if (hasDinner) return "solo cena";
  return "comida o cena";
}

function ratingLabel(avg: number | null): string {
  if (avg == null) return "sin valorar";
  return `valoración ★${avg.toFixed(1).replace(".", ",")}`;
}

function cookedLabel(timesCooked: number, lastCookedLabel: string | null): string {
  if (timesCooked <= 0) return "nunca cocinada";
  const base = `cocinada ${timesCooked} ${timesLabel(timesCooked)}`;
  return lastCookedLabel ? `${base} (última vez ${lastCookedLabel})` : base;
}

function recipeLine(r: MenuRecipeLine): string {
  const ings =
    r.ingredients.length > 0
      ? r.ingredients
          .map((i) => (i.inStock ? `${i.name} (en casa)` : i.name))
          .join(", ")
      : "(sin ingredientes)";
  return `- id ${r.id} · "${r.name}" (${mealTypesLabel(r.mealTypes)}) · ${ratingLabel(
    r.avgRating,
  )} · ${cookedLabel(r.timesCooked, r.lastCookedLabel)} · ingredientes: ${ings}`;
}

function ruleLine(rule: MenuRuleLine): string {
  if (rule.kind === "free_text") return `- ${rule.text}`;
  const times = `${rule.value} ${timesLabel(rule.value)}`;
  if (rule.kind === "recipe_min_week") {
    return `- "${rule.recipeName}" debe salir AL MENOS ${times} esta semana.`;
  }
  return `- "${rule.recipeName}" puede salir COMO MUCHO ${times} esta semana.`;
}

export function buildMenuPrompt(context: MenuPromptContext): string {
  const { today, season, inventory, recipes, rules } = context;

  const inventoryText =
    inventory.length > 0
      ? inventory
          .map((i) => {
            const flags: string[] = [];
            if (i.expiresInDays !== null) {
              flags.push(`caduca en ${i.expiresInDays} días`);
            }
            // "Consumir pronto" tiene la misma prioridad que una caducidad
            // inminente aunque no haya fecha.
            if (i.useSoon) flags.push("consumir pronto");
            const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
            return `- ${i.name}: ${i.quantity} ${i.unit}${suffix}`;
          })
          .join("\n")
      : "(el inventario está vacío)";

  const recipesText =
    recipes.length > 0
      ? recipes.map(recipeLine).join("\n")
      : "(no hay recetas guardadas de esta temporada)";

  const rulesText =
    rules.length > 0
      ? rules.map(ruleLine).join("\n")
      : "(no hay reglas; planifica con libertad)";

  return `Eres un cocinero que planifica un menú semanal saludable y equilibrado para un hogar en España.
Hoy es ${today} (temporada actual: ${SEASON_LABEL[season]}).

Genera un menú para 7 días (de lunes a domingo), con COMIDA y CENA cada día.

Objetivos, POR ORDEN DE PRIORIDAD:
1. Cumplir SIEMPRE las reglas obligatorias del hogar (más abajo).
2. Aprovechar lo que ya hay en el inventario, especialmente lo que caduca pronto o está marcado como "consumir pronto".
3. Preferir recetas del recetario del hogar cuando encajen, sobre todo las mejor valoradas que hace tiempo que no se cocinan. Respeta el tipo de comida de cada receta: una receta "solo cena" no puede ir en la comida, ni una "solo comida" en la cena. No repitas la misma receta durante la semana salvo que una regla lo exija.
4. Completar con platos nuevos (de temporada, propios de ${SEASON_LABEL[season]}) cuando el recetario no baste para los 7 días.
5. Dieta equilibrada y variada (verduras, legumbres, pescado, carne, hidratos). Cenas más ligeras que las comidas.

Inventario actual del hogar:
${inventoryText}

Recetario del hogar (solo recetas de la temporada actual):
${recipesText}
Si un plato es una de estas recetas, copia su id EXACTO en el campo saved_recipe_id. Si inventas un plato nuevo, deja saved_recipe_id en null.

Reglas obligatorias del hogar:
${rulesText}

Cada comida y cena es una lista de platos. La comida (lunch) puede llevar 1 o 2 platos (por ejemplo un primero ligero y un segundo) cuando tenga sentido; la cena (dinner) normalmente 1 plato. Nunca más de 2 platos por hueco.

Para cada plato indica: nombre claro en español, saved_recipe_id (id del recetario o null), una descripción breve y la lista de ingredientes con cantidad y unidad aproximadas (para 2 raciones). Usa ingredientes comunes; puedes proponer ingredientes que no estén en el inventario (se añadirán a la lista de la compra).

Devuelve exactamente 7 días (day_index 0 a 6) y en cada día las dos comidas (slot "lunch" y "dinner"), cada una con su lista de platos.`;
}
