import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Menús" };

export default function MenusPage() {
  return (
    <>
      <PageHeader
        title="Menús"
        description="Planifica la semana con lo que tienes en casa."
      />
      <EmptyState
        icon={CalendarDays}
        title="Sin menú esta semana"
        description="Crea tu menú semanal a mano o genera uno con IA a partir de tu inventario, priorizando lo que caduca antes."
      />
    </>
  );
}
