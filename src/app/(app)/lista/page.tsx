import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Lista de la compra" };

export default function ListaPage() {
  return (
    <>
      <PageHeader
        title="Lista de la compra"
        description="Compartida con tu hogar en tiempo real."
      />
      <EmptyState
        icon={ShoppingCart}
        title="La lista está vacía"
        description="Añade productos desde el inventario o escribe lo que necesites. Lo que compres pasará al inventario automáticamente."
      />
    </>
  );
}
