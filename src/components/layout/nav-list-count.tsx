"use client";

import {
  createContext,
  Suspense,
  use,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { fetchListBadgeAction } from "@/features/shopping-list/actions";
import { useCoalescedHeal } from "@/features/shopping-list/list-sync";
import { useRealtimeList } from "@/features/shopping-list/use-realtime-list";

/** Metadatos de la lista activa para el badge de la navbar. */
export type NavListBadge = { listId: string | null; pendingCount: number };

/** Agrupa una ráfaga de cambios en una sola relectura de la cuenta. */
const BADGE_HEAL_MS = 400;

/**
 * Nº de artículos pendientes (sin marcar) de la lista activa, para el badge de
 * la navbar (bottom nav y sidebar). El servidor da la SEMILLA, pero el badge se
 * mantiene solo:
 *
 *  · si una vista de la lista está montada (`/lista` o el modo compra), ella
 *    publica la cuenta exacta en cada toque: cero viajes al servidor;
 *  · si no, esta suscripción relee SOLO la cuenta cuando algo cambia.
 *
 * Antes cualquier cambio de la lista disparaba un `router.refresh()` desde aquí,
 * y como esto vive en el shell, eso re-renderizaba en el servidor la pantalla
 * que estuvieras mirando —cualquiera— por cada toque de cualquiera de los dos
 * móviles. Era la mitad de la "sensación de lag" de la lista compartida.
 *
 * La semilla viaja como PROMESA (sin await en el shell): así el primer paint no
 * espera a esta query, y cada badge la resuelve con `use()` dentro de su
 * `Suspense`.
 */
const SeedContext = createContext<Promise<NavListBadge> | null>(null);

/** Cuenta viva del cliente; null = todavía manda la semilla del servidor. */
const CountContext = createContext<number | null>(null);

type BadgeControls = {
  /** Publica la cuenta exacta (la usa la vista de la lista montada). */
  publish: (count: number) => void;
  /**
   * Una vista de la lista se hace cargo de la cuenta mientras esté montada.
   * Devuelve la función para soltarla al desmontar.
   */
  claim: () => () => void;
  isClaimed: () => boolean;
};

const ControlsContext = createContext<BadgeControls | null>(null);

/**
 * Pendientes de la lista activa. SUSPENDE hasta que llega la semilla del
 * servidor: llámalo solo en componentes hoja envueltos en `<Suspense>` (nunca en
 * la raíz de la nav, o el shell entero esperaría al badge otra vez).
 */
export function useNavListCount(): number {
  const seed = useContext(SeedContext);
  const live = useContext(CountContext);
  // `use` sí se puede llamar dentro de un condicional (a diferencia del resto de
  // hooks), y el contexto no cambia mientras el shell vive.
  const seeded = seed ? use(seed).pendingCount : 0;
  return live ?? seeded;
}

/**
 * Control del badge para las vistas de la lista: mientras una está montada, ella
 * es la que sabe la cuenta exacta (incluye lo optimista que aún no ha
 * confirmado el servidor), así que la publica y silencia la relectura de aquí.
 */
export function useNavListBadge(): BadgeControls {
  const controls = useContext(ControlsContext);
  // Identidad estable: las vistas reclaman en un efecto, y si esto cambiara con
  // cada cuenta nueva reclamarían y soltarían en bucle.
  return useMemo(
    () =>
      controls ?? {
        publish: () => {},
        claim: () => () => {},
        isClaimed: () => false,
      },
    [controls],
  );
}

/**
 * La suscripción Realtime necesita el `listId` ya resuelto; este puente se
 * suspende solo (fallback nulo) sin retener el resto del árbol.
 */
function RealtimeBadgeBridge() {
  const seed = useContext(SeedContext);
  const listId = seed ? use(seed).listId : null;
  const controls = useContext(ControlsContext);

  const heal = useCoalescedHeal(async () => {
    // Con una vista de la lista montada, la cuenta ya la publica ella.
    if (!controls || controls.isClaimed()) return;
    const badge = await fetchListBadgeAction();
    controls.publish(badge.pendingCount);
  });

  // Suscripción app-wide con su propia clave de canal ("badge") para no chocar
  // con la de la vista de /lista. Con listId vacío no se suscribe.
  useRealtimeList(listId ?? "", {
    channelKey: "badge",
    onDelta: () => heal(BADGE_HEAL_MS),
    onDesync: () => heal(BADGE_HEAL_MS),
  });
  return null;
}

export function NavListCountProvider({
  badge,
  children,
}: {
  badge: Promise<NavListBadge>;
  children: React.ReactNode;
}) {
  const [count, setCount] = useState<number | null>(null);
  const claims = useRef(0);

  const controls = useMemo<BadgeControls>(
    () => ({
      publish: setCount,
      claim: () => {
        claims.current += 1;
        return () => {
          claims.current -= 1;
        };
      },
      isClaimed: () => claims.current > 0,
    }),
    [],
  );

  return (
    <SeedContext.Provider value={badge}>
      <ControlsContext.Provider value={controls}>
        <CountContext.Provider value={count}>
          <Suspense>
            <RealtimeBadgeBridge />
          </Suspense>
          {children}
        </CountContext.Provider>
      </ControlsContext.Provider>
    </SeedContext.Provider>
  );
}
