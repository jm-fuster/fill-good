import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PushCard } from "@/features/push/components/push-card";

export const metadata: Metadata = { title: "Notificaciones" };

export default function NotificacionesPage() {
  return (
    <PageContainer variant="narrow">
      <PageHeader
        title="Notificaciones"
        description="Avisos en tus dispositivos sin abrir la app. La activación es por dispositivo."
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <PushCard />
    </PageContainer>
  );
}
