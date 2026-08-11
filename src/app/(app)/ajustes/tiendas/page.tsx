import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StoreChainsEditor } from "@/features/household/components/store-chains-editor";
import {
  getChainsSeenInReceipts,
  getConfiguredChains,
  getCurrentHousehold,
} from "@/features/household/queries";

export const metadata: Metadata = { title: "Tus supermercados" };

const DESCRIPTION =
  "Dónde soléis comprar. Tus tiendas salen primero al elegir la tienda preferida de un producto, y ayudan a la IA a identificar la cadena de cada ticket.";

export default async function TiendasPage() {
  const household = await getCurrentHousehold();
  // El layout de (app) ya redirige sin hogar; esto además estrecha el tipo.
  if (!household) redirect("/onboarding");

  // Las deducidas se piden SIEMPRE (no solo cuando no hay configuración): son el
  // distintivo "En tus tickets" y el botón para volver al modo automático.
  const [configured, detected] = await Promise.all([
    getConfiguredChains(household.id),
    getChainsSeenInReceipts(household.id),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Tus supermercados"
        description={DESCRIPTION}
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <StoreChainsEditor
        householdId={household.id}
        configured={configured}
        detected={detected}
      />
    </PageContainer>
  );
}
