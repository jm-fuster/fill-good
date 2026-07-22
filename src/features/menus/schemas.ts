import { z } from "zod";

/**
 * Alta de una regla del menú. Unión discriminada por `kind`:
 *   · recipe_min_week / recipe_max_week → receta guardada + veces/semana (1–7).
 *   · free_text                         → texto libre.
 */
export const menuRuleInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("recipe_min_week"),
    recipeId: z.string().uuid("Elige una receta."),
    value: z
      .number()
      .int("Indica un número entero de veces.")
      .min(1, "Al menos 1 vez por semana.")
      .max(7, "Como mucho 7 veces por semana."),
  }),
  z.object({
    kind: z.literal("recipe_max_week"),
    recipeId: z.string().uuid("Elige una receta."),
    value: z
      .number()
      .int("Indica un número entero de veces.")
      .min(1, "Al menos 1 vez por semana.")
      .max(7, "Como mucho 7 veces por semana."),
  }),
  z.object({
    kind: z.literal("free_text"),
    textRule: z
      .string()
      .trim()
      .min(1, "Escribe la regla.")
      .max(300, "Regla demasiado larga."),
  }),
]);

export type MenuRuleInput = z.infer<typeof menuRuleInputSchema>;

/**
 * Perfil de menús del hogar (N3). Solo sesgo cualitativo: nada de números
 * nutricionales. `avoidText` es una preferencia, nunca gestión de alergias.
 */
export const menuPrefsInputSchema = z.object({
  goal: z.enum(["balanced", "light", "muscle", "gain"]),
  dietStyle: z.enum(["omnivore", "vegetarian", "vegan", "gluten_free"]),
  avoidText: z
    .string()
    .trim()
    .max(300, "Texto demasiado largo.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  servings: z
    .number()
    .int("Indica un número entero de raciones.")
    .min(1, "Al menos 1 ración.")
    .max(12, "Como mucho 12 raciones."),
  planBreakfast: z.boolean(),
});

export type MenuPrefsInput = z.input<typeof menuPrefsInputSchema>;
