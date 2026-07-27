import { Sprout } from "lucide-react";

import type { WasteStreak } from "../waste";

/**
 * Racha sin desperdicio (G3). Solo aparece cuando el mes va limpio: si ya hay
 * algo tirado, la línea de desperdicio cuenta la verdad y añadir aquí "tu récord
 * fueron 8 semanas" sonaría a restregarlo. Esa condición la decide quien la
 * pinta, no este componente.
 *
 * El récord se menciona únicamente cuando la racha en curso NO es la mejor, para
 * dar contexto sin convertirlo en una vara de medir permanente.
 */
export function WasteStreakLine({ streak }: { streak: WasteStreak }) {
  if (streak.currentWeeks < 1) return null;

  return (
    <p className="flex items-center gap-1.5 text-sm text-success">
      <Sprout className="size-4 shrink-0" aria-hidden />
      {streak.currentWeeks === 1
        ? "1 semana sin tirar comida"
        : `${streak.currentWeeks} semanas sin tirar comida`}
      {streak.isBest ? (
        <span className="text-xs text-muted-foreground">· tu mejor racha</span>
      ) : (
        <span className="text-xs text-muted-foreground">
          · tu récord son {streak.bestWeeks}
        </span>
      )}
    </p>
  );
}
