"use client";

import { createContext, useContext } from "react";

import { useRealtimeList } from "@/features/shopping-list/use-realtime-list";

/**
 * Nº de artículos pendientes (sin marcar) de la lista activa, para el badge de
 * la navbar (bottom nav y sidebar). El servidor es la fuente de verdad: el valor
 * llega como prop desde el layout y este proveedor solo lo reparte por contexto
 * y refresca la ruta cuando Realtime avisa de cambios en la lista (aunque estés
 * en otra pantalla), de modo que el layout se recalcule y el badge se actualice.
 */
const NavListCountContext = createContext(0);

export function useNavListCount(): number {
  return useContext(NavListCountContext);
}

export function NavListCountProvider({
  listId,
  pendingCount,
  children,
}: {
  listId: string | null;
  pendingCount: number;
  children: React.ReactNode;
}) {
  // Suscripción app-wide con su propia clave de canal ("badge") para no chocar
  // con la de la vista de /lista.
  useRealtimeList(listId ?? "", "badge");
  return (
    <NavListCountContext.Provider value={pendingCount}>
      {children}
    </NavListCountContext.Provider>
  );
}
