/**
 * Reglas del menú: tipos compartidos y validación determinista.
 *
 * Este módulo es PURO (sin I/O, sin "use server"): se puede importar tanto en
 * Server Actions como en el cliente y es testeable en aislamiento. La lógica de
 * `validateAndPatchRules` la consumirá el generador de menús 2.0 (C3) tras
 * recibir la respuesta de la IA y antes de insertar las entradas.
 */

export type MenuRuleKind = "recipe_min_week" | "recipe_max_week" | "free_text";

/** Máximo de platos por hueco (comida/cena), heredado de C1. */
export const MAX_DISHES_PER_SLOT = 2;

/** Texto de un plato marcador cuando se recorta un exceso (recipe_max_week). */
export const PLACEHOLDER_DISH_TEXT = "(elegir plato)";

// ---------------------------------------------------------------------------
// Representación del menú sobre la que opera el validador.
//
// Es intencionadamente ligera y desacoplada del schema de la IA: C3 construye
// esta estructura a partir de su respuesta (una entrada por plato, con posición)
// y luego reconstruye la inserción a partir del resultado parcheado. Cada plato
// lleva lo justo que el validador necesita leer/escribir; `payload` transporta
// datos opacos de C3 (descripción, ingredientes…) que el validador conserva sin
// tocar en los platos que mantiene.
// ---------------------------------------------------------------------------

export type MenuDish = {
  /** Receta guardada del recetario que usa el plato, o null si es inventado. */
  savedRecipeId: string | null;
  /** Nombre visible del plato. */
  name: string;
  /** true si es un marcador "(elegir plato)" creado al recortar un exceso. */
  placeholder?: boolean;
  /**
   * true si el plato está fijado o es manual (N2): el validador lo CUENTA para
   * los min/max pero nunca lo recorta, sustituye ni comparte hueco con nuevos
   * platos. Representa entradas que la regeneración conserva intactas.
   */
  immutable?: boolean;
  /** Datos opacos de C3; el validador no los interpreta. */
  payload?: unknown;
};

export type MenuMeal = {
  /** "lunch" | "dinner" (u otro slot que la app soporte). */
  slot: string;
  dishes: MenuDish[];
  /**
   * El hueco ya ha pasado: sus platos CUENTAN para los mínimos y los máximos
   * —si el lunes comiste lentejas, la regla "lentejas al menos una vez" ya está
   * cumplida— pero no se puede poner ni quitar nada en él.
   *
   * Es distinto de un hueco lleno de platos `immutable`: un hueco pasado está
   * cerrado aunque esté VACÍO. Sin esto, `enforceMin` colocaba el plato que
   * faltaba en el martes de una semana que va por el jueves, la inserción lo
   * descartaba por pasado y la regla se daba por cumplida sin que el plato
   * existiera en ninguna parte.
   */
  locked?: boolean;
};

export type MenuDay = {
  /** Índice del día dentro de la semana (0 = lunes … 6 = domingo). */
  dayIndex: number;
  meals: MenuMeal[];
};

export type MenuStructure = {
  days: MenuDay[];
};

/**
 * Regla lista para validar. C3 enriquece cada regla de frecuencia con los datos
 * de la receta (nombre y tipos de comida) para poder colocarla en un hueco
 * compatible. Las reglas `free_text` no se validan aquí (solo van al prompt), así
 * que no necesitan `recipe`.
 */
export type ValidatableRule = {
  kind: MenuRuleKind;
  recipeId: string | null;
  value: number | null;
  recipe: { name: string; mealTypes: string[] } | null;
};

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

/** Copia profunda de la estructura (no muta la entrada; `payload` por referencia). */
function cloneMenu(menu: MenuStructure): MenuStructure {
  return {
    days: menu.days.map((day) => ({
      dayIndex: day.dayIndex,
      meals: day.meals.map((meal) => ({
        slot: meal.slot,
        // `locked` viaja: reconstruir el hueco campo a campo lo perdía, y un
        // hueco pasado que llega al validador sin su marca vuelve a admitir
        // platos, que es justo lo que la marca existe para impedir.
        locked: meal.locked,
        // Copia superficial de cada plato; `immutable`/`placeholder` se copian.
        dishes: meal.dishes.map((dish) => ({ ...dish })),
      })),
    })),
  };
}

/** Cuenta cuántos platos del menú usan la receta guardada indicada. */
function countRecipe(menu: MenuStructure, recipeId: string): number {
  let n = 0;
  for (const day of menu.days) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        if (dish.savedRecipeId === recipeId) n += 1;
      }
    }
  }
  return n;
}

/** ¿El hueco admite esta receta según sus tipos de comida? Sin tipos ⇒ cualquiera. */
function slotAcceptsRecipe(slot: string, mealTypes: string[]): boolean {
  return mealTypes.length === 0 || mealTypes.includes(slot);
}

/**
 * recipe_max_week: si la receta aparece más de `max` veces, convierte los
 * excesos (los últimos en orden día→hueco→posición) en marcadores
 * "(elegir plato)" para que C3 los inserte como texto libre.
 */
function enforceMax(menu: MenuStructure, recipeId: string, max: number): void {
  let excess = countRecipe(menu, recipeId) - max;
  if (excess <= 0) return;

  // Recorre en orden inverso para recortar los últimos primero.
  for (let d = menu.days.length - 1; d >= 0 && excess > 0; d -= 1) {
    const day = menu.days[d];
    for (let m = day.meals.length - 1; m >= 0 && excess > 0; m -= 1) {
      const meal = day.meals[m];
      // Un hueco pasado no se toca: lo que ya se comió no se puede recortar.
      if (meal.locked) continue;
      for (let i = meal.dishes.length - 1; i >= 0 && excess > 0; i -= 1) {
        // Los platos fijados/manuales cuentan pero no se recortan.
        if (meal.dishes[i].immutable) continue;
        if (meal.dishes[i].savedRecipeId === recipeId) {
          meal.dishes[i] = {
            savedRecipeId: null,
            name: PLACEHOLDER_DISH_TEXT,
            placeholder: true,
          };
          excess -= 1;
        }
      }
    }
  }
}

/**
 * recipe_min_week: si la receta aparece menos de `min` veces, la añade en huecos
 * compatibles con sus tipos de comida hasta alcanzar `min` (o hasta que no queden
 * huecos donde encajarla sin romper otra regla).
 *
 * Estrategia por cada plato que falta, en orden día→hueco (determinista):
 *   1. Si hay un hueco compatible con sitio libre (< MAX platos) que aún no tiene
 *      la receta, se AÑADE ahí.
 *   2. Si no, se SUSTITUYE un plato reemplazable de un hueco compatible: un
 *      marcador, un plato inventado (sin receta guardada) o una receta guardada
 *      que no esté protegida por su propio mínimo (su recuento actual supera su
 *      mínimo). Nunca se sustituye la propia receta requerida.
 *   3. Si no hay dónde, se abandona (config imposible de satisfacer).
 */
function enforceMin(
  menu: MenuStructure,
  recipeId: string,
  min: number,
  recipe: { name: string; mealTypes: string[] },
  minByRecipe: Map<string, number>,
): void {
  const makeDish = (): MenuDish => ({
    savedRecipeId: recipeId,
    name: recipe.name,
  });

  let deficit = min - countRecipe(menu, recipeId);

  while (deficit > 0) {
    // Paso 1: hueco compatible con sitio libre y sin la receta todavía.
    let placed = false;
    for (const day of menu.days) {
      if (placed) break;
      for (const meal of day.meals) {
        if (!slotAcceptsRecipe(meal.slot, recipe.mealTypes)) continue;
        // Un día que ya ha pasado no admite platos nuevos, ni estando vacío.
        if (meal.locked) continue;
        // Un hueco con un plato fijado/manual está reservado: no se amplía.
        if (meal.dishes.some((x) => x.immutable)) continue;
        const alreadyHas = meal.dishes.some((x) => x.savedRecipeId === recipeId);
        if (alreadyHas || meal.dishes.length >= MAX_DISHES_PER_SLOT) continue;
        meal.dishes.push(makeDish());
        placed = true;
        break;
      }
    }
    if (placed) {
      deficit -= 1;
      continue;
    }

    // Paso 2: sustituir un plato reemplazable de un hueco compatible.
    for (const day of menu.days) {
      if (placed) break;
      for (const meal of day.meals) {
        if (!slotAcceptsRecipe(meal.slot, recipe.mealTypes)) continue;
        if (meal.locked) continue;
        if (meal.dishes.some((x) => x.immutable)) continue;
        if (meal.dishes.some((x) => x.savedRecipeId === recipeId)) continue;
        const idx = meal.dishes.findIndex((dish) =>
          isReplaceable(dish, recipeId, minByRecipe, menu),
        );
        if (idx !== -1) {
          meal.dishes[idx] = makeDish();
          placed = true;
          break;
        }
      }
    }
    if (!placed) break; // No hay forma de colocarla sin romper otra regla.
    deficit -= 1;
  }
}

/** ¿Se puede reemplazar este plato para meter la receta requerida? */
function isReplaceable(
  dish: MenuDish,
  requiredRecipeId: string,
  minByRecipe: Map<string, number>,
  menu: MenuStructure,
): boolean {
  // Los platos fijados/manuales nunca se sustituyen.
  if (dish.immutable) return false;
  // La propia receta requerida nunca se sustituye (no aumentaría su recuento).
  if (dish.savedRecipeId === requiredRecipeId) return false;
  // Marcadores y platos inventados son libremente reemplazables.
  if (dish.placeholder || dish.savedRecipeId === null) return true;
  // Receta guardada: solo si no está protegida por su propio mínimo.
  const otherMin = minByRecipe.get(dish.savedRecipeId) ?? 0;
  if (otherMin === 0) return true;
  return countRecipe(menu, dish.savedRecipeId) > otherMin;
}

/**
 * Aplica las reglas de frecuencia sobre un menú ya generado y devuelve una copia
 * parcheada (no muta la entrada). Las reglas `free_text` se ignoran aquí (solo
 * van al prompt en C3).
 *
 * Orden: primero los máximos (recortar excesos libera huecos), luego los mínimos.
 */
export function validateAndPatchRules(
  menu: MenuStructure,
  rules: ValidatableRule[],
): MenuStructure {
  const next = cloneMenu(menu);

  const freqRules = rules.filter(
    (r) =>
      (r.kind === "recipe_min_week" || r.kind === "recipe_max_week") &&
      r.recipeId != null &&
      r.value != null,
  );

  // Recetas con mínimo declarado (protegidas al sustituir en enforceMin).
  const minByRecipe = new Map<string, number>();
  for (const r of freqRules) {
    if (r.kind === "recipe_min_week" && r.recipeId && r.value != null) {
      minByRecipe.set(
        r.recipeId,
        Math.max(minByRecipe.get(r.recipeId) ?? 0, r.value),
      );
    }
  }

  for (const r of freqRules) {
    if (r.kind === "recipe_max_week" && r.recipeId && r.value != null) {
      enforceMax(next, r.recipeId, r.value);
    }
  }

  for (const r of freqRules) {
    if (r.kind === "recipe_min_week" && r.recipeId && r.value != null && r.recipe) {
      enforceMin(next, r.recipeId, r.value, r.recipe, minByRecipe);
    }
  }

  return next;
}
