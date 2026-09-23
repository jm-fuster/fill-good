"use client";

import { useEffect } from "react";

import { todayLocalISO } from "@/lib/dates";
import { recordVisitAction } from "../actions";

/**
 * Anota la visita del día al montarse el shell. No pinta nada.
 *
 * Una vez por montaje, no por página: el shell sigue montado al navegar entre
 * pestañas, así que esto cuenta arranques de la app (y un cambio de hogar, que
 * lo remonta con su `key`), y la base se queda con uno por día de todas formas.
 *
 * Y otra vez al VOLVER a primer plano si ha cambiado el día. Una PWA instalada
 * no se cierra: se queda en segundo plano y vuelve días después sin remontar
 * nada, así que con el aviso solo al montar esas vueltas no se anotaban y «quién
 * vuelve» —la pregunta para la que existe `usage_days`— salía por debajo de la
 * realidad justo en quien más usa la app. El día que se compara vive en
 * MEMORIA, no en el dispositivo: la medición no guarda nada en el navegador
 * (ver la base legal en AGENTS.md), y la deduplicación de verdad la hace la
 * clave primaria de la tabla.
 */
export function VisitPing() {
  useEffect(() => {
    let lastDay = todayLocalISO();
    void recordVisitAction().catch(() => {});

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const today = todayLocalISO();
      if (today === lastDay) return;
      lastDay = today;
      void recordVisitAction().catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}
