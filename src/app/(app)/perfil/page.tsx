import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { InstallCard } from "@/features/push/components/install-card";
import { ProfileDashboard } from "@/features/profile/components/profile-dashboard";
import { getProfileOverview } from "@/features/profile/queries";
import {
  getCurrentHousehold,
  getHouseholdMembers,
} from "@/features/household/queries";

export const metadata: Metadata = { title: "Perfil" };

/**
 * Perfil: la entrada por tu identidad al marcador del hogar. Sustituye a Ajustes
 * en la navegación principal, y Ajustes pasa a colgar del engranaje de la
 * cabecera — se visita dos veces al mes y no merece uno de los cinco huecos.
 *
 * La cabecera enmarca "tú + tu hogar" a propósito: las mecánicas son
 * cooperativas, nunca individuales, así que el título es tu nombre pero lo que
 * se mide debajo es del hogar entero.
 */
export default async function PerfilPage() {
  const [user, household, overview] = await Promise.all([
    currentUser(),
    getCurrentHousehold(),
    getProfileOverview(),
  ]);
  const members = household ? await getHouseholdMembers(household.id) : [];
  const displayName =
    user?.firstName ??
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Tu cuenta";

  return (
    <PageContainer>
      <PageHeader
        title={displayName}
        description={
          household
            ? `${household.name} · ${
                members.length === 1 ? "1 miembro" : `${members.length} miembros`
              }`
            : undefined
        }
        action={
          <Button asChild variant="outline" size="icon" aria-label="Ajustes">
            <Link href="/ajustes">
              <Settings aria-hidden />
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Solo se renderiza si la app se puede instalar aquí. Vive en Perfil y
            ya no en Ajustes: es la acción de mayor valor para quien todavía usa
            la web, y esta pantalla se visita mucho más. */}
        <InstallCard />
        {overview ? <ProfileDashboard data={overview} /> : null}
      </div>
    </PageContainer>
  );
}
