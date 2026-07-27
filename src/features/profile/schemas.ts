import { z } from "zod";

export const updateDisplayNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe cómo quieres que te vean.")
    .max(80, "El nombre es demasiado largo."),
});
