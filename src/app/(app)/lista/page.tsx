import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ShoppingListView } from "@/features/shopping-list/components/shopping-list-view";
import {
  getActiveList,
  getHabitualProducts,
  getListItems,
  getProductCatalog,
  getSuggestions,
} from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Lista de la compra" };

export default async function ListaPage() {
  const list = await getActiveList();

  if (!list) {
    return (
      <>
        <PageHeader title="Lista de la compra" />
        <p className="text-sm text-muted-foreground">
          No se pudo cargar la lista. Recarga la página.
        </p>
      </>
    );
  }

  const [items, suggestions, habituales, catalog] = await Promise.all([
    getListItems(list.id),
    getSuggestions(list.id),
    getHabitualProducts(list.id),
    getProductCatalog(),
  ]);

  return (
    <>
      <PageHeader
        title="Lista de la compra"
        description="Compartida con tu hogar en tiempo real."
      />
      <ShoppingListView
        listId={list.id}
        initialItems={items}
        suggestions={suggestions}
        habituales={habituales}
        catalog={catalog}
      />
    </>
  );
}
