"use client";

import { ErrorScreen } from "@/components/layout/error-screen";

/**
 * Barrera de error de la raíz. Captura los fallos que ocurren en los layouts
 * (p. ej. `getCurrentHousehold()` en el layout de la app: auth de Clerk +
 * Supabase), que no llegan a la barrera de un segmento hijo. Se renderiza
 * dentro del RootLayout, así que conserva tema y proveedores.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} fullScreen />;
}
