import { z } from "zod";

/** Un único plato generado por IA (contrato del re-roll "otra idea", N2). */
export const singleDishSchema = z.object({
  recipe_name: z.string().describe("Nombre del plato en español."),
  saved_recipe_id: z
    .string()
    .nullable()
    .describe(
      "Si el plato es una receta del recetario del hogar, copia aquí su id " +
        "EXACTO (el que aparece en la lista). Si es un plato nuevo, deja null.",
    ),
  description: z
    .string()
    .nullable()
    .describe("Descripción breve o pasos resumidos."),
  ingredients: z.array(
    z.object({
      name: z.string().describe("Ingrediente en español."),
      quantity: z.number().nullable(),
      unit: z.enum(["ud", "g", "kg", "ml", "l"]).nullable(),
    }),
  ),
});

export type SingleDishGeneration = z.infer<typeof singleDishSchema>;

/** Contrato del menú semanal generado por IA (comida + cena, 7 días). */
export const menuSchema = z.object({
  days: z
    .array(
      z.object({
        day_index: z
          .number()
          .describe("0 = lunes, 1 = martes, … 6 = domingo."),
        meals: z.array(
          z.object({
            slot: z
              .enum(["lunch", "dinner"])
              .describe("lunch = comida, dinner = cena."),
            dishes: z
              .array(
                z.object({
                  recipe_name: z
                    .string()
                    .describe("Nombre del plato en español."),
                  saved_recipe_id: z
                    .string()
                    .nullable()
                    .describe(
                      "Si el plato es una receta del recetario del hogar, " +
                        "copia aquí su id EXACTO (el que aparece en la lista). " +
                        "Si es un plato nuevo inventado, deja null.",
                    ),
                  description: z
                    .string()
                    .nullable()
                    .describe("Descripción breve o pasos resumidos."),
                  ingredients: z.array(
                    z.object({
                      name: z.string().describe("Ingrediente en español."),
                      quantity: z.number().nullable(),
                      unit: z.enum(["ud", "g", "kg", "ml", "l"]).nullable(),
                    }),
                  ),
                }),
              )
              .min(1)
              .max(2)
              .describe(
                "1 o 2 platos del hueco. La comida (lunch) puede llevar 2 " +
                  "(p. ej. primero ligero + segundo) cuando tenga sentido; la " +
                  "cena (dinner) normalmente 1.",
              ),
          }),
        ),
      }),
    )
    .describe("Exactamente 7 días (day_index 0 a 6), cada uno con comida y cena."),
});

export type MenuGeneration = z.infer<typeof menuSchema>;
