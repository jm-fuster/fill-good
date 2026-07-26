"use client";

import { createContext, Suspense, use, useContext } from "react";

import { useRealtimeList } from "@/features/shopping-list/use-realtime-list";

/** Metadatos de la lista activa para el badge de la navbar. */
export type NavListBadge = { listId: string | null; pendingCount: number };

/**
 * Nº de artículos pendientes (sin marcar) de la lista activa, para el badge de
 * la navbar (bottom nav y sidebar). El servidor es la fuente de verdad, pero el
 * dato viaja como PROMESA (sin await en el shell): así el primer paint no espera
 * a esta query, y cada badge la resuelve con `use()` dentro de su `Suspense`
 * (aparece con su animación de "pop" cuando llega). Realtime refresca la ruta
 * cuando otro miembro cambia la lista, de modo que el badge se actualiza.
 */
const NavListCountContext = createContext<Promise<NavListBadge> | null>(null);

/**
 * Pendientes de la lista activa. SUSPENDE hasta que el dato llega del servidor:
 * llámalo solo en componentes hoja envueltos en `<Suspense>` (nunca en la raíz
 * de la nav, o el shell entero esperaría al badge otra vez).
 */
export function useNavListCount(): number {
  const badge = useContext(NavListCountContext);
  if (!badge) return 0;
  return use(badge).pendingCount;
}

/**
 * La suscripción Realtime necesita el `listId` ya resuelto; este puente se
 * suspende solo (fallback nulo) sin retener el resto del árbol.
 */
function RealtimeBadgeBridge() {
  const badge = useContext(NavListCountContext);
  const listId = badge ? use(badge).listId : null;
  // Suscripción app-wide con su propia clave de canal ("badge") para no chocar
  // con la de la vista de /lista. Con listId vacío no se suscribe.
  useRealtimeList(listId ?? "", "badge");
  return null;
}

export function NavListCountProvider({
  badge,
  children,
}: {
  badge: Promise<NavListBadge>;
  children: React.ReactNode;
}) {
  return (
    <NavListCountContext.Provider value={badge}>
      <Suspense>
        <RealtimeBadgeBridge />
      </Suspense>
      {children}
    </NavListCountContext.Provider>
  );
}
