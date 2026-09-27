"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { grantAiConsentAction } from "../actions";

/**
 * Aviso de primera capa + consentimiento para el procesamiento con IA de Google.
 * Se muestra antes del primer escaneo, menú o receta con IA. Al aceptar registra
 * el consentimiento y llama a `onAccepted` para que la vista contenedora
 * continúe (mostrar el formulario, reintentar la generación…).
 */
export function AiConsentCard({
  onAccepted,
  className,
}: {
  onAccepted: () => void;
  className?: string;
}) {
  const [pending, start] = useTransition();

  function accept() {
    start(async () => {
      const result = await safeAction(
        grantAiConsentAction(),
        "No se pudo guardar tu preferencia.",
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onAccepted();
    });
  }

  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border bg-card p-5", className)}>
      <div className="flex items-center gap-2">
        <span
          className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Sparkles className="size-5" />
        </span>
        <h2 className="text-base font-semibold">Antes de usar la IA</h2>
      </div>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          Para leer tickets, generar menús y escribir recetas enviamos a la{" "}
          <strong className="text-foreground">IA de Google (Gemini)</strong> lo
          que hace falta: el ticket, tu despensa, tus recetas con sus
          valoraciones y costes, la lista de la compra, los platos recientes, el
          presupuesto y las preferencias del menú, incluida una dieta «sin
          gluten» si la eliges. Es contenido compartido del hogar: viaja también
          lo que han apuntado los demás.
        </p>
        <p>
          Según sus términos, Google no usa lo enviado para mejorar sus
          productos. Aun así, tapa la zona de la tarjeta del ticket antes de
          escanearlo. Puedes retirar este permiso cuando quieras en Ajustes.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={accept} loading={pending}>
          {pending ? "Guardando…" : "Acepto y continúo"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/privacidad">Ver la política de privacidad</Link>
        </Button>
      </div>
    </div>
  );
}
