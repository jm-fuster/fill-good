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
        ifMissing: z.boolean().optional(),
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

/**
 * Instantánea que el cliente devuelve al deshacer un borrado. Da forma al
 * payload (el resto — que la lista y el producto sean del hogar activo, que la
 * atribución apunte a miembros reales — se re-valida en la acción contra la
 * base: la instantánea viajó por el cliente y pudo manipularse).
 */
export const restoreListItemSchema = z.object({
  id: z.string().uuid(),
  list_id: z.string().uuid(),
  household_id: z.string().uuid(),
  product_id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().finite().max(1_000_000).nullable(),
  unit: unit.nullable(),
  is_checked: z.boolean(),
  checked_by: z.string().max(64).nullable(),
  checked_at: z.string().datetime({ offset: true }).nullable(),
  added_by: z.string().max(64).nullable(),
  position: z.number().int().min(0).max(1_000_000),
  created_at: z.string().datetime({ offset: true }),
});

/**
 * Reordenación de la lista (L14): ids de las filas pendientes en su nuevo
 * orden. Mismo tope que las altas múltiples y por el mismo motivo — y porque
 * cada id es un UPDATE: sin tope, un payload fabricado eran miles de queries.
 */
export const reorderListItemsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(200, "Demasiados artículos de una vez.");
