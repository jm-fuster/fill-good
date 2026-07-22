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

/** Como optionalNumber pero estrictamente > 0 (p. ej. unidades por pack, F4). */
const positiveOptionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v.replace(",", ".")) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0), {
    message: "Debe ser mayor que 0.",
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
  packSize: positiveOptionalNumber,
});

export const editInventorySchema = z.object({
  inventoryId: z.string().uuid(),
  productId: z.string().uuid(),
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
  useSoon: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  minQuantity: optionalNumber,
  packSize: positiveOptionalNumber,
  // Unidad de la fila editada; solo sirve para saber si el pack aplica (ud).
  unit: unit.optional(),
});

/** Selector inicial "¿Qué tienes ya en casa?": ids de producto a añadir en lote. */
export const starterItemsSchema = z.object({
  productIds: z
    .array(z.string().uuid())
    .min(1, "Marca al menos un producto.")
    .max(100, "Demasiados productos a la vez."),
});

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Revisión de caducidades tras la compra: cambios en lote (id → fecha/flag). */
export const expiryReviewSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        expiryDate: z
          .string()
          .trim()
          .nullable()
          .refine((v) => v === null || v === "" || isoDate.test(v), {
            message: "Fecha no válida.",
          })
          .transform((v) => (v && v.length > 0 ? v : null)),
        useSoon: z.boolean(),
      }),
    )
    .min(1, "No hay nada que guardar."),
});
