"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import { SettingsControlRow } from "@/features/settings/components/settings-list";
import { revokeAiConsentAction } from "../actions";
import { AiConsentModal } from "./ai-consent-modal";

/**
 * Fila de Ajustes para dar/retirar el consentimiento del procesamiento con IA
 * (art. 7.3 RGPD: la retirada debe ser tan fácil como el otorgamiento).
 *
 * Retirar es un toque; ACTIVAR abre el aviso. Antes activaba directamente, y
 * así quien nunca había visto el aviso daba un consentimiento sin información,
 * que no vale como consentimiento (art. 4.11).
 */
export function AiConsentSettingRow({ consented }: { consented: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);

  function revoke() {
    start(async () => {
      const result = await safeAction(
        revokeAiConsentAction(),
        "No se pudo guardar tu preferencia.",
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Consentimiento de IA retirado");
      router.refresh();
    });
  }

  return (
    <>
      <SettingsControlRow
        icon={Sparkles}
        label="Procesamiento con IA"
        hint="Tickets, menús y recetas con la IA de Google"
        value={consented ? "Aceptado" : "No aceptado"}
        control={
          <Button
            variant={consented ? "outline" : "default"}
            onClick={consented ? revoke : () => setAsking(true)}
            loading={pending}
          >
            {consented ? "Retirar" : "Activar"}
          </Button>
        }
      />
      <AiConsentModal
        open={asking}
        onOpenChange={setAsking}
        onAccepted={() => {
          setAsking(false);
          toast.success("Consentimiento de IA activado");
          router.refresh();
        }}
      />
    </>
  );
}
