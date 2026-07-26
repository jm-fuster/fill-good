import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { OnboardingForm } from "@/features/household/components/onboarding-form";
import { getCurrentHousehold } from "@/features/household/queries";

export const metadata: Metadata = { title: "Unirse a un hogar" };
export const dynamic = "force-dynamic";

export default async function UnirsePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // El código se muestra/dicta en mayúsculas; normalizamos para el prefill.
  const inviteCode = decodeURIComponent(code).trim().toUpperCase();

  // La ruta está protegida por el middleware (proxy.ts): un usuario sin sesión
  // ya habrá sido redirigido a sign-in con redirect_url de vuelta aquí. Esta
  // comprobación es una salvaguarda defensiva.
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=/unirse/${inviteCode}`);

  // Se puede pertenecer a varios hogares (E-multihogar): tener ya uno no
  // bloquea la invitación; el hogar al que te unes pasa a ser el activo. Si el
  // código es el de un hogar al que ya perteneces, el RPC es idempotente y el
  // efecto es simplemente cambiar a ese hogar.
  const household = await getCurrentHousehold();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
          Únete al hogar
        </h1>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          Te han invitado a un hogar en Fill Good. Revisa el código y pulsa
          «Unirme al hogar» para empezar a compartir inventario y lista de la
          compra.
        </p>
        {household ? (
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Ya perteneces a «{household.name}»: este hogar se añadirá como uno
            más y pasará a ser el activo. Podrás cambiar entre tus hogares
            desde Ajustes.
          </p>
        ) : null}
      </div>
      <OnboardingForm initialCode={inviteCode} />
    </main>
  );
}
