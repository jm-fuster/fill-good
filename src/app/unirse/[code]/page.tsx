import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

  const household = await getCurrentHousehold();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      {household ? (
        <div className="flex flex-col gap-4 text-center">
          <CheckCircle2
            className="mx-auto size-10 text-success"
            aria-hidden
          />
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
              Ya perteneces a un hogar
            </h1>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Estás en «{household.name}». Cada usuario forma parte de un solo
              hogar, así que no puedes unirte a otro con este enlace.
            </p>
          </div>
          <Button asChild size="lg" className="self-center">
            <Link href="/ajustes">Ir a mis ajustes</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-8 text-center">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
              Únete al hogar
            </h1>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Te han invitado a un hogar en Stash. Revisa el código y pulsa
              «Unirme al hogar» para empezar a compartir inventario y lista de
              la compra.
            </p>
          </div>
          <OnboardingForm initialCode={inviteCode} />
        </>
      )}
    </main>
  );
}
