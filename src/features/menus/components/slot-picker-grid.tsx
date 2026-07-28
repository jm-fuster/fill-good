"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";
import type { SlotDef } from "../slots";

/**
 * Rejilla de destinos día × hueco (N1). La comparten el drawer de un plato
 * («Mover a…» / «Duplicar en…») y el repaso de platos, donde es una VISTA del
 * mismo `ResponsiveModal` en vez de un modal nuevo: encadenar dos modales hace
 * que el cierre por historial cierre el segundo solo.
 */
export function SlotPickerGrid({
  days,
  slots,
  onPick,
  busy,
  originKey,
  originBlocked,
  isBlocked,
}: {
  /** Días candidatos (YYYY-MM-DD), normalmente los 7 de una semana. */
  days: string[];
  slots: SlotDef[];
  onPick: (date: string, slot: string) => void;
  /** Hay una acción en curso: todo deshabilitado. */
  busy?: boolean;
  /** `${date}|${slot}` del hueco de origen, para señalarlo con `aria-current`. */
  originKey?: string | null;
  /** El origen no es un destino válido (mover) frente a sí lo es (duplicar). */
  originBlocked?: boolean;
  /** Reglas extra de bloqueo (p. ej. no mover a futuro un plato ya cocinado). */
  isBlocked?: (date: string, slot: string) => boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        slots.length === 3 ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      {days.flatMap((date) =>
        slots.map((slot) => {
          const isOrigin = originKey === `${date}|${slot.key}`;
          const blocked =
            (isOrigin && originBlocked === true) ||
            isBlocked?.(date, slot.key) === true;
          const disabled = blocked || busy === true;
          return (
            <button
              key={`${date}|${slot.key}`}
              type="button"
              disabled={disabled}
              onClick={() => onPick(date, slot.key)}
              aria-current={isOrigin ? "true" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-start gap-0.5 rounded-lg border p-2 text-left transition-colors",
                disabled ? "opacity-50" : "hover:bg-muted hover:border-primary",
                isOrigin && originBlocked && "border-primary bg-muted",
              )}
            >
              <span className="text-sm font-medium capitalize">
                {format(parseISO(date), "EEE d", { locale: es })}
              </span>
              <span className="text-xs text-muted-foreground">
                {isOrigin && originBlocked ? "Aquí" : slot.label}
              </span>
            </button>
          );
        }),
      )}
    </div>
  );
}
