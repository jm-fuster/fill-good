/**
 * Del texto IMPRESO de una línea de ticket al RÓTULO del producto.
 *
 * La línea de un ticket no dice solo qué compraste: dice también cuánto y por
 * cuánto ("PLATANO CANARIO 0,990 kg x 2,29 €/kg C 2,27 €"). Ese texto crudo es
 * lo que se aprendía como nombre del producto, y ahí estaba el fallo: el peso y
 * el importe cambian en CADA compra, así que el nombre aprendido no volvía a
 * coincidir nunca —la vía rápida del matching (`matchLineExact`) quedaba muerta—
 * y además dos compras del mismo artículo parecían dos rótulos distintos del
 * mismo producto en la misma cadena, que es justo lo que `findRenameCandidate`
 * interpreta como «cambiaron la etiqueta, ¿borro el nombre viejo?».
 *
 * Aquí se recorta lo que varía y se conserva lo que identifica:
 *
 *   "PLATANO CANARIO 0,990 kg x 2,29 €/kg C 2,27 €"  →  "PLATANO CANARIO"
 *   "AGUACATE\n0,850 kg x 5,99 €/kg C 5,09 €"        →  "AGUACATE"
 *   "0,755 kg x 2,39 €/kg 1,80 €\nTOMATE ENSALADA"   →  "TOMATE ENSALADA"
 *   "2 LECHE ENTERA 1,60"                            →  "LECHE ENTERA"
 *   "CARBASSÓ GRANEL 0,52\n 0,452kg x 1,15 €/kg"     →  "CARBASSÓ GRANEL"
 *
 * Lo que se conserva a propósito: el formato que forma parte del NOMBRE
 * comercial ("ESPIRALES ALIPENDE 500G", "COGOLLO 3U", "CALABAZA PIEZA 1K",
 * "ARROZ REDONDO BRILLANTE P2"). Un gramaje impreso en la etiqueta distingue
 * productos de verdad; un peso pesado en la báscula, no. La regla que los separa
 * es que el segundo viene siempre acompañado de su precio (`x 2,29 €/kg`, o un
 * importe al final de la línea) y el primero no.
 *
 * NO intenta arreglar el OCR ("MELOKOTON", "GURGONSOLA", "ACIPENDE"): de eso se
 * encarga el fuzzy de la revisión, que sí sugiere y nunca decide solo.
 *
 * Fijado por `npm run check:rotulos` con líneas reales de tickets (Mercadona,
 * Alipende y tickets en catalán, que imprimen el importe ANTES del peso).
 */

import { normalizeName } from "@/lib/normalize";

/**
 * Bloque «cantidad + unidad × precio unitario», hasta el fin de la línea: todo lo
 * que va detrás son importes. Cubre las tres formas vistas en tickets reales:
 * `0,990 kg x 2,29 €/kg C 2,27 €`, `2 Un x 2,35 €/Un A 4,70 €` y el OCR sin `x`
 * ni símbolo del euro `0,486 kg 1,95 E/kg 0,95`.
 *
 * Exige el `€/` (o `E/`) justo después del número para no comerse un gramaje del
 * nombre: en "ESPIRALES ALIPENDE 500G C/V A 0,90 €" detrás de `500G` no hay
 * número+`€/`, así que `500G` se queda.
 */
const MEASURE_PRICE =
  /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:kgs|kg|grs|gr|g|ml|cl|lt|l|uds|ud|un|u)\b\.?\s*(?:x|×)?\s*\d+(?:[.,]\d+)?\s*(?:€|e)\s*\/.*$/i;

/** Multiplicador con el precio entre paréntesis: `2 x ( 11,99 ) 23,98`. */
const COUNT_PRICE_PARENS = /(?:^|\s)\d+\s*(?:x|×)\s*\(\s*[\d.,]+\s*\).*$/;

/**
 * Importe al final de la línea, con la letra del IVA delante si la trae
 * (`A 3,36€`, `C 13,74`, `B 0,15 €`, `2,00 €`, `1,15`).
 *
 * Exige DOS decimales: así "MELON MATISSE PIEZA 1,2K", "DETERGENTE ARIEL 25+5L"
 * o "SERVILLETA ECO MY TISSUE 50" no pierden nada. La letra suelta se recorta
 * porque es la columna de IVA del ticket, no parte del nombre: sin eso,
 * "REFRESCO ZEROZERO COLA COCA B 9,90" y "REFRESCO ZEROZERO COLA COCA 9,96 €"
 * seguirían siendo dos rótulos distintos del mismo refresco.
 */
const TRAILING_PRICE = /\s+(?:[A-ZÀ-ÜÑ]\s+)?\d{1,4}[.,]\d{2}\s*€?\s*$/;

/**
 * Cantidad al principio, estilo Mercadona ("2 LECHE ENTERA", "4 YOGUR NATURAL").
 * Es la misma lectura que hace la extracción —«si la línea empieza por un número
 * es la cantidad» (`receipt-prompt.ts`)—, y esa cantidad ya vive en su columna.
 */
const LEADING_COUNT = /^\d+\s+(?=[^\d\s])/;

/** Por debajo de esto no queda rótulo, sino ruido: mejor devolver el original. */
const MIN_LABEL_LENGTH = 2;

/**
 * El rótulo legible de una línea impresa: sin pesos, sin importes y sin la
 * cantidad. Idempotente (aplicarlo dos veces da lo mismo) y nunca vacío: si el
 * recorte se lo comiera todo, devuelve el texto original con los espacios
 * normalizados, que es exactamente el comportamiento de antes.
 */
export function cleanReceiptLabel(printed: string): string {
  const kept: string[] = [];
  // Línea a línea: el ticket parte el nombre y el peso en dos renglones, y en
  // los tickets en catalán el orden se invierte (importe arriba, peso abajo).
  // Trabajando por renglón, el orden deja de importar.
  for (const line of printed.split(/[\r\n]+/)) {
    let s = line.replace(MEASURE_PRICE, "").replace(COUNT_PRICE_PARENS, "");
    // El importe puede aparecer dos veces (columna de IVA y total). Tope de tres
    // pasadas: recortar es idempotente, pero un `while` a ciegas sobre una
    // expresión regular es una invitación a colgarse.
    for (let i = 0; i < 3; i += 1) {
      const shorter = s.replace(TRAILING_PRICE, "");
      if (shorter === s) break;
      s = shorter;
    }
    s = s
      .replace(LEADING_COUNT, "")
      // Un símbolo de euro huérfano no es nombre de nada.
      .replace(/\s*€\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length > 0) kept.push(s);
  }
  const label = kept.join(" ").replace(/\s+/g, " ").trim();
  return label.length >= MIN_LABEL_LENGTH
    ? label
    : printed.replace(/\s+/g, " ").trim();
}

/**
 * Clave de un nombre aprendido (`product_aliases.alias_normalized`) a partir del
 * texto impreso. ES LA ÚNICA forma de calcularla: la escritura del alias, el
 * match exacto, el fuzzy y la detección de renombrados tienen que coincidir
 * carácter a carácter, o el alias que se guarda no es el que se busca.
 */
export function aliasKeyFor(printed: string): string {
  return normalizeName(cleanReceiptLabel(printed));
}
