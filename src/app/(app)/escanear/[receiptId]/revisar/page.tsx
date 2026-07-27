import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ReceiptReview } from "@/features/receipts/components/receipt-review";
import {
  getReceipt,
  getReceiptItems,
  getReceiptSuggestions,
} from "@/features/receipts/queries";
import { getProductCatalog } from "@/features/shopping-list/queries";

export const metadata: Metadata = { title: "Revisar ticket" };

export default async function RevisarPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  const receipt = await getReceipt(receiptId);
  if (!receipt) notFound();
  if (receipt.status === "confirmed") redirect("/inventario");

  const [items, products] = await Promise.all([
    getReceiptItems(receiptId),
    getProductCatalog(),
  ]);
  const suggestions = await getReceiptSuggestions(items);

  return (
    <PageContainer>
      <PageHeader
        title="Revisar ticket"
        description="Ajusta lo que haga falta y confirma. Lo marcado pasará al inventario."
        backHref="/escanear"
        backLabel="Añadir ticket"
      />
      <ReceiptReview
        receipt={receipt}
        items={items}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          normalizedName: p.normalizedName,
          defaultLocation: p.defaultLocation,
          purchaseCount: p.purchaseCount,
        }))}
        packByProduct={Object.fromEntries(
          products
            .filter((p) => p.packSize != null)
            .map((p) => [p.id, p.packSize as number]),
        )}
        suggestions={suggestions}
      />
    </PageContainer>
  );
}
