"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageSearch, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { safeAction } from "@/lib/action-error";
import { getWeekStart, todayLocalISO } from "@/lib/dates";
import { trackFromClient } from "@/features/usage/track";
import { setPantryReviewEnabledAction } from "../actions";
import type { PantryReviewEntry } from "../queries";
// Diferido: esta tarjeta vive en el shell, o sea en TODAS las rutas, y el
// modal arrastra `ProductIcon` y con él el registro de iconos (~78 KB gz).
// Importado directo, ese registro se cargaba en /ajustes, /perfil o /precios,
// que no pintan un solo icono de producto, aunque nadie abriera el repaso.
const PantryReviewModal = dynamic(
  () => import("./pantry-review-modal").then((m) => m.PantryReviewModal),
  { ssr: false },
);

/**
 * Snooze diario y silencio semanal viven en COOKIES por dispositivo, no en la
 * base: son "molestia personal", no dato del hogar. Que un miembro aparte la
 * pregunta hoy no debe callarla para el otro, que puede estar en la cocina y
 * contestarla en veinte segundos. El estado durable del hogar son las dos
 * columnas de `households` (activado, y cuándo se repasó por última vez).
 */
function setCookie(name: string, value: string, days: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${days * 86_400}; samesite=lax`;
}

/**
 * Tarjeta del repaso semanal de despensa: aparece en cualquier página de la app,
 * porque el insight es el mismo que el del repaso de platos — nadie entra al
 * inventario a corregir cantidades. Se aprovechan las visitas que ya ocurren
 * (mirar la lista, apuntar algo) para pedir veinte segundos.
 *
 * Recibe los candidatos ya elegidos por el servidor (`PantryReviewBanner`), así
 * que abrir el repaso no navega ni vuelve a consultar.
 */
export function PantryReviewCard({ items }: { items: PantryReviewEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [, startDisable] = useTransition();

  if (dismissed) return null;

  /*
    Medición de uso: abrir y aplazar solo los ve el navegador —aplazar es una
    cookie, no pasa por el servidor—, así que se avisan desde aquí. Responder y
    desactivar se anotan en sus propias acciones.
  */
  function openReview() {
    setOpen(true);
    trackFromClient({
      name: "pantry_review_opened",
      props: { offered: items.length },
    });
  }

  /** La X no niega nada: solo aparta la pregunta hasta mañana. */
  function snooze() {
    setCookie("pantry_review_snooze", todayLocalISO(), 2);
    setDismissed(true);
    trackFromClient({
      name: "pantry_review_postponed",
      props: { until: "tomorrow" },
    });
  }

  function silenceWeek() {
    setCookie("pantry_review_silenced_week", getWeekStart(), 14);
    setOpen(false);
    setDismissed(true);
    toast.success("No preguntaremos más esta semana");
    trackFromClient({
      name: "pantry_review_postponed",
      props: { until: "week" },
    });
  }

  function disable() {
    setOpen(false);
    setDismissed(true);
    startDisable(async () => {
      const r = await safeAction(
        setPantryReviewEnabledAction(false),
        "No se pudo guardar la preferencia.",
      );
      if (r.error) {
        toast.error(r.error);
        setDismissed(false);
        return;
      }
      toast.success("Puedes reactivarlo en Ajustes");
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
          <PackageSearch className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">¿Repasamos la despensa?</p>
            {/* Se promete el coste, no el beneficio: lo que frena a alguien que
                va con prisa es no saber si esto son veinte segundos o diez
                minutos. El número de productos ya dice que tiene final. */}
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {items.length} productos que llevan tiempo sin mirarse. Un toque
              cada uno.
            </p>
          </div>
          <Button size="sm" onClick={openReview} className="self-start">
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

      <PantryReviewModal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          /*
            El refresco se aplaza al cierre, igual que en el repaso de platos: si
            se refrescara tras cada respuesta, al contestar la última el servidor
            dejaría de renderizar esta tarjeta y el modal —que vive dentro—
            desaparecería de golpe en vez de despedirse.
          */
          if (!o) router.refresh();
        }}
        items={items}
        onSilenceWeek={silenceWeek}
        onDisable={disable}
      />
    </>
  );
}
