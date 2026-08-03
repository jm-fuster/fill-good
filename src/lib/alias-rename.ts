/**
 * Detección de rótulos renombrados dentro de UNA MISMA cadena.
 *
 * Que un producto tenga varios nombres de ticket es lo normal y lo deseable: el
 * mismo gazpacho se imprime distinto en cada supermercado, y `product_aliases`
 * existe para eso. Lo que ensucia el catálogo es que la MISMA cadena acumule dos
 * nombres del mismo artículo porque cambió su etiqueta ("GAZPACHO HACEND." →
 * "GAZPACHO HACENDADO 1L"): a partir de ahí el producto arrastra un nombre
 * muerto para siempre y nadie se enterará nunca.
 *
 * Aquí solo se PROPONE el candidato; quien decide es el usuario en la revisión
 * del ticket (misma regla que el resto del matching: el fuzzy nunca actúa solo).
 * Sin IA, por trigramas, como el resto del matching difuso del proyecto.
 */

import { aliasKeyFor } from "@/lib/receipt-label";
import { MIN_FUZZY_LENGTH, trigramSimilarity } from "@/lib/similarity";

/**
 * Un nombre de ticket ya aprendido, con la cadena donde se vio. Solo entran los
 * que tienen cadena conocida y no están descartados: sin cadena no se puede
 * afirmar "en este supermercado", que es toda la premisa del aviso.
 */
export type AliasSighting = {
  id: string;
  productId: string;
  /** Texto tal cual salió del ticket (lo que se le muestra al usuario). */
  alias: string;
  aliasNormalized: string;
  storeChain: string;
  /** Fecha de compra del último ticket que lo trajo (contexto para decidir). */
  lastSeenAt: string | null;
};

/**
 * Umbral de trigramas para proponer un renombrado. Igual que el guardarraíl
 * antiduplicados de la revisión (E2, 0,5) y por el mismo motivo: aquí preferimos
 * NO avisar a avisar mal, porque el aviso ofrece BORRAR un nombre aprendido.
 */
export const RENAME_TRIGRAM_THRESHOLD = 0.5;

/**
 * Nombre ya aprendido que probablemente sea el rótulo VIEJO de `rawName` en la
 * misma cadena, o null si no hay ninguno lo bastante parecido.
 *
 * Deliberadamente NO se usa contención de tokens (sí la usa el guardarraíl
 * antiduplicados): aquí un sufijo de más suele cambiar el producto de verdad
 * ("LECHE ENTERA" vs "LECHE ENTERA SIN LACTOSA"), y proponer borrar el nombre de
 * otro producto es peor que no avisar.
 *
 * Tampoco se exige que el nombre viejo esté "inactivo": dos nombres del mismo
 * artículo conviviendo en la misma cadena ya son un problema, se hayan visto
 * ayer o hace un año. La antigüedad se MUESTRA para que el usuario decida.
 */
export function findRenameCandidate(
  aliases: AliasSighting[],
  {
    productId,
    storeChain,
    rawName,
  }: { productId: string; storeChain: string | null; rawName: string },
): AliasSighting | null {
  if (!storeChain) return null;
  // Se compara RÓTULO contra RÓTULO: `rawName` es la línea impresa, con el peso
  // y el importe de esta compra dentro. Sin recortarlos, la misma etiqueta
  // comprada dos veces se parecía a sí misma un 0,8 y el aviso proponía borrar
  // el nombre bueno en casi todas las compras repetidas (ver `receipt-label.ts`).
  const norm = aliasKeyFor(rawName);
  if (norm.length < MIN_FUZZY_LENGTH) return null;

  let best: { alias: AliasSighting; score: number } | null = null;
  for (const a of aliases) {
    if (a.productId !== productId) continue;
    if (a.storeChain !== storeChain) continue;
    // El propio nombre de esta línea no es un renombrado de sí mismo.
    if (a.aliasNormalized === norm) continue;
    if (a.aliasNormalized.length < MIN_FUZZY_LENGTH) continue;
    const score = trigramSimilarity(norm, a.aliasNormalized);
    if (score < RENAME_TRIGRAM_THRESHOLD) continue;
    if (!best || score > best.score) best = { alias: a, score };
  }
  return best?.alias ?? null;
}
