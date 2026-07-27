import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { HouseholdSettings } from "@/features/household/components/household-settings";
import {
  getCurrentHousehold,
  getHouseholdMembers,
  getUserHouseholds,
} from "@/features/household/queries";

export const metadata: Metadata = { title: "Mi hogar" };

export default async function HogarPage() {
  const household = await getCurrentHousehold();
  // El layout de (app) ya redirige sin hogar; esto además estrecha el tipo.
  if (!household) redirect("/onboarding");
  const [members, households] = await Promise.all([
    getHouseholdMembers(household.id),
    getUserHouseholds(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Mi hogar"
        description={`Invitaciones, miembros y propiedad de «${household.name}».`}
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <HouseholdSettings
        household={household}
        households={households.map((h) => ({
          id: h.id,
          name: h.name,
          role: h.role,
        }))}
        members={members}
      />
    </PageContainer>
  );
}
