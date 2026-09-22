"use client";

import { useEffect } from "react";

import { recordVisitAction } from "../actions";

/**
 * Anota la visita del día al montarse el shell. No pinta nada.
 *
 * Una vez por montaje, no por página: el shell sigue montado al navegar entre
 * pestañas, así que esto cuenta arranques de la app (y un cambio de hogar, que
 * lo remonta con su `key`), y la base se queda con uno por día de todas formas.
 */
export function VisitPing() {
  useEffect(() => {
    void recordVisitAction().catch(() => {});
  }, []);
  return null;
}
