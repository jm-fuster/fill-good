"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { SettingsButtonRow } from "@/features/settings/components/settings-list";
import { exportMyDataAction } from "../actions";

/**
 * Descarga los datos de la cuenta y del hogar activo en JSON (portabilidad,
 * art. 20 RGPD). El navegador guarda el archivo; nada sale a terceros.
 */
export function ExportDataRow() {
  const [pending, startTransition] = useTransition();

  function exportData() {
    startTransition(async () => {
      const result = await safeAction(
        exportMyDataAction(),
        "No se pudieron exportar tus datos.",
      );
      if (result.error || !result.data) {
        toast.error(result.error ?? "No se pudieron exportar los datos.");
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fill-good-datos.json";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Datos exportados");
    });
  }

  return (
    <SettingsButtonRow
      icon={Download}
      label="Exportar mis datos"
      hint="Descarga tu cuenta y el contenido de tu hogar en JSON"
      onClick={exportData}
      disabled={pending}
    />
  );
}
