import { getExpiryStatus } from "@/lib/dates";

/**
 * Estado accionable de un ítem de inventario. Fuente ÚNICA de verdad compartida
 * por la tarjeta (badges, con la cantidad en vivo del stepper), la página
 * (orden por urgencia) y los chips de filtro (E4) — para no duplicar la lógica.
 */
export type InventoryStatusFlags = {
  /** Caducado (fecha pasada) Y con existencias: sin nada, no caduca nada. */
  expired: boolean;
  /** Caduca pronto o "consumir pronto", también solo con existencias. */
  soon: boolean;
  /** Agotado (sin existencias). */
  out: boolean;
  /** Quedan pocas (≤ mínimo, pero aún hay stock). */
  low: boolean;
};

/** Clave de los chips de filtro por estado. */
export type StatusFilter = "soon" | "expired" | "out" | "low";

export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "soon", label: "Caducan pronto" },
  { key: "expired", label: "Caducados" },
  { key: "out", label: "Agotados" },
  { key: "low", label: "Quedan pocas" },
];

/**
 * Type-guard para validar el parámetro `?estado=` de la URL. Vive aquí (módulo
 * neutro, no cliente) para poder invocarse tanto desde el Server Component de la
 * página como desde el listado en cliente sin cruzar la frontera "use client".
 */
export function isStatusFilter(v: string | null): v is StatusFilter {
  return v !== null && STATUS_FILTERS.some((f) => f.key === v);
}

export function getInventoryStatus(fields: {
  quantity: number;
  expiryDate: string | null;
  useSoon: boolean;
  minQuantity: number | null;
}): InventoryStatusFlags {
  // Sin existencias no hay caducidad que valga. La fecha y el "consumir pronto"
  // hablan de comida que está en casa —lo que se va a echar a perder, lo que
  // conviene gastar antes—, y de lo que se ha agotado no queda nada ni que tirar
  // ni que cocinar: el único estado accionable es "agotado", y se arregla
  // comprando, no corriendo a consumirlo. Decir las dos cosas a la vez sale caro
  // en los dos sentidos: la tarjeta manda a tirar algo que ya no existe, y la
  // fila engorda los recuentos de "Caducados" y "Caducan pronto" de los chips,
  // que es justo donde se mira para saber cuánto trabajo urgente hay.
  //
  // La regla ya vivía en el resto de superficies —el push diario de caducidades,
  // los informes de Alexa y las sugerencias de la lista filtran todos por
  // cantidad > 0—; faltaba aquí, que es donde se ve. No quites la comprobación
  // por redundante con `out`: son cuatro flags independientes y quien lee
  // `expired` (los chips, el orden, la cabecera de la ubicación) no mira `out`.
  const hasStock = fields.quantity > 0;
  const expiry = hasStock ? getExpiryStatus(fields.expiryDate) : null;
  return {
    expired: expiry?.status === "expired",
    soon: expiry?.status === "soon" || (hasStock && fields.useSoon),
    out: !hasStock,
    low:
      fields.minQuantity !== null &&
      fields.quantity <= fields.minQuantity &&
      hasStock,
  };
}

/**
 * Rango de urgencia dentro de una ubicación (0 = más urgente): caducado →
 * caduca pronto/consumir pronto → resto → agotado (accionable pero no urge).
 */
export function urgencyRank(flags: InventoryStatusFlags): number {
  if (flags.out) return 3;
  if (flags.expired) return 0;
  if (flags.soon) return 1;
  return 2;
}
