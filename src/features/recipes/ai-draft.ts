/**
 * Mezcla de lo que escribe la IA con lo que ya tenía la receta. Módulo PURO (sin
 * base de datos y sin servidor): lo comparte la generación de una receta del
 * recetario con la de un plato inventado en el menú, y lo comprueba
 * `npm run check:receta-ia`.
 *
 * Existe por un acoplamiento que no se ve desde aquí: el nombre de un
 * ingrediente NO es una etiqueta, es la clave con la que la receta se engancha
 * al catálogo del hogar. `recipe_ingredients.product_id` se resuelve por nombre
 * normalizado (`buildIngredientRows` en `actions.ts`), y de ese vínculo cuelgan
 * tres cosas: qué ingredientes salen como «hay que comprar» en el menú, qué se
 * apunta al pulsar «añadir a la lista lo que falte» y de qué fila de la despensa
 * se descuenta al cocinar. O sea que si la IA devuelve «Arroz bomba» donde el
 * hogar había escrito «Arroz», no se cambia un texto: se rompe el vínculo del
 * que estaba, se crea un ingrediente nuevo sin vínculo y el hogar acaba
 * comprando arroz teniendo arroz.
 *
 * El prompt ya le pide al modelo copiar esos nombres carácter a carácter
 * (`lib/ai/recipe-prompt.ts`), pero un prompt es una petición, no una garantía:
 * lo que hace que no pase es esta mezcla, que del modelo solo acepta CANTIDADES
 * y nombres NUEVOS.
 */
import { normalizeName } from "@/lib/normalize";
import type { UnitType } from "@/lib/supabase/types";
import {
  MAX_INGREDIENT_QUANTITY,
  MAX_RECIPE_INGREDIENT_NAME,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_STEPS,
} from "./schemas";

/** Un ingrediente de la receta (lo que maneja el formulario). */
export type DraftIngredient = {
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  optional: boolean;
  /** Vínculo al catálogo del hogar, si ya estaba resuelto. */
  productId: string | null;
};

/** Un ingrediente tal como lo devuelve el modelo (sin vínculo ni opcional). */
export type GeneratedIngredient = {
  name: string;
  quantity: number | null;
  unit: UnitType | null;
};

/**
 * Numeración o viñeta al principio de un paso («1.», «2)», «1 - », «- », «• »).
 * El prompt pide no numerar, pero los modelos numeran de todas formas y el
 * número lo pone la app al pintar: dejarlo dentro produce un «1. 1. Pica la
 * cebolla».
 *
 * El guion detrás de un número exige que lo siguiente NO sea otra cifra, y esa
 * es la parte que hay que respetar: con `\d{1,2}\s*[.)-]` a secas, un paso que
 * empieza por un rango —«30 - 40 g de sal por litro», «5 - 10 minutos a fuego
 * medio»— perdía el extremo inferior y se quedaba en «40 g de sal por litro».
 * Un número menos en una cantidad no se ve, y aquí las cantidades se compran.
 */
const STEP_MARKER = /^\s*(?:\d{1,2}\s*[.)]\s+|\d{1,2}\s*-\s+(?!\d)|[-*•]\s+)/;

/**
 * Deja un paso en una sola línea y sin su numeración. Lo usa también el pegado
 * del formulario: una receta copiada de una web llega igual de numerada que la
 * respuesta de un modelo.
 */
export function cleanStepText(raw: string): string {
  return raw.replace(STEP_MARKER, "").replace(/\s+/g, " ").trim();
}

/**
 * Pasos generados listos para el editor: sin numeración, sin líneas vacías y
 * como mucho `MAX_RECIPE_STEPS` (el tope que hará cumplir el guardado).
 *
 * Un paso larguísimo se deja tal cual a propósito. Cortarlo por el carácter 500
 * partiría una frase por la mitad sin decir nada; dejándolo, el guardado lo
 * rechaza con un mensaje que dice justo qué hacer («pártelo en dos») y el paso
 * entero sigue delante de quien tiene que partirlo.
 */
export function sanitizeGeneratedSteps(steps: readonly string[]): string[] {
  return steps
    .map(cleanStepText)
    .filter((s) => s.length > 0)
    .slice(0, MAX_RECIPE_STEPS);
}

/**
 * Una cantidad que se pueda guardar y creer, o null.
 *
 * `recipeDetailsSchema` la declara `z.number().nullable()` sin rango —un enum de
 * unidades ya es bastante contrato para un modelo—, y de aquí va directa a
 * `recipe_ingredients.quantity numeric(10, 2)`. Sin esta criba pasaban dos cosas
 * de gravedad muy distinta: un negativo o un cero se guardaban tal cual y
 * viajaban a la lista de la compra y al descuento de la despensa como si fueran
 * un dato; y un valor de nueve cifras revienta la columna con
 * `numeric field overflow`, que es un error de escritura en mitad de un bucle.
 *
 * Un cero se trata como «no lo sé» y no como cero: «0 g de sal» no es una
 * cantidad, es un hueco. Es el mismo criterio que `sanitizePrepMinutes`.
 */
export function sanitizeQuantity(quantity: number | null): number | null {
  if (quantity === null || !Number.isFinite(quantity)) return null;
  if (quantity <= 0 || quantity > MAX_INGREDIENT_QUANTITY) return null;
  // Redondeo a los dos decimales de la columna, para que lo que se guarda sea lo
  // mismo que se enseñó en el borrador. Lo que el redondeo deja en 0 (0,004 g)
  // es «no lo sé», no una cantidad: el contrato es positivo o null.
  const rounded = Math.round(quantity * 100) / 100;
  return rounded > 0 ? rounded : null;
}

/**
 * Minutos de preparación creíbles, o null. Lo que devuelve el modelo aquí no
 * pasa por ninguna otra criba: un 0 («no lo sé» escrito como número), un negativo
 * o un 100000 se guardarían tal cual en `prep_minutes` y saldrían en la ficha de
 * la receta y en el prompt del generador de menús, que lee ese campo para dejar
 * lo elaborado en fin de semana.
 */
export function sanitizePrepMinutes(minutes: number | null): number | null {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  if (minutes <= 0 || minutes > 999) return null;
  return Math.round(minutes);
}

/**
 * Recorta un nombre generado al tope que acepta el guardado, por la última
 * palabra que quepa.
 *
 * Hace falta porque un modelo mete la alternativa dentro del nombre («Caldo de
 * pollo o, en su defecto, una pastilla de concentrado disuelta en agua
 * templada»), y ese nombre acabaría en dos sitios donde nadie lo espera: en el
 * formulario, tumbando el guardado con el mensaje por defecto de zod —en inglés
 * y sin decir qué fila—, y por la vía del menú directo a la base, sin pasar por
 * zod, dejando en la receta un ingrediente que luego el formulario ya no puede
 * guardar nunca.
 *
 * Recortar y no descartar: un ingrediente con el nombre a medias se ve y se
 * arregla en dos toques; uno que desaparece de una receta que dijiste que
 * querías cocinar no se ve hasta que falta en la sartén.
 */
function trimIngredientName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length <= MAX_RECIPE_INGREDIENT_NAME) return clean;
  const cut = clean.slice(0, MAX_RECIPE_INGREDIENT_NAME);
  const lastSpace = cut.lastIndexOf(" ");
  // Solo se corta por la palabra si queda algo reconocible; si no, en seco.
  const trimmed =
    lastSpace > MAX_RECIPE_INGREDIENT_NAME / 2 ? cut.slice(0, lastSpace) : cut;
  return trimmed.trim();
}

/**
 * Une los ingredientes de la receta con los que ha devuelto el modelo.
 *
 * Las reglas, por orden de importancia:
 *   1. Todos los ingredientes que ya estaban SIGUEN estando, con su nombre, su
 *      vínculo al catálogo y su marca de opcional intactos.
 *   2. Al que ya estaba sin cantidad se le pone la del modelo, si el modelo lo
 *      nombró. Cantidad y unidad viajan juntas porque son un solo dato: pegar el
 *      número del modelo a la unidad que ya había es la forma de fabricar un
 *      «2 g» de algo que iba a ser 2 ud.
 *   3. Al que ya traía cantidad no se le toca: esa cantidad la decidió el hogar.
 *   4. Lo que el modelo nombra y no estaba se AÑADE al final, sin vínculo (lo
 *      resolverá por nombre `buildIngredientRows` al guardar).
 *
 * El emparejamiento es por nombre normalizado, la misma cuenta con la que se
 * resuelve el vínculo al producto: si dos nombres normalizan igual, para la app
 * ya son el mismo ingrediente, y esto no puede opinar distinto.
 *
 * EL ORDEN ES PARTE DEL CONTRATO: primero los `existing`, en su mismo orden y
 * uno por uno, y detrás lo añadido. `fillRecipeDetailsAction` lo usa para saber
 * qué fila de la base actualizar y qué es nuevo (`slice(0, existing.length)`)
 * sin volver a emparejar por nombre; si esto reordenara, escribiría la cantidad
 * de un ingrediente en la fila de otro.
 */
export function mergeGeneratedIngredients(
  existing: readonly DraftIngredient[],
  generated: readonly GeneratedIngredient[],
): DraftIngredient[] {
  // El primero gana: un modelo que nombra dos veces el mismo ingrediente no
  // debe acabar produciendo dos filas para él.
  const byNorm = new Map<string, GeneratedIngredient>();
  for (const g of generated) {
    const norm = normalizeName(g.name);
    if (!norm || byNorm.has(norm)) continue;
    byNorm.set(norm, g);
  }

  const matched = new Set<string>();
  const merged: DraftIngredient[] = existing.map((e) => {
    const norm = normalizeName(e.name);
    const g = norm ? byNorm.get(norm) : undefined;
    if (g && norm) matched.add(norm);
    // Sin pareja, o con una cantidad que ya venía puesta: se queda como estaba.
    if (!g || e.quantity !== null) return e;
    const quantity = sanitizeQuantity(g.quantity);
    // Una cantidad que no se puede creer deja el hueco como estaba: mejor un
    // ingrediente sin cantidad que uno con una cantidad inventada, que se lee
    // igual de firme que una buena y acaba en la lista de la compra.
    if (quantity === null) return e;
    return { ...e, quantity, unit: g.unit };
  });

  for (const [norm, g] of byNorm) {
    if (matched.has(norm)) continue;
    // El tope se aplica dejando fuera lo AÑADIDO, nunca lo que ya estaba: un
    // borrador que perdiera un ingrediente del hogar sería peor que uno corto.
    if (merged.length >= MAX_RECIPE_INGREDIENTS) break;
    const quantity = sanitizeQuantity(g.quantity);
    merged.push({
      name: trimIngredientName(g.name),
      quantity,
      // Sin cantidad no hay unidad que acompañar: un «g» suelto en la fila se
      // lee como si faltara el número, cuando lo que dice el modelo es que va al
      // gusto.
      unit: quantity === null ? null : g.unit,
      optional: false,
      productId: null,
    });
  }

  return merged;
}
