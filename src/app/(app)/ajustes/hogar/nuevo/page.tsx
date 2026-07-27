import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { OnboardingForm } from "@/features/household/components/onboarding-form";

export const metadata: Metadata = { title: "Otro hogar" };

/**
 * Añadir un hogar más sin abandonar el actual (E-multihogar): una segunda
 * residencia, la casa de vacaciones… Reutiliza el formulario del onboarding;
 * al crear o unirse, el hogar nuevo pasa a ser el activo (cookie) y se puede
 * alternar desde Ajustes o el selector del header.
 */
export default function NuevoHogarPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Otro hogar"
        description="Crea un hogar adicional o únete a uno existente con su código de invitación. El nuevo hogar pasará a ser el activo, y podrás cambiar entre ellos cuando quieras."
        backHref="/ajustes"
        backLabel="Ajustes"
      />
      <OnboardingForm />
    </PageContainer>
  );
}
