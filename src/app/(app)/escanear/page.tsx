import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScanForm } from "@/features/receipts/components/scan-form";
import { PendingReceipts } from "@/features/receipts/components/pending-receipts";
import { getPendingReceipts } from "@/features/receipts/queries";

export const metadata: Metadata = { title: "Añadir ticket" };

export default async function EscanearPage() {
  const pending = await getPendingReceipts();

  return (
    <PageContainer>
      <PageHeader
        title="Añadir ticket"
        description="Sube o fotografía el ticket: la IA lee los productos y precios."
      />
      <ScanForm />
      <p className="mt-6 text-sm text-muted-foreground text-pretty">
        Tras leer el ticket podrás revisar cada producto antes de añadirlo a tu
        inventario. Los precios alimentan el historial para ver tendencias.
      </p>
      <PendingReceipts receipts={pending} />
    </PageContainer>
  );
}
