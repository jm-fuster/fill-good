import { z } from "zod";

const unit = z.enum(["ud", "g", "kg", "ml", "l"]);
const mealType = z.enum(["lunch", "dinner"]);
const season = z.enum(["all", "winter", "summer"]);

/**
 * Topes de la receta. Viven aquí porque el schema es quien los hace cumplir; la
 * mezcla de lo generado por IA (`ai-draft.ts`) los importa para no pasarse y
 * dejar un borrador que el propio guardado rechazaría.
 */
export const MAX_RECIPE_STEPS = 30;
export const MAX_RECIPE_INGREDIENTS = 50;
/**
 * Tope del NOMBRE de un ingrediente. Se exporta porque es el único de esta
 * validación sin `.catch()`: pasarse no ajusta el valor, tumba el guardado
 * entero con el mensaje por defecto de zod (en inglés y sin decir qué fila). Un
 * modelo que escribe «Caldo de pollo o, en su defecto, una pastilla de
 * concentrado disuelta en agua templada» se lo come, así que la mezcla lo recorta
 * antes de que llegue aquí.
 */
export const MAX_RECIPE_INGREDIENT_NAME = 120;
/**
 * Tope de la CANTIDAD de un ingrediente: `numeric(10, 2)` son 8 dígitos
 * enteros, así que 99999999,99 es el techo real de la columna.
 *
 * No es una cota de cordura, es la de la base. Pasarse no da un dato raro: da
 * `numeric field overflow`, un error de ESCRITURA que llega cuando el guardado
 * ya ha empezado. Al editar una receta eso significaba quedarse sin ningún
 * ingrediente (ver `updateRecipeAction`), y basta una errata de un dedo —un
 * cero de más repetido al teclear los gramos— para provocarlo.
 */
export const MAX_INGREDIENT_QUANTITY = 99_999_999;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Texto demasiado largo.")
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null));

/**
 * Un paso de preparación. El tope de 500 caracteres es por paso, no por receta:
 * un paso que no cabe en una línea y media es en realidad dos pasos, y quien
 * cocina con el móvil en la mano no lee un párrafo.
 */
const stepSchema = z
  .string()
  .trim()
  .min(1)
  .max(500, "Un paso no puede ser tan largo: pártelo en dos.");

/** Un ingrediente del formulario de receta. */
export const recipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(MAX_RECIPE_INGREDIENT_NAME),
  /**
   * Cantidad, o null si no se sabe. El `.catch(null)` es la política del campo
   * desde siempre —lo que no se entiende (un negativo, un no-finito) se guarda
   * como «no lo sé» en vez de tumbar el guardado—, y el tope entra dentro de
   * ella a propósito: sin él, un número más largo que la columna no caía en
   * este `catch`, llegaba hasta el INSERT y reventaba allí. Quien avisa de que
   * el número no cabe es el `max` del input, antes de enviar.
   */
  quantity: z
    .number()
    .finite()
    .min(0)
    .max(MAX_INGREDIENT_QUANTITY)
    .nullable()
    .catch(null),
  unit: unit.nullable(),
  optional: z.boolean(),
  /**
   * Vínculo explícito al producto del catálogo (F3), elegido en el
   * autocompletado. Tiene prioridad sobre el matching por nombre; se valida
   * server-side que pertenece al hogar. `null` = texto libre / se resolverá por
   * nombre normalizado.
   */
  productId: z.string().nullable().catch(null),
});

/**
 * Entrada de crear/editar receta. La UI envía un objeto ya estructurado (no
 * FormData) por la lista dinámica de ingredientes. Las filas de ingrediente sin
 * nombre se descartan antes de validar.
 */
export const recipeInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe el nombre de la receta.")
    .max(160, "Nombre demasiado largo."),
  description: nullableText(1000),
  servings: z
    .number()
    .int("Las raciones deben ser un número entero.")
    .min(1, "Al menos 1 ración.")
    .max(99, "Demasiadas raciones.")
    .catch(2),
  prepMinutes: z
    .number()
    .int()
    .min(0)
    .max(999)
    .nullable()
    .catch(null),
  mealTypes: z
    .array(mealType)
    .min(1, "Marca si es para comida, cena o ambas.")
    .max(2),
  seasons: z
    .array(season)
    .min(1, "Elige una temporada.")
    .max(3),
  /**
   * Pasos en orden. Las filas vacías se descartan antes de validar (igual que
   * los ingredientes sin nombre), así que un array vacío es una receta sin
   * pasos y es legítima: se puede guardar la lista de la compra de un plato sin
   * haber escrito todavía cómo se hace.
   *
   * Quien cuenta los pasos es esto, NO la base: la columna `steps` renuncia a
   * un tope de filas para que la conversión del histórico no pudiera tumbar la
   * migración (ver 20260805120000_recetas_pasos.sql).
   */
  steps: z
    .array(stepSchema)
    .max(MAX_RECIPE_STEPS, "Demasiados pasos para una receta."),
  ingredients: z.array(recipeIngredientSchema).max(MAX_RECIPE_INGREDIENTS),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;

/**
 * Huecos que entiende el prompt de la receta. Incluye `breakfast`, que el
 * formulario no ofrece: una receta efímera nace con el hueco en el que la
 * planificó el generador de menús, y ahí sí hay desayunos.
 */
const promptMealType = z.enum(["breakfast", "lunch", "dinner"]);

/**
 * Lo que se le manda al modelo para que escriba cómo se cocina un plato. No es
 * `recipeInputSchema` recortado: aquí los pasos no entran porque son justo lo
 * que se pide, y el nombre es obligatorio de verdad —es lo ÚNICO con lo que el
 * modelo puede trabajar—, mientras que en el formulario se valida al guardar.
 */
export const recipeDetailsRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe primero el nombre del plato.")
    .max(160, "Nombre demasiado largo."),
  description: nullableText(1000),
  servings: z.number().int().min(1).max(99).catch(2),
  mealTypes: z.array(promptMealType).max(3),
  /** Lo que ya hay escrito: se conserva, no se pisa (ver `ai-draft.ts`). */
  ingredients: z.array(recipeIngredientSchema).max(MAX_RECIPE_INGREDIENTS),
});

export type RecipeDetailsRequest = z.infer<typeof recipeDetailsRequestSchema>;

/** Valoración de gusto de un miembro (1–5 estrellas). */
export const ratingSchema = z
  .number()
  .int("La valoración debe ser un número entero.")
  .min(1, "La valoración mínima es 1 estrella.")
  .max(5, "La valoración máxima es 5 estrellas.");
