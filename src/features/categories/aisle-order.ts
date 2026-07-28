import type { StoreCategory } from "./queries";

/**
 * Órdenes de pasillo propios de cada tienda: `{ lidl: { categoryId: posición } }`.
 * Solo lleva EXCEPCIONES al orden general del hogar (`categories.sort_order`);
 * una tienda sin entrada usa el general tal cual.
 *
 * Vive en un módulo neutro (ni "use client" ni "server-only") porque lo resuelve
 * el cliente: en el modo compra, cambiar de tienda reordena la lista al instante
 * y sin pedir nada al servidor, que es lo que hace falta en un supermercado con
 * mala cobertura. El mapa completo del hogar son unas pocas decenas de números.
 */
export type ChainAisleOrders = Record<string, Record<string, number>>;

/**
 * Desplazamiento de los pasillos que una tienda NO ha colocado. Las posiciones
 * propias son densas (0..n-1) y las generales también, así que sin separarlas un
 * pasillo nuevo caería en medio de las colocadas por pura coincidencia numérica.
 * Sumando esto van todos DETRÁS, entre ellos en su orden general, que es una
 * regla que se puede explicar en una frase.
 *
 * Por debajo del 9.000 que usan los ítems sin categoría (grouping.ts): "Otros"
 * tiene que seguir siendo el último grupo.
 */
const UNPLACED_OFFSET = 1_000;

/** ¿Esta tienda tiene un orden propio, o va con el general? */
export function hasOwnAisleOrder(
  orders: ChainAisleOrders,
  chain: string | null,
): boolean {
  if (!chain) return false;
  const own = orders[chain];
  return own !== undefined && Object.keys(own).length > 0;
}

/**
 * Orden efectivo de un pasillo en una tienda: su posición propia si la tiene, y
 * si no, la general desplazada al final. `categoryId` null (ítem sin categoría)
 * devuelve `baseSort` sin tocar, que ya es el sentinel de "al final".
 */
export function aisleSort(
  baseSort: number,
  categoryId: string | null,
  chainOrder: Record<string, number> | undefined,
): number {
  if (!chainOrder || !categoryId) return baseSort;
  const own = chainOrder[categoryId];
  return own ?? UNPLACED_OFFSET + baseSort;
}

/**
 * Categorías del hogar en el orden de una tienda, para el editor. Sin orden
 * propio devuelve el general, así que el orden de una tienda nueva NACE copiando
 * el general y solo hay que corregir los dos o tres pasillos que cambian.
 */
export function categoriesInChainOrder(
  categories: StoreCategory[],
  chainOrder: Record<string, number> | undefined,
): StoreCategory[] {
  if (!chainOrder) return categories;
  return [...categories].sort(
    (a, b) =>
      aisleSort(a.sortOrder, a.id, chainOrder) -
        aisleSort(b.sortOrder, b.id, chainOrder) ||
      a.name.localeCompare(b.name, "es"),
  );
}
