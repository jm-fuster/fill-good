"use client";

import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { AiConsentCard } from "./ai-consent-card";

/**
 * Consentimiento de IA en un overlay, para dispararlo bajo demanda cuando una
 * acción de IA devuelve `needsAiConsent` (p. ej. generar menú sin haber
 * consentido). No anidar bajo otro ResponsiveModal (ver regla del proyecto):
 * úsalo solo desde superficies que no tengan ya un modal abierto.
 */
export function AiConsentModal({
  open,
  onOpenChange,
  onAccepted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: () => void;
}) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader className="sr-only">
          <ResponsiveModalTitle>Antes de usar la IA</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Consentimiento para procesar tus datos con la IA de Google.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <div className="px-4 pb-4">
          <AiConsentCard onAccepted={onAccepted} className="border-0 p-0" />
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
