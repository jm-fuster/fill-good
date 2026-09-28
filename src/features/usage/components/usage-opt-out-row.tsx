"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChartColumn } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import { SettingsControlRow } from "@/features/settings/components/settings-list";
import { setUsageOptOutAction } from "../actions";

/**
 * Fila de Ajustes para oponerse a la medición de uso (art. 21 RGPD). Oponerse
 * borra también lo ya anotado; volver a activarla no lo recupera.
 */
export function UsageOptOutRow({ optedOut }: { optedOut: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const result = await safeAction(
        setUsageOptOutAction(!optedOut),
        "No se pudo guardar tu preferencia.",
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        optedOut
          ? "Medición de uso activada"
          : "Ya no medimos tu uso, y hemos borrado lo anotado",
      );
      router.refresh();
    });
  }

  return (
    <SettingsControlRow
      icon={ChartColumn}
      label="Medición de uso"
      hint="Qué días abres la app y si usas el repaso de despensa"
      value={optedOut ? "Desactivada" : "Activada"}
      control={
        <Button variant="outline" onClick={toggle} loading={pending}>
          {optedOut ? "Activar" : "Desactivar"}
        </Button>
      }
    />
  );
}
