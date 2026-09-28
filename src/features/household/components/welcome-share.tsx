"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Share2, User, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { safeAction } from "@/lib/action-error";
import { trackFromClient } from "@/features/usage/track";

import { finishWelcomeAction } from "../actions";

/**
 * «¿Compartes la compra con alguien?», al terminar de crear un hogar.
 *
 * La pregunta existe porque la invitación es lo único que separa, en los datos
 * del 28-sep, a los hogares que siguen de los que se fueron; pero no da por
 * hecho que haya alguien a quien invitar. Quien vive solo contesta «solo yo» y
 * no se le vuelve a hablar de invitar: insistir es justo lo que le haría irse.
 * El texto no dice «pareja» a propósito, porque el hogar más activo son tres
 * personas.
 */
export function WelcomeShare({
  householdName,
  inviteCode,
}: {
  householdName: string;
  inviteCode: string;
}) {
  const [shares, setShares] = useState(false);
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState<"solo" | "skip" | null>(null);
  // Igual que en Ajustes del hogar: navigator.share solo existe en cliente, y
  // useSyncExternalStore da false en el servidor y en la hidratación.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => "share" in navigator,
    () => false,
  );

  function inviteUrl() {
    return `${window.location.origin}/unirse/${inviteCode}`;
  }

  function answerYes() {
    setShares(true);
    trackFromClient({ name: "onboarding_shares", props: { answer: "yes" } });
  }

  function leave(answer: "solo" | "skip") {
    setLeaving(answer);
    startTransition(async () => {
      // Si sale bien no vuelve: la acción redirige a la lista.
      const r = await safeAction(
        finishWelcomeAction(answer),
        "No se pudo abrir la lista",
      );
      if (r.error) {
        toast.error(r.error);
        setLeaving(null);
      }
    });
  }

  // Se anota al TERMINAR de compartir o copiar, como en Ajustes: lo que se
  // compara con las invitaciones aceptadas son los enlaces que salieron.
  function copyLink() {
    navigator.clipboard
      .writeText(inviteUrl())
      .then(() => {
        toast.success("Enlace copiado");
        trackFromClient({ name: "invite_shared", props: { via: "copy" } });
      })
      .catch(() => toast.error("No se pudo copiar"));
  }

  function shareLink() {
    navigator
      .share({
        title: `Únete a ${householdName} en Fill Good`,
        text: "Te invito a nuestro hogar en Fill Good para compartir la compra.",
        url: inviteUrl(),
      })
      .then(() =>
        trackFromClient({ name: "invite_shared", props: { via: "share" } }),
      )
      .catch(() => {
        // El usuario canceló el diálogo de compartir: no es un error.
      });
  }

  if (shares) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground text-pretty">
          Invita a quien compra contigo: pareja, familia, compañeros de piso…
          Con el enlace entran directos a «{householdName}» y veis la misma
          lista, al momento. Caduca en 7 días; puedes generar otro en Ajustes.
        </p>
        <div className="flex flex-col gap-2">
          {canShare ? (
            <Button size="lg" onClick={shareLink}>
              <Share2 aria-hidden />
              Compartir enlace
            </Button>
          ) : null}
          <Button
            size="lg"
            variant={canShare ? "outline" : "default"}
            onClick={copyLink}
          >
            <Copy aria-hidden />
            Copiar enlace
          </Button>
        </div>
        <Button asChild size="lg" variant="ghost">
          <Link href="/lista">
            Seguir a mi lista
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" onClick={answerYes} disabled={pending}>
        <Users aria-hidden />
        Sí, con alguien más
      </Button>
      <Button
        size="lg"
        variant="outline"
        onClick={() => leave("solo")}
        loading={pending && leaving === "solo"}
        disabled={pending}
      >
        <User aria-hidden />
        No, solo yo
      </Button>
      <Button
        variant="ghost"
        onClick={() => leave("skip")}
        loading={pending && leaving === "skip"}
        disabled={pending}
        className="self-center text-muted-foreground"
      >
        Ahora no
      </Button>
    </div>
  );
}
