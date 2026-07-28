import { z } from "zod";

/** Contrato de la extracción de tickets (salida estructurada del modelo). */
export const receiptItemSchema = z.object({
  raw_text: z
    .string()
    .describe("La línea tal cual aparece impresa en el ticket."),
  description: z
    .string()
    .describe(
      "Nombre limpio y legible del producto en español (sin abreviaturas ni códigos).",
    ),
  quantity: z.number().describe("Cantidad. Si no consta, 1."),
  unit: z
    .enum(["ud", "g", "kg", "ml", "l"])
    .describe("Unidad de la cantidad. 'ud' por defecto."),
  is_weighted: z
    .boolean()
    .describe("true si es un producto pesado (fruta, carne al peso...)."),
  total_price: z
    .number()
    .nullable()
    .describe("Importe total de la línea en euros."),
  unit_price: z.number().nullable().describe("Precio por unidad si consta."),
  price_per_kg: z
    .number()
    .nullable()
    .describe("Precio por kg si es un producto al peso."),
  is_discount: z
    .boolean()
    .describe("true si la línea es un descuento/promoción, no un producto."),
  suggested_product_id: z
    .string()
    .nullable()
    .describe(
      "Id EXACTO de un producto del catálogo proporcionado que corresponda a esta línea, o null si ninguno encaja. No inventes ids.",
    ),
  match_confidence: z
    .enum(["high", "low"])
    .nullable()
    .describe(
      "Confianza de suggested_product_id: 'high' si estás seguro, 'low' si es dudoso, null si no hay sugerencia.",
    ),
});

/** Las ocho cadenas que la app conoce de serie (claves de features/prices/chains). */
export const BUILT_IN_CHAIN_KEYS = [
  "mercadona",
  "carrefour",
  "lidl",
  "dia",
  "alcampo",
  "eroski",
  "consum",
  "aldi",
] as const;

/**
 * Contrato de la extracción del ticket. `store_chain` es un ENUM construido por
 * hogar: las ocho conocidas, las tiendas propias del hogar (L15 f5) y `otro`.
 * Que sea enum y no texto libre es lo que impide que el modelo se invente una
 * cadena nueva por cada variante del rótulo impreso ("MERCADONA S.A.",
 * "Mercadona Alfafar") y parta el historial de precios en pedazos.
 *
 * Al ser dinámico, el tipo inferido de `store_chain` es `string | null` en vez de
 * una unión de literales; el valor se guarda como texto, así que da igual.
 */
export function buildReceiptSchema(customChains: string[] = []) {
  const values = [
    ...BUILT_IN_CHAIN_KEYS,
    ...customChains,
    "otro",
  ] as unknown as [string, ...string[]];

  return z.object({
    store_name: z
      .string()
      .nullable()
      .describe("Nombre del establecimiento tal cual aparece."),
    store_chain: z
      .enum(values)
      .nullable()
      .describe(
        "Cadena de supermercado normalizada al valor EXACTO de la lista, o 'otro'.",
      ),
    purchase_date: z
      .string()
      .nullable()
      .describe("Fecha de compra en formato YYYY-MM-DD."),
    total: z.number().nullable().describe("Importe total del ticket en euros."),
    items: z.array(receiptItemSchema).describe("Líneas de producto del ticket."),
    warnings: z
      .array(z.string())
      .describe(
        "Avisos: p. ej. si la suma de líneas no cuadra con el total, o baja calidad de imagen.",
      ),
  });
}

export type ReceiptExtraction = z.infer<ReturnType<typeof buildReceiptSchema>>;
export type ReceiptItemExtraction = z.infer<typeof receiptItemSchema>;
