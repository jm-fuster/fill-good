const BASE_PROMPT = `Eres un asistente que extrae los datos de un ticket de compra de supermercado español (o de una factura de compra online). Te doy una imagen o un PDF del ticket.

Devuelve los datos siguiendo el esquema. Reglas importantes:

- Idioma español. Los decimales en los tickets usan coma (2,35) pero tú devuelves números con punto (2.35).
- store_name: el nombre del establecimiento. store_chain: normaliza a la cadena conocida (mercadona, carrefour, lidl, dia, alcampo, eroski, consum, aldi) o "otro".
- purchase_date: la fecha de la compra en formato YYYY-MM-DD.
- total: el importe TOTAL a pagar del ticket.

Líneas de producto (items):
- description: nombre limpio y legible en español. Expande abreviaturas comunes (HACEND.→Hacendado, C/→con, S/→sin, PZA→pieza, ACEIT→aceite, etc.).
- quantity y unit: si la línea empieza por un número es la cantidad (p. ej. "2 LECHE ENTERA" → quantity 2, unit ud).
- Productos al peso (Mercadona y otros): aparecen como "0,486 kg  2,35 €/kg  1,14". Ahí quantity=0.486, unit=kg, is_weighted=true, price_per_kg=2.35, total_price=1.14.
- unit por defecto "ud" si no es al peso.
- total_price: importe de esa línea. unit_price: precio por unidad si consta.

Qué IGNORAR (no incluir como items):
- El desglose de IVA, subtotales, total, cambio, tarjeta, efectivo, puntos, CIF, dirección, teléfono.
- Bolsas solo si no son un producto real (si aparece "BOLSA 0,15" puedes incluirla, tú decides; en caso de duda inclúyela).

Descuentos:
- Si una línea es un descuento o promoción ("2ª unidad -70%", "DTO", importe negativo), márcala con is_discount=true. No la trates como producto.

Avisos (warnings):
- Si la suma de los total_price de los productos no cuadra con el total del ticket (diferencia > 0,05 €), añade un aviso.
- Si la imagen tiene mala calidad o hay líneas ilegibles, añade un aviso.

Sé preciso con los precios: son la base del historial de precios del hogar.`;

/**
 * Instrucciones + catálogo del hogar para que la IA sugiera, por línea, a qué
 * producto EXISTENTE corresponde (E7, coste cero: va en la misma llamada). Los
 * ids se validan SIEMPRE en el servidor (la IA alucina ids); nunca auto-asocia.
 */
function catalogSection(catalog: { id: string; name: string }[]): string {
  if (catalog.length === 0) return "";
  const list = catalog.map((p) => `- ${p.id} — ${p.name}`).join("\n");
  return `

Catálogo de productos que YA tiene este hogar (id — nombre). Para cada línea,
si corresponde CLARAMENTE a uno de estos productos, pon su id exacto en
suggested_product_id y la confianza en match_confidence ('high'/'low'). Si
ninguno encaja, deja suggested_product_id en null. NO inventes ids que no estén
en esta lista.

${list}`;
}

/**
 * Tiendas habituales del hogar (L15 f4) para afinar `store_chain`: el rótulo
 * impreso se abrevia, se corta o es el de una franquicia, y saber dónde compra
 * este hogar deshace muchas de esas dudas. Es una PISTA, nunca una regla: forzar
 * la cadena equivocada contamina el historial de precios, que es peor que "otro".
 *
 * Recibe las etiquetas ya resueltas (no importa `features/prices/chains`) para
 * que `lib/` no dependa de una feature.
 */
function chainsSection(chains: { key: string; label: string }[]): string {
  if (chains.length === 0) return "";
  const list = chains.map((c) => `${c.label} (clave: ${c.key})`).join(", ");
  return `

Este hogar suele comprar en: ${list}. Si el ticket es de una de ellas, usa su
clave en store_chain aunque el nombre impreso esté abreviado o cortado. Si es
claramente de otra cadena conocida, usa la suya; y si no reconoces la tienda,
"otro". No fuerces ninguna de las de esta lista.`;
}

/** Prompt de extracción con el catálogo y las tiendas del hogar (E7 + L15 f4). */
export function buildReceiptPrompt(
  catalog: { id: string; name: string }[] = [],
  chains: { key: string; label: string }[] = [],
): string {
  return `${BASE_PROMPT}${chainsSection(chains)}${catalogSection(catalog)}`;
}
