"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";
import { ChefHat, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getWeekStart, relativeDaysLabel, todayLocalISO } from "@/lib/dates";
import { setCheckinEnabledAction } from "../actions";
import type { PendingCheckinEntry } from "../queries";
import { slotLabel, type SlotDef } from "../slots";
// Diferido por lo mismo que el modal del repaso de despensa: la tarjeta va en
// el shell y el modal (descuento, oferta de lista…) solo hace falta al abrirlo.
const CookedCheckinModal = dynamic(
  () => import("./cooked-checkin-modal").then((m) => m.CookedCheckinModal),
  { ssr: false },
);

/**
 * Página que YA tiene su propia puerta al repaso: /menus enseña «Repasar días
 * pasados (N)» bajo el selector de semana. Ahí la tarjeta sobra.
 */
const ROUTE_WITH_OWN_CHECKIN = "/menus";

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
 * Tarjeta del repaso de platos (R3): aparece en cualquier página de la app
 * cuando hay platos pasados sin resolver, porque el insight de partida es que
 * nadie entra al menú a marcar — la gente entra a la lista o a escanear un
 * ticket. Aprovecha esas visitas que ya ocurren. Con una excepción:
 * `ROUTE_WITH_OWN_CHECKIN`, donde la página ya ofrece el repaso por su cuenta.
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [, startDisable] = useTransition();

  if (dismissed) return null;
  /*
    Dos puertas al mismo repaso en la misma pantalla decían lo mismo dos veces,
    con estilos distintos y una encima del título de la página. El argumento de
    esta tarjeta es aprovechar las visitas a OTRAS páginas (nadie entra al menú
    a marcar); donde el botón local ya existe, no aporta.

    `usePathname` es la única vía: quien la monta es el shell, un Server
    Component, y en Next 16 la ruta actual solo se lee desde el cliente. El coste
    es que la consulta del servidor se hace y se tira en /menus, igual que hoy.
  */
  if (pathname === ROUTE_WITH_OWN_CHECKIN) return null;

  // Si todo lo pendiente es de ayer, la pregunta puede ser concreta.
  const allYesterday = entries.every(
    (e) => relativeDaysLabel(e.date) === "ayer",
  );
  /*
    Una línea, no el inventario de la semana: enumerar los platos con su hueco
    entre paréntesis se comía cuatro líneas por encima del <h1> —y los nombres
    largos traen sus propios paréntesis dentro—. Los nombres ya están en el
    modal, que es donde hay que reconocerlos para contestar. Con uno solo sí se
    nombra: es corto y hace la pregunta concreta.
  */
  const only = entries.length === 1 ? entries[0] : undefined;
  const summary = only
    ? `Tenías ${only.name} (${slotLabel(only.slot).toLowerCase()}).`
    : `Tenías ${entries.length} platos planificados.`;

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
      const r = await safeAction(
        setCheckinEnabledAction(false),
        "No se pudo guardar la preferencia.",
      );
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
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {summary}
            </p>
          </div>
          {/* Tamaño por defecto (h-11), igual que en la tarjeta de despensa:
              `sm` (36 px) no llega al touch target de 44 px. */}
          <Button onClick={() => setOpen(true)} className="self-start">
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
