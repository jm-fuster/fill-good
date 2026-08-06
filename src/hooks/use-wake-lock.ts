"use client";

import * as React from "react";

/** Sentinel mínimo del Screen Wake Lock API (evita depender del lib DOM). */
type WakeLockLike = { release: () => Promise<void> };

/**
 * Mantiene la pantalla encendida mientras el componente esté montado, y la
 * suelta al salir.
 *
 * Lo piden las dos pantallas que la app llama «modo»: la compra y el cocinado.
 * Las dos comparten la misma situación —el móvil apoyado, las manos ocupadas, la
 * vista consultándose cada pocos minutos— y en las dos el apagado automático es
 * exactamente el momento en que la app estorba: hay que despertar el teléfono con
 * las manos llenas de bolsas o de harina.
 *
 * Se vuelve a pedir al regresar de segundo plano porque el sistema libera el
 * bloqueo al ocultar la pestaña, y una vez liberado no se restaura solo: sin esto,
 * atender una llamada a mitad de la compra dejaba la pantalla apagándose el resto
 * del rato, que es el fallo más difícil de atribuir a nada.
 *
 * Feature-detect y `try/catch`: donde no existe (Safari viejo, escritorio) o el
 * navegador lo deniega, degrada en silencio. No hay nada que contarle al usuario,
 * porque no hay nada que pueda hacer al respecto.
 *
 * @param enabled Permite apagarlo sin desmontar quien lo usa. Por defecto activo.
 */
export function useWakeLock(enabled = true) {
  const lock = React.useRef<WakeLockLike | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
    };
    let cancelled = false;

    async function request() {
      try {
        if (!nav.wakeLock) return;
        const sentinel = await nav.wakeLock.request("screen");
        // El efecto pudo limpiarse mientras la promesa viajaba: sin esto, el
        // bloqueo recién concedido se quedaría vivo con la pantalla ya cerrada.
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        lock.current = sentinel;
      } catch {
        // Denegado o no disponible: seguimos sin bloqueo.
      }
    }

    request();
    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, [enabled]);
}
