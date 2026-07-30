import { aisleSort } from "@/features/categories/aisle-order";
import type { ListItem } from "./queries";

/** Orden de la categoría "Otros" / ítems sin categoría (van al final). */
export const NO_CATEGORY_SORT = 9_000;

export type ItemGroup = {
  name: string;
  icon: string | null;
  sort: number;
  items: ListItem[];
};

/**
 * Agrupa ítems por categoría (L10): grupos ordenados por pasillo (los sin
 * categoría al final en "Otros"); dentro del grupo se respeta el orden ya
 * recibido (position). Los altas optimistas sin categoría caen en "Otros" hasta
 * que reconcilian.
 *
 * @param chainOrder Orden de pasillos propio de la tienda elegida, si tiene uno
 *   (`aisleOrders[chain]`). Sin él manda el orden general del hogar. Existe
 *   porque `/lista` agrupada usaba SIEMPRE el general: podías guardar el orden de
 *   Lidl, verlo aplicado en el modo compra, y que la lista de casa te siguiera
 *   enseñando otro. Es el mismo `aisleSort` que usa el modo compra, así que las
 *   dos pantallas no pueden ordenar distinto con la misma tienda elegida.
 */
export function groupByCategory(
  items: ListItem[],
  chainOrder?: Record<string, number>,
): ItemGroup[] {
  const byCat = new Map<string, ItemGroup>();
  for (const it of items) {
    const name = it.categoryName ?? "Otros";
    let g = byCat.get(name);
    if (!g) {
      g = {
        name,
        icon: it.categoryIcon ?? null,
        sort: aisleSort(
          it.categorySort ?? NO_CATEGORY_SORT,
          it.categoryId ?? null,
          chainOrder,
        ),
        items: [],
      };
      byCat.set(name, g);
    }
    g.items.push(it);
  }
  return [...byCat.values()].sort(
    (a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "es"),
  );
}
