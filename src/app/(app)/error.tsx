"use client";

import { ErrorScreen } from "@/components/layout/error-screen";
import { PageContainer } from "@/components/layout/page-container";

/**
 * Barrera de error para las páginas de la app (inventario, lista, precios…).
 * Captura fallos de las queries de página; se renderiza dentro del AppShell,
 * así que la navegación inferior se mantiene.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageContainer>
      <ErrorScreen error={error} retry={retry} />
    </PageContainer>
  );
}
