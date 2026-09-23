"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { SettingsLinkRow } from "@/features/settings/components/settings-list";
import { getMyPushPrefsAction } from "../actions";

/**
 * Fila de "Notificaciones" del índice de Ajustes con el estado de ESTE
 * dispositivo, para no obligar a entrar en la subpágina solo para comprobarlo.
 * En el primer render no muestra valor (evita desajuste de hidratación) y, si no
 * hay service worker registrado, se queda sin valor en vez de mentir.
 *
 * «Activadas» exige lo mismo que la tarjeta de la subpágina (`PushCard`): que
 * el navegador tenga la suscripción Y que el servidor la tenga guardada. Solo
 * con lo primero decía «Activadas» a quien había salido del hogar o tenía el
 * endpoint purgado —el navegador la conserva, pero no llega nada— y al entrar
 * la subpágina ofrecía «Activar»: las dos pantallas se contradecían.
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
      const saved = sub ? await getMyPushPrefsAction(sub.endpoint) : null;
      if (active) setStatus(saved ? "Activadas" : "Desactivadas");
    }
    // Sin red la lectura falla: sin valor, mejor que un estado inventado.
    check().catch(() => {});
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
