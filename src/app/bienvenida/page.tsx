import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WelcomeShare } from "@/features/household/components/welcome-share";
import { getCurrentHousehold } from "@/features/household/queries";

export const metadata: Metadata = { title: "Tu hogar está listo" };
export const dynamic = "force-dynamic";

/**
 * Adonde lleva crear un hogar, en vez de al inventario. De los seis hogares
 * reales de la foto de uso del 28-sep, la mitad se fue el primer día con la
 * despensa recién sembrada y sin tocar la lista, y los dos únicos que siguen son
 * los dos que invitaron a alguien. La pantalla pregunta si hay alguien con
 * quien compartir la compra y, conteste lo que conteste, termina en la lista,
 * que es donde la app sirve desde el primer minuto.
 *
 * A pantalla completa y fuera del shell, como `/onboarding`: es el final del
 * alta, no una página de la app. Unirse a un hogar no pasa por aquí, porque
 * quien se une ya comparte la compra con alguien.
 */
export default async function BienvenidaPage() {
  const household = await getCurrentHousehold();
  if (!household) redirect("/onboarding");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
          ¿Compartes la compra con alguien?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          «{household.name}» ya está creado. Si hacéis la compra entre varios,
          la lista se ve y se actualiza en el móvil de cada uno.
        </p>
      </div>
      <WelcomeShare
        householdName={household.name}
        inviteCode={household.inviteCode}
      />
    </main>
  );
}
