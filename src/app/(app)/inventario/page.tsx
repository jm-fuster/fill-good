import type { Metadata } from "next";
import Link from "next/link";
import { LineChart, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AddProductDrawer } from "@/features/inventory/components/add-product-drawer";
import { InventoryList } from "@/features/inventory/components/inventory-list";
import { StarterPicker } from "@/features/inventory/components/starter-picker";
import { isStatusFilter } from "@/features/inventory/status";
import {
  getCategories,
  getInventory,
  getPinnedProductIds,
  getProducts,
  getStarterCatalog,
} from "@/features/inventory/queries";
import { getActiveListProductIds } from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Inventario" };

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const { q, estado } = await searchParams;
  const estadoParam = estado ?? null;
  const initialFilter = isStatusFilter(estadoParam) ? estadoParam : null;
  const [entries, categories, products, onListProductIds, pinnedProductIds] =
    await Promise.all([
      getInventory(),
      getCategories(),
      getProducts(),
      getActiveListProductIds(),
      getPinnedProductIds(),
    ]);
  const productNames = products.map((p) => p.name);
  // El selector "¿Qué tienes ya en casa?" solo tiene sentido con el inventario
  // vacío; solo entonces consultamos el catálogo sembrado que aún no está en él.
  const starterGroups = entries.length === 0 ? await getStarterCatalog() : [];

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Tu despensa, nevera y congelador."
        action={
          <Button asChild variant="outline" size="icon" aria-label="Ver precios">
            <Link href="/precios">
              <LineChart aria-hidden />
            </Link>
          </Button>
        }
      />

      {entries.length === 0 ? (
        starterGroups.length > 0 ? (
          <StarterPicker groups={starterGroups} />
        ) : (
          <EmptyState
            icon={Package}
            title="Aún no hay productos"
            description="Pulsa el botón + para añadir tu primer producto, o escanea un ticket para llenar el inventario de golpe."
          />
        )
      ) : (
        <InventoryList
          entries={entries}
          categories={categories}
          onListProductIds={[...onListProductIds]}
          pinnedProductIds={[...pinnedProductIds]}
          initialQuery={q ?? ""}
          initialFilter={initialFilter}
        />
      )}

      <AddProductDrawer categories={categories} productNames={productNames} />
    </>
  );
}
