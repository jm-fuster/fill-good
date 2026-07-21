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
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer variant="default">
      <ErrorScreen error={error} reset={reset} />
    </PageContainer>
  );
}
