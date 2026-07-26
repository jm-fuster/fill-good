"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { SettingsLinkRow } from "@/features/settings/components/settings-list";

/**
 * Fila de "Notificaciones" del índice de Ajustes con el estado de ESTE
 * dispositivo, para no obligar a entrar en la subpágina solo para comprobarlo.
 * En el primer render no muestra valor (evita desajuste de hidratación) y, si no
 * hay service worker registrado, se queda sin valor en vez de mentir.
 */
export function PushStatusRow() {
  const [status, setStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (active) setStatus("No disponible");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (active) setStatus(sub ? "Activadas" : "Desactivadas");
    }
    check();
    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingsLinkRow
      href="/ajustes/notificaciones"
      icon={Bell}
      label="Notificaciones"
      value={status}
    />
  );
}
