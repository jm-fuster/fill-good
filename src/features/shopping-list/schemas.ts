import { z } from "zod";

const unit = z.enum(["ud", "g", "kg", "ml", "l"]);

/** Cantidad opcional para la lista: vacío → null, si hay valor debe ser > 0. */
const optionalQuantity = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v.replace(",", ".")) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
    message: "Cantidad no válida.",
  });

export const addListItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe qué necesitas.")
    .max(120, "Demasiado largo."),
  quantity: optionalQuantity,
  unit: unit.optional(),
});

export const updateListItemSchema = z.object({
  itemId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, "Escribe qué necesitas.")
    .max(120, "Demasiado largo."),
  quantity: optionalQuantity,
  unit: unit.optional(),
});
