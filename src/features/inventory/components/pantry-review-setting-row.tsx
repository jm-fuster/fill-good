"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { safeAction } from "@/lib/action-error";
import { SettingsControlRow } from "@/features/settings/components/settings-list";
import { setPantryReviewEnabledAction } from "../actions";

/**
 * Fila de Ajustes del repaso semanal de despensa. Existe sobre todo para que el
 * "No volver a preguntar" del propio repaso tenga vuelta: una salida sin retorno
 * no es una preferencia, es una puerta que se cierra, y el aviso que la anuncia
 * promete literalmente que se puede reactivar aquí.
 *
 * Va con Button y no con Switch para leerse igual que su vecina (el
 * consentimiento de IA) dentro del mismo grupo.
 */
export function PantryReviewSettingRow({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const result = await safeAction(
        setPantryReviewEnabledAction(!enabled),
        "No se pudo guardar tu preferencia.",
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        enabled ? "Repaso de despensa desactivado" : "Repaso de despensa activado",
      );
      router.refresh();
    });
  }

  return (
    <SettingsControlRow
      icon={PackageSearch}
      label="Repaso de despensa"
      hint="Una vez por semana, qué te queda de lo que llevas tiempo sin mirar"
      value={enabled ? "Activado" : "Desactivado"}
      control={
        <Button
          variant={enabled ? "outline" : "default"}
          onClick={toggle}
          loading={pending}
        >
          {enabled ? "Desactivar" : "Activar"}
        </Button>
      }
    />
  );
}
