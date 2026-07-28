"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChefHat, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getWeekStart, relativeDaysLabel, todayLocalISO } from "@/lib/dates";
import { setCheckinEnabledAction } from "../actions";
import type { PendingCheckinEntry } from "../queries";
import { slotLabel, type SlotDef } from "../slots";
import { CookedCheckinModal } from "./cooked-checkin-modal";

/** Cuántos platos se nombran en la tarjeta antes de resumir con "y N más". */
const NAMES_SHOWN = 3;

/**
 * Snooze diario y silencio semanal viven en COOKIES por dispositivo, no en la
 * base de datos: son "molestia personal", no dato del hogar. Que un miembro
 * silencie no debe callar la pregunta al resto —puede que el otro sí sepa si se
 * cocinó—. El único estado durable del hogar es `checkin_enabled`.
 */
function setCookie(name: string, value: string, days: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${days * 86_400}; samesite=lax`;
}

/**
 * Tarjeta del repaso de platos (R3): aparece en CUALQUIER página de la app
 * cuando hay platos pasados sin resolver, porque el insight de partida es que
 * nadie entra al menú a marcar — la gente entra a la lista o a escanear un
 * ticket. Aprovecha esas visitas que ya ocurren.
 *
 * Recibe los pendientes ya cargados por el servidor (`CookedCheckinBanner`), así
 * que abrir el repaso no navega ni vuelve a consultar.
 */
export function CookedCheckinCard({
  entries,
  slots,
}: {
  entries: PendingCheckinEntry[];
  slots: SlotDef[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [, startDisable] = useTransition();

  if (dismissed) return null;

  const shown = entries.slice(0, NAMES_SHOWN);
  const extra = entries.length - shown.length;
  const list = shown
    .map((e) => `${e.name} (${slotLabel(e.slot).toLowerCase()})`)
    .join(", ");
  // Si todo lo pendiente es de ayer, la pregunta puede ser concreta.
  const allYesterday = entries.every(
    (e) => relativeDaysLabel(e.date) === "ayer",
  );

  /** La X no niega nada: solo aparta la pregunta hasta mañana. */
  function snooze() {
    setCookie("menu_checkin_snooze", todayLocalISO(), 2);
    setDismissed(true);
  }

  function silenceWeek() {
    setCookie("menu_checkin_silenced_week", getWeekStart(), 14);
    setOpen(false);
    setDismissed(true);
    toast.success("No preguntaremos más esta semana");
  }

  /**
   * "No volver a preguntar": apaga el repaso para todo el hogar. Se cierra ya
   * mismo —quien pulsa esto no quiere seguir viendo el modal mientras guarda— y
   * si la escritura falla, la tarjeta vuelve.
   */
  function disable() {
    setOpen(false);
    setDismissed(true);
    startDisable(async () => {
      const r = await setCheckinEnabledAction(false);
      if (r.error) {
        toast.error(r.error);
        setDismissed(false);
        return;
      }
      toast.success("Puedes reactivarlo en Ajustes del menú");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex items-start gap-3 rounded-xl border bg-card p-3 print:hidden">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
        >
          <ChefHat className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">
              {allYesterday ? "¿Qué tal ayer?" : "¿Qué tal estos días?"}
            </p>
            <p className="text-xs text-muted-foreground">
              Tenías {list}
              {extra > 0 ? ` y ${extra} más` : ""}.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            className="self-start"
          >
            Repasar
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Recordármelo mañana"
          onClick={snooze}
        >
          <X aria-hidden className="text-muted-foreground" />
        </Button>
      </div>

      <CookedCheckinModal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          /*
            El refresco se aplaza al cierre a propósito: si se refrescara tras
            cada respuesta, al contestar la última el servidor dejaría de
            renderizar esta tarjeta y el modal —que vive dentro— desaparecería
            de golpe, en vez de despedirse. El modal ya retira las filas
            contestadas por su cuenta.
          */
          if (!o) router.refresh();
        }}
        entries={entries}
        slots={slots}
        onSilenceWeek={silenceWeek}
        onDisable={disable}
      />
    </>
  );
}
