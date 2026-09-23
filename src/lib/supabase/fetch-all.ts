import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Filas por página. Es el `max_rows` de PostgREST —1000 en
 * `supabase/config.toml` y en el proyecto alojado—, y tiene que serlo: si el
 * servidor cortara antes que esto, una página corta se tomaría por la última.
 */
export const PAGE_ROWS = 1000;

/** Tope de seguridad: 200 páginas son 200.000 filas de una sola lectura. */
const MAX_PAGES = 200;

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/**
 * Lee TODAS las filas de una consulta, de mil en mil.
 *
 * Existe porque PostgREST corta cualquier respuesta a `max_rows` (1000) sin
 * avisar: devuelve las primeras mil con `error: null` y ningún indicio de que
 * falten más. Las lecturas del historial de compras ordenan por fecha
 * ascendente —el último precio es el que queda al recorrerlas—, así que lo que
 * se perdía era justo lo MÁS RECIENTE: a partir de unas mil líneas de ticket
 * (unos cincuenta tickets) el «último precio» se congelaba, las alertas miraban
 * compras viejas, /lista proponía reponer lo comprado ayer y «Exportar mis
 * datos» salía incompleto diciendo que había terminado. Le habría pasado antes
 * que a nadie al hogar que más usa la app.
 *
 * `page(from, to)` construye la consulta completa y le añade `.range(from, to)`.
 * Tiene que llevar un ORDEN TOTAL (termina en una columna única, `id`): con
 * empates, Postgres no garantiza el mismo orden entre dos peticiones y una
 * fila podría saltarse o repetirse al cambiar de página.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const from = i * PAGE_ROWS;
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) return { data: rows, error };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_ROWS) return { data: rows, error: null };
  }
  console.warn(
    `fetchAllRows: se alcanzó el tope de ${MAX_PAGES * PAGE_ROWS} filas; la lectura va recortada.`,
  );
  return { data: rows, error: null };
}
