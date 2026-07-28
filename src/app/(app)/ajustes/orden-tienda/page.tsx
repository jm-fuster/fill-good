import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  getChainAisleOrders,
  getStoreCategories,
} from "@/features/categories/queries";
import { AisleOrderPanel } from "@/features/categories/components/aisle-order-panel";
import { getHouseholdChains } from "@/features/household/queries";

export const metadata: Metadata = { title: "Orden de la tienda" };

export default async function OrdenTiendaPage() {
  const [categories, orders, { chains }] = await Promise.all([
    getStoreCategories(),
    getChainAisleOrders(),
    getHouseholdChains(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Orden de la tienda"
        description="Ordena los pasillos como en tu supermercado. La lista agrupada y el modo compra te mostrarán los productos en este orden."
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      {/* Las tiendas del hogar valen aunque estén DEDUCIDAS de los tickets: si
          la app ya sabe que compras en dos sitios, no hace falta configurar
          nada para poder darle a cada uno su orden. */}
      <AisleOrderPanel
        categories={categories}
        orders={orders}
        stores={chains}
      />
    </PageContainer>
  );
}
