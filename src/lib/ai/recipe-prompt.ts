/**
 * Prompt de «cómo se cocina este plato». Devuelve cantidades por ingrediente y
 * pasos para las raciones del hogar (contrato en `recipe-schema.ts`).
 *
 * Nada del hogar entra aquí más allá de la receta: ni inventario, ni lista de la
 * compra, ni presupuesto. Es deliberado y es la diferencia con `menu-prompt.ts`:
 * el generador de menús ELIGE qué cocinar, así que necesita saber qué hay en
 * casa y qué caduca; esto solo explica un plato que ya está elegido, y una
 * receta que cambia según lo que te quede en la nevera no es una receta.
 */

/** Un ingrediente que la receta ya trae escrito. */
export type RecipePromptIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

export type RecipeDetailsPromptContext = {
  /** Nombre del plato. Es lo único obligatorio. */
  name: string;
  /** Nota del hogar sobre el plato, si la hay. */
  description: string | null;
  /** Raciones a las que van referidas TODAS las cantidades de la respuesta. */
  servings: number;
  /** Huecos en los que el hogar come este plato (lunch / dinner / breakfast). */
  mealTypes: readonly string[];
  /** Lo que ya hay escrito en la receta; puede estar vacío. */
  existing: readonly RecipePromptIngredient[];
};

const MEAL_ORDER = ["breakfast", "lunch", "dinner"] as const;
const MEAL_WORD: Record<string, string> = {
  breakfast: "desayuno",
  lunch: "comida",
  dinner: "cena",
};

/**
 * Rótulo del hueco recorriendo los huecos que EXISTEN, no comprobando dos y
 * dejando el resto en un final por defecto: es el mismo fallo que se midió en
 * `menu-prompt.ts` (una receta marcada solo desayuno se ofrecía para cenar).
 */
function mealLabel(types: readonly string[]): string {
  const words = MEAL_ORDER.filter((slot) => types.includes(slot)).map(
    (slot) => MEAL_WORD[slot],
  );
  if (words.length === 0) return "una comida principal";
  if (words.length === 1) return `la ${words[0]}`;
  return `la ${words.slice(0, -1).join(", ")} o la ${words[words.length - 1]}`;
}

function servingsLabel(servings: number): string {
  return servings === 1 ? "1 ración" : `${servings} raciones`;
}

/** Una línea del bloque de ingredientes ya escritos, con o sin cantidad. */
function existingLine(ing: RecipePromptIngredient): string {
  if (ing.quantity === null) return `- ${ing.name} (sin cantidad todavía)`;
  const amount = String(ing.quantity).replace(".", ",");
  return ing.unit
    ? `- ${ing.name}: ${amount} ${ing.unit}`
    : `- ${ing.name}: ${amount}`;
}

export function buildRecipeDetailsPrompt(
  context: RecipeDetailsPromptContext,
): string {
  const { name, description, servings, mealTypes, existing } = context;
  const rations = servingsLabel(servings);

  /*
    El bloque de ingredientes ya escritos es la parte delicada del prompt. Esos
    nombres están vinculados a los productos del catálogo del hogar por nombre
    normalizado (`recipe_ingredients.product_id`), que es lo que hace que «lo que
    falta» acabe en la lista de la compra y que cocinar descuente de la despensa.
    Si el modelo devuelve «Arroz bomba» donde el hogar escribió «Arroz», la app
    ve un ingrediente NUEVO y sin vínculo, y el que estaba se queda huérfano.
    Por eso se le pide copiarlos carácter a carácter — y por eso, además, la
    mezcla de `features/recipes/ai-draft.ts` no se fía de que obedezca.
  */
  const existingBlock =
    existing.length > 0
      ? `Ingredientes que el hogar ya tiene escritos en esta receta:
${existing.map(existingLine).join("\n")}

Con estos ingredientes:
- Devuélvelos TODOS, con el nombre EXACTAMENTE como está escrito arriba, carácter a carácter. No los traduzcas, no los pluralices y no los concretes más («Arroz» no se convierte en «Arroz bomba»): ese nombre es el que enlaza la receta con la despensa del hogar.
- Si ya traen cantidad, respétala: es la que ha decidido el hogar. Si dice «sin cantidad todavía», pon tú la que corresponda a ${rations}.
- Añade además los que falten para poder cocinar el plato.`
      : `La receta todavía no tiene ingredientes escritos: la lista la pones tú entera.`;

  const descriptionBlock = description
    ? `\nLo que el hogar dice del plato: ${description}\n`
    : "";

  return `Eres un cocinero español y te piden la receta de un plato concreto para explicársela a alguien que la va a cocinar hoy en su casa.

Plato: "${name}"
Se come en: ${mealLabel(mealTypes)}
Raciones: ${rations}
${descriptionBlock}
${existingBlock}

Reglas de las cantidades:
- TODAS las cantidades son para ${rations}. No des la cantidad por ración ni la de una receta estándar de otro número de comensales.
- Usa el sistema métrico y solo estas unidades: ud (unidades), g, kg, ml, l. Nada de tazas, cucharadas ni onzas: son cantidades que luego hay que comprar y descontar de la despensa, y una taza no se compra.
- Lo que va «al gusto» (la sal, la pimienta, el aceite de engrasar) va con cantidad null, no con una cantidad inventada.
- Cuenta un ingrediente una sola vez, aunque se use en dos pasos.

Reglas de los pasos:
- En español de España, en imperativo («Pica la cebolla», no «Picar la cebolla» ni «Picamos la cebolla»).
- Un paso es UNA cosa que hacer. Si un paso lleva tres verbos y dos esperas, son varios pasos.
- Di los tiempos y las temperaturas cuando importen («10 minutos a fuego medio», «horno a 200 ºC»), porque es lo que se consulta con las manos ocupadas.
- Cita las cantidades dentro del paso solo cuando ayuden a no volver a la lista («añade los 300 g de arroz»), y usa las MISMAS que has puesto en los ingredientes.
- No numeres los pasos ni escribas «Paso 1»: la app los numera.
- Ni presentación ni emplatado de restaurante: esto es una casa.

Si el plato que te piden no es comida (por ejemplo, un nombre sin sentido), devuelve las dos listas vacías en vez de inventarte una receta.`;
}
