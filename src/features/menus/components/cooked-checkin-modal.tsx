"use client";

import { useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  CalendarOff,
  Check,
  ChefHat,
  ChevronLeft,
  MoveRight,
  PartyPopper,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import {
  getWeekDays,
  getWeekStart,
  relativeDaysLabel,
  todayLocalISO,
} from "@/lib/dates";
import { vibrateTick } from "@/lib/haptics";
import { addListItemsAction } from "@/features/shopping-list/actions";
import type { RestockCandidate } from "@/features/shopping-list/queries";
import {
  computeCookedDeductionsAction,
  confirmCookedDeductionsAction,
  moveMenuEntryAction,
  removeMenuEntryAction,
  setEntrySkippedReasonAction,
  toggleEntryCookedAction,
  toggleEntrySkippedAction,
} from "../actions";
import { noDeductionsReason, type CookedDeduction } from "../cooked";
import type { PendingCheckinEntry } from "../queries";
import type { SkipReason } from "../skip-reason";
import { slotLabel, type SlotDef } from "../slots";
import {
  CookedDeductionsFields,
  deductionCount,
  deductionPayload,
  initialDeductionQty,
} from "./cooked-deductions-fields";
import {
  CookedRestockFields,
  initialRestockSelection,
  restockPayload,
  restockToastMessage,
} from "./cooked-restock-fields";
import { EntryActionTile } from "./entry-action-tile";
import { SkipReasonChips } from "./skip-reason-chips";
import { SlotPickerGrid } from "./slot-picker-grid";

/** Etiqueta del día de un pendiente: "Ayer" o el día de la semana. */
function dayLabel(date: string): string {
  const rel = relativeDaysLabel(date);
  if (rel === "ayer") return "Ayer";
  return format(parseISO(date), "EEEE d", { locale: es });
}

type Busy = {
  id: string;
  kind: "cook" | "skip" | "reason" | "remove" | "move" | "deduct" | "restock";
};

/**
 * Repaso de platos (R2): la pregunta batch por los platos pasados de los que no
 * se sabe si se cocinaron. Cada fila se despacha con "Lo cocinamos" (que encadena
 * el descuento de inventario que ya existía) o con "No", que abre tres salidas:
 * anotar que no se hizo —y entonces la fila pregunta por qué—, moverlo a otro día
 * o quitarlo del menú.
 *
 * Las dos respuestas largas encadenan un paso más en la MISMA fila en vez de
 * retirarla: cocinar propone descontar del inventario y descartar pregunta el
 * motivo. Los dos pasos son opcionales y los dos se saltan con «Ahora no»; lo que
 * no se puede es perder de vista el plato del que se está hablando, que con
 * cuatro filas más abajo es exactamente lo que pasaba.
 *
 * AUTOCONTENIDO a propósito: recibe los pendientes ya cargados y no depende del
 * estado de `MenuView`, porque la tarjeta del shell (R3) monta el mismo modal
 * desde cualquier página.
 *
 * Todo el flujo ocurre DENTRO de este único `ResponsiveModal`: el descuento se
 * despliega inline en la fila y el selector de día es una vista que sustituye a
 * la lista. Anidar modales no funciona (el cierre por historial cierra el
 * segundo solo).
 */
export function CookedCheckinModal({
  open,
  onOpenChange,
  entries,
  slots,
  onResolved,
  onSilenceWeek,
  onDisable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: PendingCheckinEntry[];
  /** Huecos activos del hogar, para el selector de "Mover a…". */
  slots: SlotDef[];
  /** Tras cada respuesta: el host refresca los datos del servidor. */
  onResolved?: () => void;
  /** R3: silenciar el resto de la semana (cookie por dispositivo). */
  onSilenceWeek?: () => void;
  /** R3: apagar el repaso para todo el hogar. */
  onDisable?: () => void;
}) {
  // Respondidas en esta sesión: la fila se retira sin esperar al servidor.
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  // Fila con las tres salidas de "No" desplegadas.
  const [noFor, setNoFor] = useState<string | null>(null);
  // Fila ya descartada a la que se le está preguntando el motivo (su id).
  const [why, setWhy] = useState<string | null>(null);
  // Fila con la revisión del descuento desplegada (ya marcada como cocinada).
  const [deduct, setDeduct] = useState<{
    entryId: string;
    items: CookedDeduction[];
  } | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  // Fila con la oferta de apuntar en la lista lo que el descuento dejó a cero.
  const [restock, setRestock] = useState<{
    entryId: string;
    candidates: RestockCandidate[];
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Vista de "Mover a…" (sustituye a la lista): entrada que se está moviendo.
  const [moving, setMoving] = useState<PendingCheckinEntry | null>(null);
  /**
   * Fila a medio despachar: ya escrita en la base pero con un paso más que
   * preguntar (el descuento o el motivo). Se guarda entera porque el servidor
   * deja de mandarla en cuanto se escribe — ver `remaining`.
   */
  const [held, setHeld] = useState<PendingCheckinEntry | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [, startAction] = useTransition();
  /*
    Hay escritura sin avisar al host todavía. Una fila que se queda a medio
    despachar (cocinada y esperando en la revisión del descuento, o en la oferta
    de apuntar) ya ha cambiado la base, así que si el modal se cierra por ahí hay
    que refrescar igual: sin esto el plato aparece como no cocinado en la semana
    hasta la siguiente navegación, que es exactamente lo que se lee como un fallo.
  */
  const [dirty, setDirty] = useState(false);

  const pending = entries.filter((e) => !resolved.has(e.id));
  /*
    Una fila a medio despachar se conserva aunque el servidor ya no la mande.

    Hace falta porque las dos respuestas escriben ANTES de terminar de preguntar
    —cocinar deja el plato marcado y luego propone el descuento; descartar lo
    marca y luego pregunta el motivo— y las dos actions revalidan `/menus`. En esa
    ruta Next devuelve la página ya re-renderizada en la misma respuesta de la
    action, así que el plato sale de los pendientes del servidor y la fila se
    esfumaba con la pregunta a medias. Desde otra página no pasaba (revalidar
    `/menus` no re-renderiza `/lista`), que es por dónde entra casi todo el mundo
    a este repaso: de ahí que solo se viera en el menú.
  */
  const remaining =
    held && !pending.some((e) => e.id === held.id)
      ? [...pending, held]
      : pending;
  const isBusy = (id: string, kind: Busy["kind"]) =>
    busy?.id === id && busy.kind === kind;

  // Destinos de "Mover a…": la semana EN CURSO (no la del plato, que ya pasó),
  // y solo de hoy en adelante — mover al pasado dejaría la entrada pendiente
  // otra vez, que es justo lo que se está resolviendo.
  const today = todayLocalISO();
  const weekDays = getWeekDays(getWeekStart());

  function resolve(id: string) {
    setResolved((prev) => new Set(prev).add(id));
    setNoFor(null);
    setWhy(null);
    setDeduct(null);
    setRestock(null);
    setMoving(null);
    setHeld(null);
    setBusy(null);
    setDirty(false);
    onResolved?.();
  }

  /** "Lo cocinamos": marca y, si hay receta con stock, propone el descuento. */
  function cook(entry: PendingCheckinEntry) {
    vibrateTick();
    setBusy({ id: entry.id, kind: "cook" });
    startAction(async () => {
      const r = await toggleEntryCookedAction(entry.id, true);
      if (r.error) {
        setBusy(null);
        toast.error(r.error);
        return;
      }
      toast.success("Marcado como cocinado");
      setDirty(true);
      // La fila ya está escrita: conservarla es lo que la mantiene a la vista si
      // el servidor deja de mandarla (ver `held`).
      setHeld(entry);
      // Texto libre: no hay inventario que tocar.
      if (!entry.recipeId) {
        resolve(entry.id);
        return;
      }
      const d = await computeCookedDeductionsAction(entry.recipeId);
      const items = d.deductions ?? [];
      setBusy(null);
      if (items.some((it) => it.deductible)) {
        // La fila NO se retira: se convierte en la revisión del descuento. El
        // plato ya quedó cocinado, así que descontar es opt-out por gesto.
        setNoFor(null);
        setDeduct({ entryId: entry.id, items });
        setQty(initialDeductionQty(items));
      } else {
        // Nada que descontar: se dice por qué (ver `noDeductionsReason`).
        const why = noDeductionsReason(items);
        if (why) toast.info(why);
        resolve(entry.id);
      }
    });
  }

  /** Confirma el descuento propuesto para la fila desplegada. */
  function confirmDeduct() {
    if (!deduct) return;
    const { entryId, items } = deduct;
    setBusy({ id: entryId, kind: "deduct" });
    startAction(async () => {
      const r = await confirmCookedDeductionsAction(
        deductionPayload(items, qty),
      );
      if (r.error) {
        setBusy(null);
        toast.error(r.error);
        return;
      }
      const n = r.deducted ?? 0;
      toast.success(
        n === 0
          ? "No se descontó nada"
          : n === 1
            ? "Descontado 1 ingrediente"
            : `Descontados ${n} ingredientes`,
      );
      // Si algo se ha quedado a cero, la fila da un paso más en vez de
      // retirarse: apuntarlo ahora ahorra el viaje de volver por ello.
      const ranOut = r.restock ?? [];
      if (ranOut.length > 0) {
        setBusy(null);
        setDeduct(null);
        setRestock({ entryId, candidates: ranOut });
        setSelected(initialRestockSelection(ranOut));
        return;
      }
      resolve(entryId);
    });
  }

  /** Apunta en la lista lo marcado de la fila que se ha quedado sin existencias. */
  function addRestockToList() {
    if (!restock) return;
    const { entryId, candidates } = restock;
    setBusy({ id: entryId, kind: "restock" });
    startAction(async () => {
      const r = await addListItemsAction(restockPayload(candidates, selected));
      if (r.error) {
        setBusy(null);
        toast.error(r.error);
        return;
      }
      toast.success(restockToastMessage(r));
      resolve(entryId);
    });
  }

  /**
   * "No se hizo": deja huella para no volver a preguntar. La fila NO se retira
   * todavía —se convierte en la pregunta del motivo, igual que "lo cocinamos" la
   * convierte en la revisión del descuento—, porque el motivo es lo único que
   * hace algo con el descarte y a los dos segundos de contestar ya nadie se
   * acuerda de qué plato era.
   */
  function skip(entry: PendingCheckinEntry) {
    vibrateTick();
    setBusy({ id: entry.id, kind: "skip" });
    startAction(async () => {
      const r = await toggleEntrySkippedAction(entry.id, true);
      setBusy(null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Anotado: no se hizo");
      setDirty(true);
      setHeld(entry);
      setNoFor(null);
      setWhy(entry.id);
    });
  }

  /** Guarda el motivo del descarte y despacha la fila. */
  function pickReason(entryId: string, reason: SkipReason | null) {
    setBusy({ id: entryId, kind: "reason" });
    startAction(async () => {
      const r = await setEntrySkippedReasonAction(entryId, reason);
      if (r.error) {
        setBusy(null);
        toast.error(r.error);
        return;
      }
      resolve(entryId);
    });
  }

  function remove(entry: PendingCheckinEntry) {
    setBusy({ id: entry.id, kind: "remove" });
    startAction(async () => {
      const r = await removeMenuEntryAction(entry.id);
      if (r.error) {
        setBusy(null);
        toast.error(r.error);
        return;
      }
      toast.success("Plato quitado del menú");
      resolve(entry.id);
    });
  }

  function move(date: string, slot: string) {
    if (!moving) return;
    const entry = moving;
    setBusy({ id: entry.id, kind: "move" });
    startAction(async () => {
      const r = await moveMenuEntryAction(entry.id, date, slot);
      if (r.error) {
        setBusy(null);
        toast.error(r.error);
        return;
      }
      toast.success("Plato movido");
      resolve(entry.id);
    });
  }

  // Pendientes agrupados por día, en el orden en que llegan (fecha, hueco).
  const groups: { date: string; items: PendingCheckinEntry[] }[] = [];
  for (const e of remaining) {
    const last = groups.at(-1);
    if (last?.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => {
        if (!o && dirty) {
          setDirty(false);
          onResolved?.();
        }
        if (!o) {
          /*
            Cerrar abandona la pregunta a medias. Sin esto, `held` mantendría viva
            la fila y al volver a abrir el repaso reaparecería preguntando por un
            plato ya contestado —que además ya no cuenta en el «N por repasar»—.
          */
          setHeld(null);
          setWhy(null);
          setDeduct(null);
          setRestock(null);
          setNoFor(null);
        }
        onOpenChange(o);
      }}
    >
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {moving ? "Mover a…" : "Repaso de platos"}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {moving
              ? `Elige cuándo harás «${moving.name}».`
              : remaining.length === 0
                ? "No queda nada por repasar."
                : "¿Llegaste a cocinar lo que tenías planificado?"}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {moving ? (
          <div className="flex flex-col gap-3 px-4">
            <SlotPickerGrid
              days={weekDays}
              slots={slots}
              busy={isBusy(moving.id, "move")}
              // Al pasado no: volvería a estar pendiente al instante.
              isBlocked={(date) => date < today}
              onPick={move}
            />
            <ResponsiveModalFooter className="gap-2 px-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMoving(null)}
                disabled={isBusy(moving.id, "move")}
              >
                <ChevronLeft aria-hidden />
                Volver
              </Button>
            </ResponsiveModalFooter>
          </div>
        ) : remaining.length === 0 ? (
          <div className="px-4 pb-2">
            <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              <PartyPopper aria-hidden className="size-6 text-primary" />
              Todo al día. Gracias: con esto el inventario y las ideas de menú
              van con datos de verdad.
            </p>
          </div>
        ) : (
          /*
            La key remonta el bloque al responder una fila: un solo cross-fade
            para la lista que queda (una animación, no una por fila).
          */
          <ul
            key={remaining.length}
            className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto px-4 animate-in fade-in duration-150"
          >
            {groups.map((g) => (
              <li key={g.date} className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground first-letter:uppercase">
                  {dayLabel(g.date)}
                </p>
                <ul className="flex flex-col gap-2">
                  {g.items.map((e) => {
                    // Descuento desplegado en ESTA fila (null en las demás).
                    const review = deduct?.entryId === e.id ? deduct : null;
                    const toDeduct = review
                      ? deductionCount(review.items, qty)
                      : 0;
                    // Paso siguiente: apuntar lo que quedó a cero al descontar.
                    const restocking =
                      restock?.entryId === e.id ? restock : null;
                    // Ya descartada, preguntando por qué (el «no» de esta fila).
                    const asking = why === e.id;
                    return (
                      <li
                        key={e.id}
                        className="flex flex-col gap-2 rounded-xl border p-3"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-muted-foreground">
                            {slotLabel(e.slot)}
                          </span>
                          <p className="font-medium break-words">{e.name}</p>
                        </div>

                        {asking ? (
                          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            {/* Pregunta de un solo disparo: al contestar, la fila
                                se despide, así que no hay motivo que reflejar
                                pulsado (eso es cosa del panel del plato). */}
                            <SkipReasonChips
                              value={null}
                              busy={isBusy(e.id, "reason")}
                              onPick={(reason) => pickReason(e.id, reason)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => resolve(e.id)}
                              disabled={isBusy(e.id, "reason")}
                            >
                              Ahora no
                            </Button>
                          </div>
                        ) : restocking ? (
                          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <p className="text-xs text-muted-foreground">
                              Se te ha terminado esto. Desmarca lo que no
                              quieras apuntar.
                            </p>
                            <CookedRestockFields
                              candidates={restocking.candidates}
                              selected={selected}
                              onToggle={(productId, on) =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (on) next.add(productId);
                                  else next.delete(productId);
                                  return next;
                                })
                              }
                              idPrefix={`restock-${e.id}`}
                            />
                            <div className="flex flex-col gap-2">
                              <Button
                                type="button"
                                onClick={addRestockToList}
                                loading={isBusy(e.id, "restock")}
                                disabled={selected.size === 0}
                              >
                                <ShoppingCart aria-hidden />
                                {selected.size <= 1
                                  ? "Apuntar 1 en la lista"
                                  : `Apuntar ${selected.size} en la lista`}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => resolve(e.id)}
                                disabled={isBusy(e.id, "restock")}
                              >
                                Ahora no
                              </Button>
                            </div>
                          </div>
                        ) : review ? (
                          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <p className="text-xs text-muted-foreground">
                              Ajusta lo que has gastado. Se descuenta del lote
                              que caduca antes.
                            </p>
                            <CookedDeductionsFields
                              items={review.items}
                              qty={qty}
                              onQtyChange={(key, value) =>
                                setQty((prev) => ({ ...prev, [key]: value }))
                              }
                            />
                            <div className="flex flex-col gap-2">
                              <Button
                                type="button"
                                onClick={confirmDeduct}
                                loading={isBusy(e.id, "deduct")}
                                disabled={toDeduct === 0}
                              >
                                <Check aria-hidden />
                                {toDeduct <= 1
                                  ? "Descontar 1 ingrediente"
                                  : `Descontar ${toDeduct} ingredientes`}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => resolve(e.id)}
                                disabled={isBusy(e.id, "deduct")}
                              >
                                No descontar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                className="flex-1"
                                onClick={() => cook(e)}
                                loading={isBusy(e.id, "cook")}
                              >
                                <ChefHat aria-hidden />
                                Lo cocinamos
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="flex-1"
                                aria-expanded={noFor === e.id}
                                onClick={() =>
                                  setNoFor((prev) =>
                                    prev === e.id ? null : e.id,
                                  )
                                }
                              >
                                No
                              </Button>
                            </div>
                            {noFor === e.id ? (
                              <div className="grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <EntryActionTile
                                  icon={CalendarOff}
                                  label="No se hizo"
                                  onClick={() => skip(e)}
                                  loading={isBusy(e.id, "skip")}
                                />
                                <EntryActionTile
                                  icon={MoveRight}
                                  label="Mover a…"
                                  onClick={() => setMoving(e)}
                                />
                                <EntryActionTile
                                  icon={Trash2}
                                  label="Quitar del menú"
                                  onClick={() => remove(e)}
                                  loading={isBusy(e.id, "remove")}
                                  destructive
                                />
                              </div>
                            ) : null}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {moving ? null : (
          <ResponsiveModalFooter className="gap-2">
            <ResponsiveModalClose asChild>
              <Button
                type="button"
                variant={remaining.length === 0 ? "default" : "ghost"}
              >
                {remaining.length === 0 ? "Listo" : "Cerrar"}
              </Button>
            </ResponsiveModalClose>
            {/*
              Silencios (R3). Nadie harto de que le pregunten va a buscar el
              ajuste, así que las dos salidas viven aquí mismo — pero en UNA
              fila y en `ghost`: si ocupan dos filas de pie, la lista de platos
              se queda sin sitio en una hoja de móvil.
            */}
            {onSilenceWeek || onDisable ? (
              <div className="flex gap-2">
                {onSilenceWeek ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onSilenceWeek}
                    className="flex-1 text-xs"
                  >
                    Silenciar esta semana
                  </Button>
                ) : null}
                {onDisable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onDisable}
                    className="flex-1 text-xs"
                  >
                    No volver a preguntar
                  </Button>
                ) : null}
              </div>
            ) : null}
          </ResponsiveModalFooter>
        )}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
