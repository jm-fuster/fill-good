import type { Metadata } from "next";
import { ScanLine } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Escanear ticket" };

export default function EscanearPage() {
  return (
    <>
      <PageHeader
        title="Escanear ticket"
        description="Fotografía tu ticket y actualiza el inventario."
      />
      <EmptyState
        icon={ScanLine}
        title="Escaneo de tickets"
        description="Haz una foto al ticket de la compra: la IA extraerá los productos y precios y tú solo tendrás que revisar y confirmar."
      />
    </>
  );
}
