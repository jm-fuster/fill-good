import { z } from "zod";

const unit = z.enum(["ud", "g", "kg", "ml", "l"]);
const location = z.enum(["pantry", "fridge", "freezer", "other"]);

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v.replace(",", ".")) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
    message: "Cantidad no válida.",
  });

export const addInventorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe el nombre del producto.")
    .max(120, "Nombre demasiado largo."),
  categoryId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  location,
  unit,
  quantity: z
    .string()
    .trim()
    .min(1, "Indica una cantidad.")
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "La cantidad debe ser mayor que 0.",
    }),
  expiryDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  minQuantity: optionalNumber,
});

export const editInventorySchema = z.object({
  inventoryId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => Number.isFinite(v) && v >= 0, {
      message: "Cantidad no válida.",
    }),
  expiryDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  minQuantity: optionalNumber,
});
