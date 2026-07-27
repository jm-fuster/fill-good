import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageContainer } from "@/components/layout/page-container";
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
  // getProductCatalog no depende de list.id → va en la primera tanda junto a
  // getActiveList (antes esperaba a tener la lista: waterfall innecesario).
  const [list, catalog] = await Promise.all([
    getActiveList(),
    getProductCatalog(),
  ]);

  if (!list) {
    return (
      <PageContainer>
        <PageHeader title="Lista de la compra" />
        <EmptyState
          icon={ShoppingCart}
          title="No se pudo cargar la lista"
          description="Ha habido un problema al cargar tu lista de la compra. Vuelve a intentarlo."
          action={
            <Button asChild>
              <Link href="/lista">Reintentar</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  // Estas sí dependen de list.id.
  const [items, suggestions, habituales] = await Promise.all([
    getListItems(list.id),
    getSuggestions(list.id),
    getHabitualProducts(list.id),
  ]);

  return (
    <PageContainer>
      <PageHeader title="Lista de la compra" />
      <ShoppingListView
        listId={list.id}
        initialItems={items}
        suggestions={suggestions}
        habituales={habituales}
        catalog={catalog}
      />
    </PageContainer>
  );
}
