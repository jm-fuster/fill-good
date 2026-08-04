"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CircleCheck, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MenuEntry } from "../queries";
import { slotLabel } from "../slots";

/**
 * Lo de hoy, encima de la semana (E). Existe porque la tarjeta del día vive en
 * su sitio del calendario: de miércoles en adelante queda a varias tarjetas de
 * scroll, y lo que uno viene a hacer a esta pantalla la mayoría de los días es
 * saber qué toca hoy y decir que ya está cocinado.
 *
 * **Solo aparece si hay algo que hacer**, y eso es lo que la separa de ser una
 * copia de la tarjeta del día:
 *  - platos de hoy sin marcar → los nombra y ofrece el «cocinado» a un toque;
 *  - hoy sin nada planificado → aloja «¿Qué hago hoy?», que es su respuesta;
 *  - hoy ya todo cocinado → no se dibuja (no hay nada que decir que la tarjeta
 *    no diga ya).
 *
 * Sí repite el nombre del plato que está debajo, y es a conciencia: una tira de
 * «lo siguiente» tiene que decir de qué habla. Lo que NO duplica es la función
 * —aquí no se edita ni se añade, para eso está la tarjeta—, así que el nombre va
 * como texto y no como botón.
 *
 * Al marcar el último plato la tira desaparece: quien la mueve es la capa
 * optimista de `MenuView`, o sea que el hueco se cierra en el mismo gesto y no
 * al volver del servidor.
 */
export function TodayStrip({
  today,
  entries,
  onMarkCooked,
  markingId,
  onAskTonight,
  askingTonight,
}: {
  /** Fecha local de hoy en ISO. */
  today: string;
  /**
   * Platos de HOY en orden de hueco (desayuno → comida → cena), ya filtrados a
   * los que faltan por marcar. Vacío = hoy no hay nada planificado, que es el
   * otro caso con algo que decir.
   */
  entries: MenuEntry[];
  onMarkCooked: (entry: MenuEntry) => void;
  /** Id del plato que se está guardando: el spinner va solo en SU botón. */
  markingId: string | null;
  onAskTonight: () => void;
  askingTonight: boolean;
}) {
  return (
    <section
      aria-label="Hoy"
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 print:hidden"
    >
      <p className="text-sm font-medium">
        Hoy{" "}
        <span className="font-normal text-muted-foreground capitalize">
          · {format(parseISO(today), "EEEE d", { locale: es })}
        </span>
      </p>

      {entries.length === 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            No tienes nada planificado.
          </p>
          <Button
            variant="outline"
            onClick={onAskTonight}
            loading={askingTonight}
            className="self-start"
          >
            <Lightbulb aria-hidden />
            {askingTonight ? "Pensando…" : "¿Qué hago hoy?"}
          </Button>
        </>
      ) : (
        entries.map((entry) => {
          const text = entry.recipeName ?? entry.freeText ?? "";
          return (
            <div key={entry.id} className="flex items-center gap-2">
              {/*
                El recorte va en el PÁRRAFO y el rótulo del hueco dentro de él.
                Con `line-clamp` en un span suelto, el span deja de ser en línea
                (pasa a ser un bloque) y «comida» se iba a su propia línea encima
                del plato: dos líneas por plato y la tira a 166px con dos, que es
                justo la altura que se venía a ahorrar.
              */}
              <p className="line-clamp-2 min-w-0 flex-1 text-sm">
                <span className="text-xs text-muted-foreground">
                  {slotLabel(entry.slot)}
                </span>{" "}
                {text}
              </p>
              {/* Mismo icono y mismo aria-label que la acción rápida de la
                  tarjeta: es la misma acción, y verla distinta la haría parecer
                  otra cosa. */}
              <Button
                variant="outline"
                size="icon"
                aria-label={`Marcar como cocinado: ${text}`}
                loading={markingId === entry.id}
                onClick={() => onMarkCooked(entry)}
                className="shrink-0 text-muted-foreground"
              >
                <CircleCheck aria-hidden className="size-5" />
              </Button>
            </div>
          );
        })
      )}
    </section>
  );
}
