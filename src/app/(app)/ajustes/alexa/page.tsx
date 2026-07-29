import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AlexaSetup } from "@/features/alexa/components/alexa-setup";
import { getAlexaLinks } from "@/features/alexa/queries";
import { getCurrentHousehold } from "@/features/household/queries";

export const metadata: Metadata = { title: "Alexa" };

const DESCRIPTION =
  "Ajusta el inventario y la lista sin tocar el móvil: «Alexa, dile a mi despensa que reste dos yogures», que añada tres leches o que apunte pan.";

/**
 * Vinculación con Alexa. Vive aquí y no en /perfil porque son tres pasos que
 * ocupan media pantalla y se tocan una vez en la vida: en la pantalla que más se
 * visita eran estorbo, y en Ajustes es una fila más que se abre cuando hace falta.
 */
export default async function AjustesAlexaPage() {
  const household = await getCurrentHousehold();
  // El layout de (app) ya redirige sin hogar; esto además estrecha el tipo.
  if (!household) redirect("/onboarding");

  const links = await getAlexaLinks(household.id);

  return (
    <PageContainer>
      <PageHeader
        title="Alexa"
        description={DESCRIPTION}
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <AlexaSetup
        householdId={household.id}
        householdName={household.name}
        links={links}
      />
    </PageContainer>
  );
}
