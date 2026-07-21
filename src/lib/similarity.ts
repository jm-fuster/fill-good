/**
 * Similitud de cadenas por trigramas (aproxima a `pg_trgm.similarity`), en TS.
 *
 * Se usa para el matching difuso sin IA del proyecto (restricción: cero gasto en
 * IA): faltantes del menú (D3), guardarraíl antiduplicados al crear producto
 * desde un ticket (E2) y candidatos del escaneo (E6). El catálogo por hogar es
 * pequeño, así que recorrerlo en memoria es barato y evita un RPC/migración.
 */

/** Umbral de similitud de trigramas para considerar un match fuzzy válido. */
export const DEFAULT_FUZZY_THRESHOLD = 0.4;

/** Longitud mínima del nombre normalizado para intentar match fuzzy. */
export const MIN_FUZZY_LENGTH = 3;

/** Trigramas de una cadena, con un espacio de relleno a cada lado (como pg_trgm). */
function trigrams(value: string): Set<string> {
  const padded = ` ${value} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}

/**
 * Similitud de trigramas entre dos cadenas normalizadas: índice de Jaccard sobre
 * sus conjuntos de trigramas (0 = nada en común, 1 = idénticas). Aproxima a
 * `pg_trgm.similarity` lo suficiente para el catálogo de un hogar.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}
