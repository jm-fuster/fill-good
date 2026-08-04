/**
 * Cálculo PURO (sin I/O, sin IA) de lo que el generador de menús sabe de CADA
 * receta antes de escribir el prompt, y de qué recetas entran en él.
 *
 * Son dos decisiones que hasta ahora tomaba el modelo a ojo con los datos en
 * bruto, y las dos son cuentas:
 *
 *   1. `summarizeAvailability` reparte los ingredientes de una receta en tres
 *      montones —lo que hay en casa, lo que ya está apuntado en la lista de la
 *      compra y lo que habría que comprar— con el MISMO emparejado de tres
 *      niveles que usa «añadir a la lista lo que falte» (`missing.ts`). El
 *      reparto es exhaustivo y excluyente: `inStock + inList + missing.length`
 *      es siempre el total de ingredientes distintos. La precedencia es
 *      **stock antes que lista**: tener algo en casa Y apuntado cuenta como
 *      tenerlo, no como dos.
 *
 *   2. `selectRecipesForPrompt` ordena el recetario por lo que de verdad
 *      interesa a un menú (aprovechar lo que hay, lo que gusta, lo que hace
 *      tiempo que no se cocina) y lo recorta a un tope. El recorte es un seguro
 *      contra recetarios enormes, no una criba: por debajo del tope entran
 *      todas y en el mismo orden de relevancia.
 *
 * La regla que NO se puede romper: una receta nombrada por una regla activa del
 * hogar («lentejas al menos una vez por semana») nunca se queda fuera del
 * prompt, aunque el recetario pase del tope. Si se cayera, el validador de
 * reglas (`rules.ts`) la colocaría igualmente en un hueco, pero el modelo
 * habría planificado la semana sin saber que existía: acabaría metida a la
 * fuerza junto a un plato parecido que él sí vio.
 */
import { normalizeName } from "@/lib/normalize";
import {
  buildCatalogIndex,
  resolveIngredient,
  type CatalogEntry,
  type CatalogIndex,
} from "./missing";

export { buildCatalogIndex };
export type { CatalogEntry, CatalogIndex };

/** Ingrediente de una receta, con su vínculo al catálogo si B1 lo enlazó. */
export type AvailabilityIngredient = {
  name: string;
  productId: string | null;
};

/** Reparto de los ingredientes de una receta entre casa, lista y lo que falta. */
export type RecipeAvailability = {
  /** Ingredientes DISTINTOS (dos que casan con el mismo producto cuentan uno). */
  total: number;
  /** Cuántos hay en casa ahora mismo. */
  inStock: number;
  /** Cuántos no hay en casa pero ya están apuntados en la lista de la compra. */
  inList: number;
  /** Los que no están ni en casa ni en la lista, en el orden de la receta. */
  missing: string[];
};

export type AvailabilityInput = {
  ingredients: readonly AvailabilityIngredient[];
  index: CatalogIndex;
  /** Ids de producto con existencias (suma > 0). */
  stockProductIds: ReadonlySet<string>;
  /** Nombres normalizados con existencias (red de seguridad sin match). */
  stockNames: ReadonlySet<string>;
  /** Ids de producto ya presentes en la lista activa. */
  listProductIds: ReadonlySet<string>;
  /** Nombres normalizados ya presentes en la lista activa. */
  listNames: ReadonlySet<string>;
  fuzzyThreshold?: number;
};

export function summarizeAvailability(
  input: AvailabilityInput,
): RecipeAvailability {
  const seen = new Set<string>();
  let total = 0;
  let inStock = 0;
  let inList = 0;
  const missing: string[] = [];

  for (const ing of input.ingredients) {
    const norm = normalizeName(ing.name);
    if (!norm) continue;

    const match = resolveIngredient(
      norm,
      ing.productId,
      input.index,
      input.fuzzyThreshold,
    );

    // Mismo criterio de deduplicación que `computeMissingIngredients`: por
    // producto emparejado o, sin match, por nombre normalizado.
    const key = match ? `p:${match.productId}` : `n:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += 1;

    if (
      (match !== null && input.stockProductIds.has(match.productId)) ||
      input.stockNames.has(norm)
    ) {
      inStock += 1;
      continue;
    }

    if (
      (match !== null && input.listProductIds.has(match.productId)) ||
      input.listNames.has(norm)
    ) {
      inList += 1;
      continue;
    }

    missing.push(ing.name);
  }

  return { total, inStock, inList, missing };
}

// ---------------------------------------------------------------------------
// Qué recetas entran en el prompt
// ---------------------------------------------------------------------------

/**
 * ¿Cabe esta receta en alguno de los huecos que el hogar planifica?
 *
 * Con el desayuno desactivado —el caso por defecto—, una receta marcada SOLO
 * desayuno no tiene dónde ir: el prompt pide comida y cena, y `enforceMin`
 * tampoco la colocaría porque respeta el tipo de comida. Mandarla igualmente al
 * modelo no es neutral, es una invitación: «Tostadas con tomate» acabó de cena
 * en 2 de 6 generaciones medidas.
 *
 * Sin tipos declarados vale para cualquier hueco. Una receta así es flexible por
 * omisión, no inservible, y filtrarla escondería medio recetario de quien nunca
 * rellenó ese campo.
 */
export function recipeFitsActiveSlots(
  mealTypes: readonly string[],
  activeSlotKeys: readonly string[],
): boolean {
  if (mealTypes.length === 0) return true;
  return mealTypes.some((type) => activeSlotKeys.includes(type));
}

/**
 * Tope de recetas del recetario que viajan al prompt. Está por encima de lo que
 * tiene un hogar normal a propósito: no es una criba que deba notarse en el uso
 * diario, sino un seguro contra un recetario que crece sin parar.
 *
 * Contra qué protege, medido (agosto 2026, con el propio `buildMenuPrompt`):
 * cada receta cuesta ~62 tokens, y el prompt entero va de ~2.000 tokens en un
 * hogar que empieza a ~8.700 en el tope, con el recetario ocupando el 57-65%.
 * Un recetario de 150 recetas sin tope serían ~16.700.
 *
 * O sea que el tope NO protege el límite del free tier: cualquiera de esas
 * cifras es diminuta frente a la ventana de contexto de un Flash, y lo que se
 * agota en el free tier son PETICIONES por minuto, no tokens (de eso se encarga
 * `enforceAiRateLimit`). Lo que protege es la ATENCIÓN del modelo: elegir 14
 * platos entre 150 candidatos descritos con todo detalle es un problema peor que
 * elegirlos entre 60 ya ordenados por relevancia. Por eso subirlo es barato en
 * coste y discutible en calidad — y la calidad solo se sabe generando.
 */
export const MAX_PROMPT_RECIPES = 60;

/** Días desde la última vez cocinada por debajo de los cuales conviene descansar. */
const RECENT_COOK_DAYS = 7;

export type PromptRecipeCandidate = {
  id: string;
  availability: RecipeAvailability;
  avgRating: number | null;
  /** Última vez que se cocinó (YYYY-MM-DD) o null si nunca. */
  lastCookedAt: string | null;
  /** Una regla activa del hogar nombra esta receta: nunca se descarta. */
  requiredByRule: boolean;
};

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  return Math.floor((to - from) / 86_400_000);
}

/**
 * Relevancia de una receta para el menú de esta semana. Los pesos siguen el
 * mismo criterio que «¿Qué hago hoy?» (`tonight.ts`) con una diferencia
 * deliberada: aquí lo que ya está en la lista de la compra también suma, porque
 * un menú se planifica para los próximos siete días y esa compra habrá entrado
 * en casa antes de cocinarlo.
 */
export function promptRecipeScore(
  candidate: PromptRecipeCandidate,
  todayISO: string,
): number {
  const { total, inStock, inList } = candidate.availability;
  let score = total > 0 ? (inStock / total) * 100 + (inList / total) * 40 : 0;

  // Sin valoración se asume el término medio: una receta sin votar no debe
  // hundirse por debajo de una que gustó poco.
  score += (candidate.avgRating ?? 3) * 6;

  if (candidate.lastCookedAt === null) {
    score += 10;
  } else {
    const days = daysBetween(candidate.lastCookedAt, todayISO);
    score += days <= RECENT_COOK_DAYS ? -30 : Math.min(days, 45) * 0.4;
  }

  return score;
}

/**
 * Ordena el recetario por relevancia y lo recorta al tope, devolviendo los ids
 * en el orden en que deben aparecer en el prompt.
 *
 * Las recetas con regla activa que se quedarían fuera del tope se añaden al
 * final: el resultado puede pasarse del `limit`, y eso es lo correcto —el tope
 * protege el tamaño del prompt, la regla es una promesa al usuario.
 */
export function selectRecipesForPrompt(
  candidates: readonly PromptRecipeCandidate[],
  options: { todayISO: string; limit?: number },
): string[] {
  const limit = options.limit ?? MAX_PROMPT_RECIPES;

  const scored = candidates.map((candidate, index) => ({
    candidate,
    index,
    score: promptRecipeScore(candidate, options.todayISO),
  }));
  // Empate → orden de entrada, para que dos generaciones seguidas con los
  // mismos datos manden exactamente el mismo prompt.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen: string[] = [];
  const rescued: string[] = [];
  for (const s of scored) {
    if (chosen.length < limit) chosen.push(s.candidate.id);
    else if (s.candidate.requiredByRule) rescued.push(s.candidate.id);
  }
  return [...chosen, ...rescued];
}
