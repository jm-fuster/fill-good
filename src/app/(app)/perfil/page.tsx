import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AlexaCard } from "@/features/alexa/components/alexa-card";
import { getAlexaLinks } from "@/features/alexa/queries";
import { InstallCard } from "@/features/push/components/install-card";
import { ProfileDashboard } from "@/features/profile/components/profile-dashboard";
import { ProfileEditor } from "@/features/profile/components/profile-editor";
import { getProfileOverview } from "@/features/profile/queries";
import { HouseholdSwitcherInline } from "@/features/household/components/household-switcher";
import {
  getCurrentHousehold,
  getHouseholdMembers,
  getUserHouseholds,
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
 *
 * Sus dos piezas son accionables, y las dos son atajos a algo que antes solo
 * estaba en Ajustes: el avatar abre la edición de foto y nombre, y la línea del
 * hogar abre el cambio de hogar (en móvil no había ninguna otra vía, porque el
 * desplegable de hogares vive en el header de escritorio).
 */
export default async function PerfilPage() {
  const [user, household, households, overview] = await Promise.all([
    currentUser(),
    getCurrentHousehold(),
    getUserHouseholds(),
    getProfileOverview(),
  ]);
  const [members, alexaLinks] = household
    ? await Promise.all([
        getHouseholdMembers(household.id),
        getAlexaLinks(household.id),
      ])
    : [[], []];

  // El nombre del hogar manda sobre el de Clerk: es el que ven tus convivientes
  // (firma los movimientos del inventario) y el único que se puede editar aquí,
  // así que enseñar otro en el título haría que "cambiar el nombre" pareciera no
  // haber funcionado.
  const memberName =
    members.find((m) => m.isCurrentUser)?.displayName ?? null;
  const displayName =
    memberName ??
    user?.firstName ??
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Tu cuenta";

  const householdLabel = household?.name ?? null;

  return (
    <PageContainer>
      <PageHeader
        title={displayName}
        avatar={
          <ProfileEditor
            displayName={displayName}
            currentName={memberName}
            initialImageUrl={user?.hasImage ? user.imageUrl : null}
            householdName={household?.name ?? null}
          />
        }
        description={
          household && householdLabel ? (
            <HouseholdSwitcherInline
              households={households.map((h) => ({
                id: h.id,
                name: h.name,
                role: h.role,
              }))}
              activeId={household.id}
              label={householdLabel}
            />
          ) : undefined
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
        {/* La vinculación con Alexa es configuración ocasional, así que va
            debajo del marcador: se toca una vez y se olvida. */}
        {household && householdLabel ? (
          <AlexaCard householdName={householdLabel} links={alexaLinks} />
        ) : null}
      </div>
    </PageContainer>
  );
}
