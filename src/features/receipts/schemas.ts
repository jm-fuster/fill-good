import { z } from "zod";

/** Unidades admitidas (coincide con el enum unit_type de la BD). */
const unit = z.enum(["ud", "g", "kg", "ml", "l"]);

/**
 * Una decisión por línea en la revisión del ticket (E6). Valida en servidor lo
 * que envía el cliente antes de tocar inventario/precios: la cantidad no puede
 * ser negativa/NaN/absurda (contaminaría stock e historial de precios) y la
 * descripción va acotada en longitud. `productId` NO se valida como uuid aquí a
 * propósito: la pertenencia al hogar se comprueba en la acción (un id ajeno u
 * obsoleto por merge/borrado se trata como producto nuevo).
 */
export const confirmItemDecisionSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string().trim().min(1).max(200),
  // finita, no negativa y con tope acorde a numeric(10,3) de la BD.
  quantity: z.number().finite().min(0).max(1_000_000),
  unit,
  productId: z.string().nullable().catch(null),
  skip: z.boolean(),
});

/** Payload completo de confirmReceiptAction. */
export const confirmPayloadSchema = z.object({
  receiptId: z.string().uuid(),
  storeName: z.string().trim().max(200).nullable(),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida.")
    .nullable(),
  total: z.number().finite().min(0).max(1_000_000).nullable(),
  items: z.array(confirmItemDecisionSchema).max(500),
});

export type ConfirmItemDecision = z.infer<typeof confirmItemDecisionSchema>;
export type ConfirmPayload = z.infer<typeof confirmPayloadSchema>;
