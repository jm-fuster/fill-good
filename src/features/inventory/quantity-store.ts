/*
  Última cantidad que el SERVIDOR confirmó para cada fila del inventario,
  mientras dure la pestaña.

  Existe porque el stepper no revalida la página (sería un refetch del
  inventario entero por pulsación), así que los props de /inventario se quedan
  con las cantidades del momento de la carga. Mientras la tarjeta sigue montada
  da igual —su estado manda—, pero se remonta más de lo que parece: el chip de
  estado cambia la `key` del bloque, plegar una ubicación la desmonta, el
  buscador saca y vuelve a meter tarjetas, y volver a la página sirve el payload
  cacheado del router. Cada vez, la tarjeta nueva nacía con el número viejo y lo
  enseñaba como si fuera el de ahora.

  Se compara por `updated_at` y no se da por buena sin más: si la página trae
  props más nuevos (una navegación que sí fue al servidor, o el cambio de otra
  persona), mandan ellos. Vive en memoria y no en `localStorage` a propósito:
  es una caché de lo que ya se ve, no un dato que deba sobrevivir a la pestaña.
*/

type Confirmed = { quantity: number; updatedAt: string };

const confirmed = new Map<string, Confirmed>();

/** Apunta la cantidad que devolvió el servidor tras escribir. */
export function rememberQuantity(
  id: string,
  quantity: number,
  updatedAt: string,
): void {
  confirmed.set(id, { quantity, updatedAt });
}

/**
 * La cantidad más reciente conocida de una fila: la de los props o la última
 * confirmada por el stepper, la que tenga el `updated_at` posterior.
 */
export function latestQuantity(entry: {
  id: string;
  quantity: number;
  updatedAt: string;
}): number {
  const mine = confirmed.get(entry.id);
  if (!mine) return entry.quantity;
  return Date.parse(mine.updatedAt) > Date.parse(entry.updatedAt)
    ? mine.quantity
    : entry.quantity;
}
