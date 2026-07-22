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

/** Un plato ya fijado/conservado en la semana (regeneración respetuosa, N2). */
export type MenuPinnedLine = {
  /** Etiqueta del día ("lunes 22"). */
  day: string;
  /** "comida" | "cena". */
  slot: string;
  /** Nombre del plato conservado. */
  name: string;
};

export type MenuGoal = "balanced" | "light" | "muscle" | "gain";
export type DietStyle = "omnivore" | "vegetarian" | "vegan" | "gluten_free";

/** Perfil del hogar (N3): sesgo CUALITATIVO del prompt, sin números nutricionales. */
export type MenuPrefs = {
  goal: MenuGoal;
  dietStyle: DietStyle;
  avoidText: string | null;
  servings: number;
  planBreakfast: boolean;
};

export const DEFAULT_PROMPT_PREFS: MenuPrefs = {
  goal: "balanced",
  dietStyle: "omnivore",
  avoidText: null,
  servings: 2,
  planBreakfast: false,
};

/** Objetivo del hogar → 2–3 frases fijas y deterministas (nunca macros/calorías). */
const GOAL_PHRASES: Record<MenuGoal, string> = {
  balanced:
    "Dieta equilibrada y variada (verduras, legumbres, pescado, carne, hidratos), con cenas más ligeras que las comidas.",
  light:
    "Platos saciantes pero ligeros; verdura abundante; técnicas sencillas (plancha, horno, vapor); cenas especialmente ligeras.",
  muscle:
    "Cada comida y cena debe incluir una fuente clara de proteína (legumbre, huevo, pescado, carne magra o lácteo); raciones generosas.",
  gain:
    "Raciones generosas y platos energéticos y densos; añade acompañamientos (pan, arroz, pasta, frutos secos).",
};

/** Estilo de dieta → frase dura (o vacía para omnívoro). */
const DIET_PHRASES: Record<DietStyle, string> = {
  omnivore: "",
  vegetarian:
    "TODOS los platos deben ser vegetarianos: sin carne ni pescado (sí se permiten huevo y lácteos).",
  vegan:
    "TODOS los platos deben ser veganos: sin carne, pescado, huevo, lácteos ni miel.",
  gluten_free:
    "TODOS los platos deben ser SIN GLUTEN: nada de trigo, cebada, centeno ni derivados (pan, pasta o harinas con gluten normales).",
};

/** Etiqueta legible del nº de raciones ("1 ración" / "N raciones"). */
function servingsLabel(servings: number): string {
  return servings === 1 ? "1 ración" : `${servings} raciones`;
}

export type MenuPromptContext = {
  /** Fecha de hoy (YYYY-MM-DD), para que los platos nuevos sean de temporada. */
  today: string;
  season: "winter" | "summer";
  inventory: MenuInventoryLine[];
  /** Recetario ya filtrado por la temporada actual. */
  recipes: MenuRecipeLine[];
  /** Reglas activas del hogar. */
  rules: MenuRuleLine[];
  /** Platos que la regeneración conserva (fijados o manuales); vacío al rehacer. */
  pinned?: MenuPinnedLine[];
  /** Perfil del hogar; si se omite, se usan los defaults (comportamiento previo). */
  prefs?: MenuPrefs;
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
  const pinned = context.pinned ?? [];
  const prefs = context.prefs ?? DEFAULT_PROMPT_PREFS;

  // Objetivo del hogar (N3): frases fijas por objetivo + estilo de dieta +
  // ingredientes a evitar. Es el sesgo prioritario tras las reglas obligatorias.
  const goalBlock = [
    GOAL_PHRASES[prefs.goal],
    DIET_PHRASES[prefs.dietStyle],
    prefs.avoidText
      ? `Evita SIEMPRE estos ingredientes: ${prefs.avoidText}.`
      : "",
  ]
    .filter((s) => s.length > 0)
    .join(" ");

  const mealsText = prefs.planBreakfast
    ? "DESAYUNO, COMIDA y CENA cada día"
    : "COMIDA y CENA cada día";
  const breakfastLine = prefs.planBreakfast
    ? ' El desayuno (breakfast) lleva 1 plato sencillo y repetible (p. ej. tostadas, fruta con yogur, café con algo).'
    : "";
  const slotsReturnText = prefs.planBreakfast
    ? 'las tres comidas (slot "breakfast", "lunch" y "dinner")'
    : 'las dos comidas (slot "lunch" y "dinner")';
  const rations = servingsLabel(prefs.servings);

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

  // Sección de platos conservados: solo aparece si regeneramos en modo "completar".
  const pinnedSection =
    pinned.length > 0
      ? `\nPlatos ya fijados esta semana (NO los cambies; cuéntalos para la variedad y las reglas, y NO repitas esos mismos platos en otros huecos):
${pinned.map((p) => `- ${p.day}, ${p.slot}: "${p.name}"`).join("\n")}
`
      : "";

  return `Eres un cocinero que planifica un menú semanal para un hogar en España.
Hoy es ${today} (temporada actual: ${SEASON_LABEL[season]}).

Genera un menú para 7 días (de lunes a domingo), con ${mealsText}.

Objetivos, POR ORDEN DE PRIORIDAD:
1. Cumplir SIEMPRE las reglas obligatorias del hogar (más abajo).
2. Respetar el OBJETIVO DEL HOGAR (más abajo): es la guía principal del estilo del menú.
3. Aprovechar lo que ya hay en el inventario, especialmente lo que caduca pronto o está marcado como "consumir pronto".
4. Preferir recetas del recetario del hogar cuando encajen, sobre todo las mejor valoradas que hace tiempo que no se cocinan. Respeta el tipo de comida de cada receta: una receta "solo cena" no puede ir en la comida, ni una "solo comida" en la cena. No repitas la misma receta durante la semana salvo que una regla lo exija.
5. Completar con platos nuevos (de temporada, propios de ${SEASON_LABEL[season]}) cuando el recetario no baste para los 7 días.

Inventario actual del hogar:
${inventoryText}

Recetario del hogar (solo recetas de la temporada actual):
${recipesText}
Si un plato es una de estas recetas, copia su id EXACTO en el campo saved_recipe_id. Si inventas un plato nuevo, deja saved_recipe_id en null.

Reglas obligatorias del hogar:
${rulesText}

Objetivo del hogar (PRIORITARIO):
${goalBlock}
${pinnedSection}
Cada comida es una lista de platos. La comida (lunch) puede llevar 1 o 2 platos (por ejemplo un primero ligero y un segundo) cuando tenga sentido; la cena (dinner) normalmente 1 plato.${breakfastLine} Nunca más de 2 platos por hueco.

Para cada plato indica: nombre claro en español, saved_recipe_id (id del recetario o null), una descripción breve y la lista de ingredientes con cantidad y unidad aproximadas (para ${rations}). Usa ingredientes comunes; puedes proponer ingredientes que no estén en el inventario (se añadirán a la lista de la compra).

Devuelve exactamente 7 días (day_index 0 a 6) y en cada día ${slotsReturnText}, cada una con su lista de platos.`;
}

export type RerollPromptContext = {
  today: string;
  season: "winter" | "summer";
  /** "breakfast" | "lunch" | "dinner": el hueco del plato a sustituir. */
  slot: string;
  /** Nombre del plato actual (lo que el usuario quiere cambiar). */
  currentDish: string;
  inventory: MenuInventoryLine[];
  /** Recetario ya filtrado por la temporada actual. */
  recipes: MenuRecipeLine[];
  rules: MenuRuleLine[];
  /** Nombres del resto de platos de la semana, para no repetir. */
  otherDishes: string[];
  /** Perfil del hogar (N3); si se omite, se usan los defaults. */
  prefs?: MenuPrefs;
};

/**
 * Prompt del re-roll "otra idea" (N2): pide UN solo plato alternativo para un
 * hueco concreto, con el contexto reducido (inventario, recetario de temporada,
 * reglas y los demás platos de la semana para evitar repetir). Respeta el
 * perfil del hogar (N3): objetivo, estilo de dieta, ingredientes a evitar y
 * raciones.
 */
export function buildRerollPrompt(context: RerollPromptContext): string {
  const { today, season, slot, currentDish, inventory, recipes, rules } =
    context;
  const prefs = context.prefs ?? DEFAULT_PROMPT_PREFS;
  const slotLabel =
    slot === "dinner" ? "cena" : slot === "breakfast" ? "desayuno" : "comida";
  const goalBlock = [
    GOAL_PHRASES[prefs.goal],
    DIET_PHRASES[prefs.dietStyle],
    prefs.avoidText
      ? `Evita SIEMPRE estos ingredientes: ${prefs.avoidText}.`
      : "",
  ]
    .filter((s) => s.length > 0)
    .join(" ");
  const rations = servingsLabel(prefs.servings);

  const inventoryText =
    inventory.length > 0
      ? inventory
          .map((i) => {
            const flags: string[] = [];
            if (i.expiresInDays !== null) {
              flags.push(`caduca en ${i.expiresInDays} días`);
            }
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
      : "(no hay reglas; propón con libertad)";

  const otherText =
    context.otherDishes.length > 0
      ? context.otherDishes.map((n) => `- "${n}"`).join("\n")
      : "(ninguno todavía)";

  return `Eres un cocinero que planifica menús para un hogar en España.
Hoy es ${today} (temporada actual: ${SEASON_LABEL[season]}).

Propón UN ÚNICO plato alternativo para la ${slotLabel}, DISTINTO de "${currentDish}".

Objetivos, POR ORDEN DE PRIORIDAD:
1. Respetar las reglas del hogar (más abajo).
2. Respetar el OBJETIVO DEL HOGAR (más abajo).
3. Aprovechar el inventario, sobre todo lo que caduca pronto o hay que consumir pronto.
4. Preferir una receta del recetario si encaja con la ${slotLabel}; si no, inventa un plato de temporada.
5. NO repetir ninguno de los otros platos ya planificados esta semana.

Inventario actual del hogar:
${inventoryText}

Recetario del hogar (solo recetas de la temporada actual):
${recipesText}
Si el plato es una de estas recetas, copia su id EXACTO en saved_recipe_id; si lo inventas, deja saved_recipe_id en null.

Reglas del hogar:
${rulesText}

Objetivo del hogar (PRIORITARIO):
${goalBlock}

Otros platos de la semana (NO los repitas):
${otherText}

Devuelve un solo plato: nombre en español, saved_recipe_id (o null), descripción breve y la lista de ingredientes con cantidad y unidad aproximadas (para ${rations}).`;
}
