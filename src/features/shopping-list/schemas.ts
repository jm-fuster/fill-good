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

/**
 * Alta múltiple desde el selector (L17). Un alta es un producto del catálogo (id)
 * o un nombre nuevo; la cantidad es opcional (la pone el servidor con el defecto
 * de la unidad) y aquí llega ya como número, no como texto de formulario.
 *
 * El tope de 100 no es decorativo: la petición de una Server Action va limitada a
 * 1 MB y el catálogo entero de una casa cabe de sobra por debajo de esa cifra.
 */
export const addListItemsSchema = z
  .array(
    z.union([
      z.object({
        kind: z.literal("product"),
        productId: z.string().uuid(),
        quantity: z.number().positive().finite().nullish(),
      }),
      z.object({
        kind: z.literal("free"),
        name: z.string().trim().min(1).max(120),
        quantity: z.number().positive().finite().nullish(),
        unit: unit.nullish(),
      }),
    ]),
  )
  .min(1, "No has marcado nada.")
  .max(100, "Demasiados productos de una vez.");

export type AddListItemsInput = z.infer<typeof addListItemsSchema>;

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
