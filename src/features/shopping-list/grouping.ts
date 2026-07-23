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
 * Agrupa ítems por categoría (L10): grupos ordenados por `sort_order` (los sin
 * categoría al final en "Otros"); dentro del grupo se respeta el orden ya
 * recibido (position). Los altas optimistas sin categoría caen en "Otros" hasta
 * que reconcilian.
 */
export function groupByCategory(items: ListItem[]): ItemGroup[] {
  const byCat = new Map<string, ItemGroup>();
  for (const it of items) {
    const name = it.categoryName ?? "Otros";
    let g = byCat.get(name);
    if (!g) {
      g = {
        name,
        icon: it.categoryIcon ?? null,
        sort: it.categorySort ?? NO_CATEGORY_SORT,
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
