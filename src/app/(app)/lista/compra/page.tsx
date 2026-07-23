import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ShoppingMode } from "@/features/shopping-list/components/shopping-mode";
import {
  getActiveList,
  getProductCatalog,
  getShoppingModeItems,
} from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Modo compra" };

export default async function ModoCompraPage() {
  const list = await getActiveList();
  if (!list) redirect("/lista");

  const [items, catalog] = await Promise.all([
    getShoppingModeItems(list.id),
    getProductCatalog(),
  ]);

  return <ShoppingMode listId={list.id} initialItems={items} catalog={catalog} />;
}
