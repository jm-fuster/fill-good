/**
 * Etiquetas legibles de las cadenas de supermercado. Vive en un módulo neutro
 * (ni "use client" ni "server-only") para poder usarse tanto en el gráfico de
 * precios (cliente) como en la página de detalle (Server Component) sin cruzar
 * la frontera "use client".
 */
export const CHAIN_LABELS: Record<string, string> = {
  mercadona: "Mercadona",
  carrefour: "Carrefour",
  lidl: "Lidl",
  dia: "Día",
  alcampo: "Alcampo",
  eroski: "Eroski",
  consum: "Consum",
  aldi: "Aldi",
  otro: "Otros",
};

/**
 * Cadenas ofrecibles como preferencia de compra por producto (L15), en orden.
 * Excluye "otro": como preferencia ("cómpralo siempre en…") no tiene sentido.
 */
export const CHAIN_OPTIONS: { value: string; label: string }[] = [
  "mercadona",
  "carrefour",
  "lidl",
  "dia",
  "alcampo",
  "eroski",
  "consum",
  "aldi",
].map((value) => ({ value, label: CHAIN_LABELS[value] }));

/** Etiqueta legible de una cadena; cae en la propia clave si no es conocida. */
export function chainLabel(chain: string): string {
  return CHAIN_LABELS[chain] ?? chain;
}

/** Ranking de las cadenas conocidas (las desconocidas van al final). */
const CHAIN_RANK = new Map(CHAIN_OPTIONS.map((c, i) => [c.value, i]));

/**
 * Ordena claves de cadena por el orden canónico de este módulo; las
 * desconocidas, al final y alfabéticas. Un orden estable y compartido evita que
 * la misma lista de tiendas salga en un orden distinto en cada pantalla (chips
 * del modo compra, tiendas del hogar, selector de tienda preferida).
 */
export function orderChains(chains: string[]): string[] {
  return [...chains].sort(
    (a, b) =>
      (CHAIN_RANK.get(a) ?? Infinity) - (CHAIN_RANK.get(b) ?? Infinity) ||
      chainLabel(a).localeCompare(chainLabel(b), "es"),
  );
}
