import { z } from "zod";

export const addListItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe qué necesitas.")
    .max(120, "Demasiado largo."),
  quantity: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v.replace(",", ".")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
      message: "Cantidad no válida.",
    }),
  unit: z.enum(["ud", "g", "kg", "ml", "l"]).optional(),
});
