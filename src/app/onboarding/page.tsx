import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DeleteAccountRow } from "@/features/account/components/delete-account-row";
import { OnboardingForm } from "@/features/household/components/onboarding-form";
import { getCurrentHousehold } from "@/features/household/queries";

export const metadata: Metadata = { title: "Bienvenido" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const household = await getCurrentHousehold();
  if (household) redirect("/inventario");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
          Empieza con tu hogar
        </h1>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          Crea un hogar nuevo para gestionar tu inventario y tu lista de la
          compra, o únete al de un familiar con su código de invitación.
        </p>
      </div>
      <OnboardingForm />
      {/* Sin hogar no se llega a Ajustes (el layout de la app redirige aquí),
          así que borrar la cuenta tiene que estar también en esta pantalla:
          si no, quien sale de su único hogar no podría ejercer la supresión
          desde la app (arts. 12.2 y 17 RGPD). */}
      <div className="mt-10 border-t pt-4">
        <DeleteAccountRow />
      </div>
    </main>
  );
}
