import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { HouseholdSettings } from "@/features/household/components/household-settings";
import {
  getCurrentHousehold,
  getHouseholdMembers,
} from "@/features/household/queries";

export const metadata: Metadata = { title: "Mi hogar" };

export default async function HogarPage() {
  const household = await getCurrentHousehold();
  // El layout de (app) ya redirige sin hogar; esto además estrecha el tipo.
  if (!household) redirect("/onboarding");
  const members = await getHouseholdMembers(household.id);

  return (
    <PageContainer variant="narrow">
      <PageHeader
        title="Mi hogar"
        description={`Invitaciones, miembros y propiedad de «${household.name}».`}
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <HouseholdSettings household={household} members={members} />
    </PageContainer>
  );
}
