import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentHousehold } from "@/features/household/queries";

// Todas las rutas de la app dependen de la sesión y de datos por hogar:
// siempre dinámicas (evita el sondeo estático que llamaría a auth()/headers()).
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Guard: sin hogar no se puede usar la app → onboarding.
  const household = await getCurrentHousehold();
  if (!household) redirect("/onboarding");

  return <AppShell>{children}</AppShell>;
}
