import { z } from "zod";

/**
 * Contrato de «cómo se cocina esto»: las cantidades de cada ingrediente y los
 * pasos, para las raciones que se pidan en el prompt.
 *
 * Ningún array lleva `.min()`, y es la lección que dejó `menu-schema.ts`: un
 * mínimo de zod no rechaza el array, rechaza la RESPUESTA ENTERA. Una receta
 * con doce pasos buenos y la lista de ingredientes vacía se perdería completa y
 * el usuario vería un error genérico sobre una llamada que sí trajo algo. Si lo
 * que llega es aprovechable lo decide la action, que es quien puede contestar
 * algo útil («no supe escribir los pasos de esto») y quien sabe qué había ya
 * escrito en la receta.
 */
export const recipeDetailsSchema = z.object({
  prep_minutes: z
    .number()
    .nullable()
    .describe(
      "Minutos totales, contando cocción y reposo. null si no lo tienes claro.",
    ),
  ingredients: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            "Nombre del ingrediente en español, tal como se compra " +
              "(«Cebolla», «Arroz redondo»). Sin la cantidad dentro del nombre " +
              "y sin marcas.",
          ),
        quantity: z
          .number()
          .nullable()
          .describe(
            "Cantidad para el número de raciones que pide el prompt. null si " +
              "es «al gusto» (sal, pimienta, aceite para engrasar).",
          ),
        unit: z
          .enum(["ud", "g", "kg", "ml", "l"])
          .nullable()
          .describe(
            "Unidad de esa cantidad: ud (unidades), g, kg, ml o l. null si la " +
              "cantidad es null.",
          ),
      }),
    )
    .describe(
      "TODOS los ingredientes del plato, incluidos los que el prompt ya da " +
        "por escritos.",
    ),
  steps: z
    .array(z.string())
    .describe(
      "Los pasos en orden, cada uno una frase o dos. SIN numerarlos y sin " +
        "escribir «Paso 1»: la app los numera al pintarlos.",
    ),
});

export type RecipeDetails = z.infer<typeof recipeDetailsSchema>;
