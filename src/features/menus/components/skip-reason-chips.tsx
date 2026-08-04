"use client";

import { Button } from "@/components/ui/button";
import {
  SKIP_REASONS,
  SKIP_REASON_LABEL,
  type SkipReason,
} from "../skip-reason";

/**
 * Los cuatro motivos de «no se hizo», a un toque. Aparecen DESPUÉS de descartar
 * el plato —nunca antes— en las tres pantallas que preguntan: la tira de hoy, el
 * repaso de días pasados y el panel del plato.
 *
 * Contestar es opcional y se puede corregir: el chip ya elegido vuelve a pulsarse
 * para quitarlo, así que funciona como interruptor y no como un formulario que
 * haya que enviar. Por eso el grupo no tiene botón de guardar; cada toque escribe.
 *
 * Tamaño por defecto (no `sm`) a propósito: esto se pulsa con el pulgar y los
 * 44px del target valen aquí igual que en el resto de la app, aunque cuesten dos
 * filas en una pantalla estrecha. Es una pregunta que dura un gesto.
 */
export function SkipReasonChips({
  value,
  onPick,
  busy,
}: {
  /** Motivo ya guardado, si hay (tal cual viene de la base). */
  value: string | null;
  /** `null` = quitar el motivo que hubiera. */
  onPick: (reason: SkipReason | null) => void;
  busy?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs text-muted-foreground">
        ¿Por qué no?
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {SKIP_REASONS.map((reason) => {
          const active = value === reason;
          return (
            <Button
              key={reason}
              type="button"
              variant={active ? "secondary" : "outline"}
              aria-pressed={active}
              disabled={busy}
              onClick={() => onPick(active ? null : reason)}
            >
              {SKIP_REASON_LABEL[reason]}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
