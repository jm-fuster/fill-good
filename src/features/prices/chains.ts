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
