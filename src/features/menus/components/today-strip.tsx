"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChefHat, CircleCheck, CircleX, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MenuEntry } from "../queries";
import type { SkipReason } from "../skip-reason";
import { slotLabel } from "../slots";
import { SkipReasonChips } from "./skip-reason-chips";

/**
 * Lo de hoy, encima de la semana (E). Existe porque la tarjeta del día vive en
 * su sitio del calendario: de miércoles en adelante queda a varias tarjetas de
 * scroll, y lo que uno viene a hacer a esta pantalla la mayoría de los días es
 * saber qué toca hoy y decir qué pasó con ello.
 *
 * **Solo aparece si hay algo que hacer**, y eso es lo que la separa de ser una
 * copia de la tarjeta del día:
 *  - platos de hoy sin resolver → los nombra y ofrece las dos respuestas;
 *  - hoy sin nada planificado → aloja «¿Qué hago hoy?», que es su respuesta;
 *  - hoy ya todo resuelto → no se dibuja (no hay nada que decir que la tarjeta
 *    no diga ya).
 *
 * Las dos respuestas van juntas porque un plan de hoy se rompe tanto como se
 * cumple —se come fuera, se pide algo, no apetece—, y sin el «no» la única
 * salida era dejarlo sin contestar hasta que el repaso preguntara al día
 * siguiente. Descartar es un toque y el motivo es un segundo toque opcional en
 * la propia fila. Mover a otro día o quitarlo del menú siguen viviendo en el
 * panel del plato, que es quien tiene el selector de día: aquí solo se contesta
 * qué pasó.
 *
 * Sí repite el nombre del plato que está debajo, y es a conciencia: una tira de
 * «lo siguiente» tiene que decir de qué habla. Lo que NO duplica es la función
 * —aquí no se edita ni se añade, para eso está la tarjeta—, así que el nombre va
 * como texto y no como botón.
 *
 * Toda la escritura la lleva `MenuView` (ver el prop `skip`): esta tira es
 * presentación. No es simetría, es que el estado de la pregunta del motivo tiene
 * que sobrevivir a que la tira se desmonte, y quien decide si la tira existe es
 * el padre.
 */
export function TodayStrip({
  today,
  entries,
  cookableRecipeIds,
  onMarkCooked,
  markingId,
  skip,
  onAskTonight,
  askingTonight,
}: {
  /** Fecha local de hoy en ISO. */
  today: string;
  /**
   * Platos de HOY en orden de hueco (desayuno → comida → cena), ya filtrados a
   * los que faltan por resolver —más, si lo hay, el que está contestando el
   * motivo—. Vacío = hoy no hay nada planificado, que es el otro caso con algo
   * que decir.
   */
  entries: MenuEntry[];
  /**
   * Recetas con pasos escritos: solo esas ofrecen el modo cocinado. Sin este
   * dato la tira no puede saberlo —los pasos no viajan en la consulta de la
   * semana— y el botón llevaría la mitad de las veces a un callejón.
   */
  cookableRecipeIds: string[];
  onMarkCooked: (entry: MenuEntry) => void;
  /** Id del plato que se está guardando: el spinner va solo en SU botón. */
  markingId: string | null;
  /** Descarte y motivo, con el estado en el padre (ver `MenuView`). */
  skip: {
    /** Plato ya descartado al que se le está preguntando el motivo, o null. */
    askingFor: string | null;
    /** Id del plato con una escritura de descarte en curso. */
    busyId: string | null;
    onSkip: (entry: MenuEntry) => void;
    onPickReason: (entryId: string, reason: SkipReason | null) => void;
    /** Cerrar la pregunta sin contestarla: el plato ya quedó descartado. */
    onClose: () => void;
  };
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
          const busy = skip.busyId === entry.id;
          /*
            Fila ya descartada: se queda enseñando el motivo en vez de retirarse,
            igual que la del repaso se queda enseñando el descuento. El nombre
            sigue arriba —atenuado, que ya está resuelto—: si no, los cuatro chips
            preguntan por un plato que no se ve.
          */
          if (skip.askingFor === entry.id) {
            return (
              <div
                key={entry.id}
                className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200"
              >
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  <span className="text-xs">{slotLabel(entry.slot)}</span> {text}
                </p>
                {/*
                  Sin motivo marcado: aquí la pregunta es de un solo disparo —al
                  contestar, la fila se va— así que no hay nada que reflejar. El
                  motivo ya guardado sí se ve pulsado en el panel del plato, que
                  es donde se puede volver a mirar y corregir.
                */}
                <SkipReasonChips
                  value={null}
                  busy={busy}
                  onPick={(reason) => skip.onPickReason(entry.id, reason)}
                />
                <Button
                  variant="ghost"
                  onClick={skip.onClose}
                  disabled={busy}
                  className="self-start"
                >
                  Ahora no
                </Button>
              </div>
            );
          }
          const cookable =
            entry.recipeId !== null && cookableRecipeIds.includes(entry.recipeId);
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
              {/*
                Ponerse a cocinar, de un toque y desde donde ya estás mirando qué
                toca hoy. Es el tercer botón de una fila que nació con dos, y se
                gana el sitio porque es la acción que se hace ANTES que las otras
                dos: el ✓ y la ✗ contestan qué pasó, y esto es lo que pasa. Solo
                sale si la receta tiene pasos que seguir; si no, no hay modo al
                que entrar y el panel del plato sigue siendo el sitio de leerla.
              */}
              {cookable ? (
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  aria-label={`Cocinar paso a paso: ${text}`}
                  className="shrink-0 text-muted-foreground"
                >
                  <Link
                    href={`/recetas/${entry.recipeId}/cocinar?entrada=${entry.id}`}
                  >
                    <ChefHat aria-hidden className="size-5" />
                  </Link>
                </Button>
              ) : null}
              {/* Mismo icono y mismo aria-label que la acción rápida de la
                  tarjeta: es la misma acción, y verla distinta la haría parecer
                  otra cosa. */}
              <Button
                variant="outline"
                size="icon"
                aria-label={`Marcar como cocinado: ${text}`}
                loading={markingId === entry.id}
                disabled={busy}
                onClick={() => onMarkCooked(entry)}
                className="shrink-0 text-muted-foreground"
              >
                <CircleCheck aria-hidden className="size-5" />
              </Button>
              {/*
                El «no» va con el icono hermano del ✓ y no con el `CalendarOff`
                que usa el panel: aquí los dos botones se leen juntos y de un
                vistazo, y para eso tienen que ser de la misma familia. Cuál es
                cuál, para quien no ve el icono, lo dice el `aria-label`.
              */}
              <Button
                variant="outline"
                size="icon"
                aria-label={`No se hizo: ${text}`}
                loading={busy}
                disabled={markingId === entry.id}
                onClick={() => skip.onSkip(entry)}
                className="shrink-0 text-muted-foreground"
              >
                <CircleX aria-hidden className="size-5" />
              </Button>
            </div>
          );
        })
      )}
    </section>
  );
}
