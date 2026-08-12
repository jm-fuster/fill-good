"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import { SettingsControlRow } from "@/features/settings/components/settings-list";
import { grantAiConsentAction, revokeAiConsentAction } from "../actions";

/**
 * Fila de Ajustes para dar/retirar el consentimiento del procesamiento con IA
 * (art. 7.3 RGPD: la retirada debe ser tan fácil como el otorgamiento). Al
 * retirarlo, el escaneo de tickets y la generación de menús volverán a pedir el
 * consentimiento antes de enviar nada a Google.
 */
export function AiConsentSettingRow({ consented }: { consented: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const result = await safeAction(
        consented ? revokeAiConsentAction() : grantAiConsentAction(),
        "No se pudo guardar tu preferencia.",
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        consented ? "Consentimiento de IA retirado" : "Consentimiento de IA activado",
      );
      router.refresh();
    });
  }

  return (
    <SettingsControlRow
      icon={Sparkles}
      label="Procesamiento con IA"
      hint="Escaneo de tickets y menús con la IA de Google"
      value={consented ? "Aceptado" : "No aceptado"}
      control={
        <Button
          variant={consented ? "outline" : "default"}
          onClick={toggle}
          loading={pending}
        >
          {consented ? "Retirar" : "Activar"}
        </Button>
      }
    />
  );
}
