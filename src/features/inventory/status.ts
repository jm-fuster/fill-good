import { getExpiryStatus } from "@/lib/dates";

/**
 * Estado accionable de un ítem de inventario. Fuente ÚNICA de verdad compartida
 * por la tarjeta (badges, con la cantidad en vivo del stepper), la página
 * (orden por urgencia) y los chips de filtro (E4) — para no duplicar la lógica.
 */
export type InventoryStatusFlags = {
  /** Caducado (fecha pasada). */
  expired: boolean;
  /** Caduca pronto o marcado "consumir pronto". */
  soon: boolean;
  /** Agotado (cantidad 0). */
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

export function getInventoryStatus(fields: {
  quantity: number;
  expiryDate: string | null;
  useSoon: boolean;
  minQuantity: number | null;
}): InventoryStatusFlags {
  const expiry = getExpiryStatus(fields.expiryDate);
  return {
    expired: expiry?.status === "expired",
    soon: expiry?.status === "soon" || fields.useSoon,
    out: fields.quantity === 0,
    low:
      fields.minQuantity !== null &&
      fields.quantity <= fields.minQuantity &&
      fields.quantity > 0,
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
