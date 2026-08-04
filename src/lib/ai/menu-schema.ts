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
              .enum(["breakfast", "lunch", "dinner"])
              .describe("breakfast = desayuno, lunch = comida, dinner = cena."),
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
              // SIN mínimo, y es deliberado: un hueco vacío es una respuesta
              // legítima. La regla `skip_slot` («los miércoles no planifiques
              // cena») le pide al modelo exactamente eso, y contestaba
              // `"dishes": []` — con `.min(1)`, zod rechazaba la RESPUESTA
              // ENTERA y el hogar con esa regla no podía generar menú nunca
              // (medido con `npm run compare:menu`: 2 de 2 generaciones
              // fallidas con la regla puesta, 8 de 8 correctas sin ella; el
              // JSON llegaba completo, con siete días y catorce huecos, y lo
              // único inválido era ese array vacío).
              //
              // La proporción es lo que falla: un hueco que llega vacío se
              // pinta vacío con su «+» y no se pierde nada; una respuesta
              // rechazada es la semana entera a la basura y un error genérico.
              // Que la semana NO venga vacía del todo se comprueba en
              // `generateMenuAction`, que es donde se puede contestar algo útil.
              .max(2)
              .describe(
                "1 o 2 platos del hueco, o ninguno si es un hueco que el hogar " +
                  "no planifica. La comida (lunch) puede llevar 2 (p. ej. " +
                  "primero ligero + segundo) cuando tenga sentido; la cena " +
                  "(dinner) normalmente 1.",
              ),
          }),
        ),
      }),
    )
    .describe("Exactamente 7 días (day_index 0 a 6), cada uno con comida y cena."),
});
