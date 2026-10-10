"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@clerk/nextjs";

import { useSupabaseBrowser } from "@/lib/supabase/client";
import type { ListDelta, ListItemRealtimeRow } from "./list-sync";

/**
 * Suscribe a los cambios de la lista y ENTREGA CADA CAMBIO (`onDelta`), en vez
 * de usarlo como timbre para recargar la página entera.
 *
 * Recargar la ruta por cada evento era lo que hacía que la lista fuera a
 * tirones: cada toque de cualquiera de los dos móviles disparaba un render
 * completo de `/lista` (sugerencias, catálogo, pasillos, tiendas…) y varias
 * respuestas en vuelo a la vez, que llegaban desordenadas. Con el cambio suelto,
 * lo que otro miembro toca se aplica en memoria: sin viaje al servidor y sin
 * posibilidad de que una respuesta rezagada pise lo nuevo.
 *
 * `onDesync` avisa de los momentos en los que puede haberse perdido algún
 * evento, para que quien lo use relea la lista una vez:
 *  · `subscribed` — al suscribirse y en cada reconexión;
 *  · `visible` — al volver la pestaña a primer plano (el móvil corta el socket
 *    al dormirse, y el token de Clerk puede haber caducado mientras dormía);
 *  · `degraded` — sondeo mientras el canal está caído;
 *  · `heartbeat` — latido de seguridad con la pestaña a la vista, que acota
 *    cuánto puede divergir la pantalla si un evento no llega nunca.
 */

export type DesyncReason = "subscribed" | "visible" | "degraded" | "heartbeat";

/** Los tokens de Clerk caducan ~60 s: se renueva el auth de Realtime antes. */
const TOKEN_REFRESH_MS = 50_000;
/** Latido de seguridad con la pestaña visible (ver `onDesync`). */
const HEARTBEAT_MS = 30_000;
/** Sondeo mientras el canal está caído. */
const DEGRADED_MS = 8_000;

type Handlers = {
  onDelta?: (delta: ListDelta) => void;
  onDesync?: (reason: DesyncReason) => void;
  /**
   * Distingue suscripciones que conviven para la misma lista (el badge de la
   * navbar y la vista de `/lista`), para que Supabase no las trate como el
   * mismo canal.
   */
  channelKey?: string;
};

/** Payload de Realtime, con lo mínimo que necesitamos tipado. */
type ChangePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

function toDelta(payload: ChangePayload): ListDelta | null {
  if (payload.eventType === "DELETE") {
    // Sin `replica identity full` el registro viejo solo trae la clave primaria
    // (y con el filtro por lista el evento ni llega); con ella, viene completo.
    const id = payload.old?.id;
    return typeof id === "string" ? { type: "delete", id } : null;
  }
  const row = payload.new as unknown as ListItemRealtimeRow | undefined;
  if (!row || typeof row.id !== "string") return null;
  return {
    type: payload.eventType === "INSERT" ? "insert" : "update",
    id: row.id,
    row,
  };
}

export function useRealtimeList(listId: string, handlers: Handlers = {}) {
  const supabase = useSupabaseBrowser();
  const { session } = useSession();
  const channelKey = handlers.channelKey ?? "view";

  // Los callbacks se leen por referencia para que la suscripción no se rehaga en
  // cada render (llegan como funciones nuevas cada vez). Este efecto va PRIMERO:
  // dentro del mismo commit se ejecuta antes que el de la suscripción.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!listId || !session || !supabase) return;
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let degraded: ReturnType<typeof setInterval> | null = null;

    const channel = supabase.channel(`shopping-list-${channelKey}-${listId}`);

    const desync = (reason: DesyncReason) => {
      if (!cancelled) latest.current.onDesync?.(reason);
    };

    const refreshAuth = async () => {
      const token = await session.getToken();
      if (cancelled || !token) return null;
      supabase.realtime.setAuth(token);
      return token;
    };

    const stopDegraded = () => {
      if (degraded === null) return;
      clearInterval(degraded);
      degraded = null;
    };

    const startDegraded = () => {
      if (degraded !== null || cancelled) return;
      degraded = setInterval(() => {
        if (document.visibilityState === "visible") desync("degraded");
      }, DEGRADED_MS);
    };

    const start = async () => {
      const token = await refreshAuth();
      if (cancelled || !token) return;
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "shopping_list_items",
            filter: `list_id=eq.${listId}`,
          },
          (payload) => {
            if (cancelled) return;
            const delta = toDelta(payload as unknown as ChangePayload);
            if (delta) latest.current.onDelta?.(delta);
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            stopDegraded();
            // Al (re)conectar, lo que pasara mientras el canal no estaba no ha
            // llegado a nadie: una relectura lo recupera.
            desync("subscribed");
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            startDegraded();
          }
        });

      heartbeat = setInterval(() => {
        if (document.visibilityState === "visible") desync("heartbeat");
      }, HEARTBEAT_MS);
    };

    start();

    const tokenTimer = setInterval(() => {
      void refreshAuth();
    }, TOKEN_REFRESH_MS);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // El token pudo caducar con la pestaña dormida (los timers no corren
      // fiablemente en segundo plano), así que primero se renueva el auth.
      void refreshAuth();
      desync("visible");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(tokenTimer);
      if (heartbeat !== null) clearInterval(heartbeat);
      stopDegraded();
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [listId, channelKey, session, supabase]);
}
