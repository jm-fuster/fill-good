import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getChainAisleOrders,
  getStoreCategories,
} from "@/features/categories/queries";
import { getHouseholdChains } from "@/features/household/queries";
import { getLatestUnitPrices } from "@/features/prices/queries";
import { ShoppingMode } from "@/features/shopping-list/components/shopping-mode";
import {
  getActiveList,
  getProductCatalog,
  getShoppingModeItems,
  getSuggestions,
} from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Modo compra" };

export default async function ModoCompraPage() {
  // Todo sale a la vez que la lista activa, en vez de esperar a saber cuál es:
  // solo los artículos la necesitan de verdad, y las sugerencias únicamente
  // para excluir lo apuntado (ver `getSuggestions`). Los precios se piden ya
  // porque `getShoppingModeItems` los usa siempre y van en `cache()`: es la
  // misma lectura, empezada antes. Si no hay lista se redirige igual y lo
  // demás se descarta (el `catch` vacío solo evita un rechazo sin manejar).
  const listPromise = getActiveList();
  const rest = Promise.all([
    getProductCatalog(),
    getSuggestions(listPromise.then((l) => l?.id ?? null)),
    getStoreCategories(),
    getChainAisleOrders(),
    getHouseholdChains(),
    getLatestUnitPrices(),
  ]);
  rest.catch(() => {});
  const list = await listPromise;
  if (!list) redirect("/lista");

  // `categories` va aquí porque el orden de pasillos se corrige DENTRO de la
  // compra (es el único momento en que se ve que está mal). Son unas pocas filas
  // y viajan ya en la carga de la pantalla: en el pasillo, con mala cobertura, no
  // hay que navegar a Ajustes ni pedir nada más al servidor para abrir el editor.
  // `aisleOrders` y `chains` viajan enteros (todas las tiendas del hogar, no la
  // del viaje): así cambiar de tienda en el pasillo reordena al instante, sin
  // volver al servidor con la cobertura del supermercado.
  const [items, [catalog, suggestions, categories, aisleOrders, { chains }]] =
    await Promise.all([getShoppingModeItems(list.id), rest]);

  return (
    <ShoppingMode
      listId={list.id}
      initialItems={items}
      catalog={catalog}
      suggestions={suggestions}
      categories={categories}
      aisleOrders={aisleOrders}
      chains={chains}
    />
  );
}
