import type { Metadata } from "next";
import Link from "next/link";
import { Package, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AddProductDrawer } from "@/features/inventory/components/add-product-drawer";
import { InventoryItemCard } from "@/features/inventory/components/inventory-item-card";
import {
  getCategories,
  getInventory,
  getProducts,
  type InventoryEntry,
} from "@/features/inventory/queries";
import { getActiveListProductIds } from "@/features/shopping-list/queries";
import { getExpiryStatus } from "@/lib/dates";
import { LOCATION_ICONS, LOCATION_LABELS, LOCATION_ORDER } from "@/lib/units";

export const metadata: Metadata = { title: "Inventario" };

/**
 * Prioridad de atención dentro de cada ubicación: primero lo caducado, luego lo
 * que caduca pronto o está marcado "consumir pronto", después el resto y, al
 * final, lo agotado (queda accionable con "Añadir a la lista", pero no urge).
 */
function urgencyRank(entry: InventoryEntry): number {
  if (entry.quantity === 0) return 3;
  const expiry = getExpiryStatus(entry.expiryDate);
  if (expiry?.status === "expired") return 0;
  if (expiry?.status === "soon" || entry.useSoon) return 1;
  return 2;
}

export default async function InventarioPage() {
  const [entries, categories, products, onListProductIds] = await Promise.all([
    getInventory(),
    getCategories(),
    getProducts(),
    getActiveListProductIds(),
  ]);
  const productNames = products.map((p) => p.name);

  const groups = LOCATION_ORDER.map((location) => ({
    location,
    items: entries
      .filter((e) => e.location === location)
      .sort(
        (a, b) =>
          urgencyRank(a) - urgencyRank(b) ||
          a.productName.localeCompare(b.productName, "es"),
      ),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Tu despensa, nevera y congelador."
        action={
          <Button asChild variant="outline" size="icon" aria-label="Ver precios">
            <Link href="/precios">
              <TrendingUp aria-hidden />
            </Link>
          </Button>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Aún no hay productos"
          description="Pulsa el botón + para añadir tu primer producto, o escanea un ticket para llenar el inventario de golpe."
        />
      ) : (
        <div className="flex flex-col gap-6 pb-fab">
          {groups.map((group) => (
            <section key={group.location}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <span aria-hidden>{LOCATION_ICONS[group.location]}</span>
                {LOCATION_LABELS[group.location]}
                <span className="font-normal">({group.items.length})</span>
              </h2>
              <div className="flex flex-col gap-2">
                {group.items.map((entry) => (
                  <InventoryItemCard
                    key={entry.id}
                    entry={entry}
                    categories={categories}
                    onList={onListProductIds.has(entry.productId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <AddProductDrawer categories={categories} productNames={productNames} />
    </>
  );
}
