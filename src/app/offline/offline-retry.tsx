"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Acción de recuperación de la página offline: botón «Reintentar» y recarga
 * automática al volver la conexión (evento `online`).
 */
export function OfflineRetry() {
  useEffect(() => {
    function onOnline() {
      window.location.reload();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <Button onClick={() => window.location.reload()}>
      <RefreshCw aria-hidden />
      Reintentar
    </Button>
  );
}
