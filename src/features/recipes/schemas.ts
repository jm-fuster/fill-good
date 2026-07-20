import { z } from "zod";

const unit = z.enum(["ud", "g", "kg", "ml", "l"]);
const mealType = z.enum(["lunch", "dinner"]);
const season = z.enum(["all", "winter", "summer"]);

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Texto demasiado largo.")
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null));

/** Un ingrediente del formulario de receta. */
export const recipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z
    .number()
    .finite()
    .min(0)
    .nullable()
    .catch(null),
  unit: unit.nullable(),
  optional: z.boolean(),
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
  instructions: nullableText(4000),
  ingredients: z.array(recipeIngredientSchema).max(50),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;

/** Valoración de gusto de un miembro (1–5 estrellas). */
export const ratingSchema = z
  .number()
  .int("La valoración debe ser un número entero.")
  .min(1, "La valoración mínima es 1 estrella.")
  .max(5, "La valoración máxima es 5 estrellas.");
