import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ShoppingListView } from "@/features/shopping-list/components/shopping-list-view";
import {
  getActiveList,
  getListItems,
  getSuggestions,
} from "@/features/shopping-list/queries";
import { getProducts } from "@/features/inventory/queries";

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

  const [items, suggestions, products] = await Promise.all([
    getListItems(list.id),
    getSuggestions(list.id),
    getProducts(),
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
        productNames={products.map((p) => p.name)}
      />
    </>
  );
}
