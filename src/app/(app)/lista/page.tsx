import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  getChainAisleOrders,
  getStoreCategories,
} from "@/features/categories/queries";
import { getHouseholdChains } from "@/features/household/queries";
import { ShoppingListView } from "@/features/shopping-list/components/shopping-list-view";
import {
  getActiveList,
  getListItems,
  getProductCatalog,
  getSuggestions,
  getTripPendingTicket,
} from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Lista de la compra" };

export default async function ListaPage() {
  // Nada de esto depende de list.id → todo en la primera tanda junto a
  // getActiveList (antes el catálogo esperaba a tener la lista: waterfall
  // innecesario). Los pasillos y las tiendas viajan aquí porque el orden de
  // pasillos —el que se guarda por supermercado— se edita desde el modo
  // reordenar de esta pantalla; son unas pocas filas.
  //
  // Lo que sí depende de la lista tampoco espera a la tanda entera: los
  // artículos salen en cuanto se sabe cuál es, y las sugerencias (la lectura
  // más pesada, todo el historial de compras) arrancan ya y solo esperan a la
  // lista para excluir lo que está apuntado (ver `getSuggestions`).
  const listPromise = getActiveList();
  const [
    list,
    items,
    suggestions,
    catalog,
    pendingTicket,
    categories,
    aisleOrders,
    { chains },
  ] = await Promise.all([
    listPromise,
    listPromise.then((l) => (l ? getListItems(l.id) : [])),
    getSuggestions(listPromise.then((l) => l?.id ?? null)),
    getProductCatalog(),
    getTripPendingTicket(),
    getStoreCategories(),
    getChainAisleOrders(),
    getHouseholdChains(),
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

  return (
    <PageContainer>
      <PageHeader title="Lista de la compra" />
      <ShoppingListView
        listId={list.id}
        initialItems={items}
        suggestions={suggestions}
        catalog={catalog}
        pendingTicket={pendingTicket}
        categories={categories}
        aisleOrders={aisleOrders}
        chains={chains}
      />
    </PageContainer>
  );
}
