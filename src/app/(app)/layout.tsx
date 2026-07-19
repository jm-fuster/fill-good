import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentHousehold } from "@/features/household/queries";

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
