import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ScanForm } from "@/features/receipts/components/scan-form";

export const metadata: Metadata = { title: "Escanear ticket" };

export default function EscanearPage() {
  return (
    <PageContainer variant="narrow">
      <PageHeader
        title="Escanear ticket"
        description="Haz una foto o sube un PDF: la IA lee los productos y precios."
      />
      <ScanForm />
      <p className="mt-6 text-sm text-muted-foreground text-pretty">
        Tras leer el ticket podrás revisar cada producto antes de añadirlo a tu
        inventario. Los precios alimentan el historial para ver tendencias.
      </p>
    </PageContainer>
  );
}
