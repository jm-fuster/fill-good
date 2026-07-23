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
