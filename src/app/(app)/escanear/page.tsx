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
        description="La IA lee los productos y precios; tú los revisas antes de guardar."
      />
      <ScanForm />
      <PendingReceipts receipts={pending} />
    </PageContainer>
  );
}
