"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, PackageCheck, ShoppingCart } from "lucide-react";

import { ProductIcon } from "@/components/product-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { safeAction } from "@/lib/action-error";
import { vibrateTick } from "@/lib/haptics";
import { formatQuantity, LOCATION_LABELS, LOCATION_ORDER } from "@/lib/units";
import { addListItemsAction } from "@/features/shopping-list/actions";
import { trackFromClient } from "@/features/usage/track";
import { savePantryReviewAction } from "../actions";
import { answerWantsRestock, type PantryAnswer } from "../pantry-review";
import type { PantryReviewEntry } from "../queries";

/** Las tres respuestas, en el orden en que se leen de izquierda a derecha. */
const ANSWERS: { key: PantryAnswer; label: string }[] = [
  { key: "have", label: "Queda" },
  { key: "low", label: "Poco" },
  { key: "out", label: "Se acabó" },
];

/** Cómo se cuenta después lo que el usuario acaba de decir. */
const ANSWER_RECAP: Record<PantryAnswer, string> = {
  have: "Queda",
  low: "Te queda poco",
  out: "Se ha agotado",
};

/**
 * Repaso semanal de despensa. Tres toques posibles por producto y, al terminar,
 * la oferta de apuntar en la lista lo que falta.
 *
 * Por qué existe: fuera del stepper y del descuento al cocinar nada apunta el
 * consumo del día a día, así que el inventario se desactualiza solo y con él
 * mienten el aviso de caducidades, el «qué tienes» del menú y las sugerencias de
 * la lista. La alternativa a este ritual no es un inventario perfecto: es pedirle
 * a la gente que apunte cada yogur, que no lo va a hacer.
 *
 * El rótulo de lo que se apunta sale de la RESPUESTA del usuario y no de
 * `suggestionReasonLabel` como en el resto de la app, y es deliberado: aquí no hay
 * nada que inferir —acaba de decirlo— y «poco» no equivale a «bajo tu mínimo»,
 * que es lo que ese rótulo diría de un producto sin mínimo definido.
 *
 * Todo ocurre DENTRO de este único `ResponsiveModal`: la oferta de la lista es una
 * vista que sustituye a la de preguntas. Anidar modales no funciona (el cierre por
 * historial cierra el segundo solo).
 */
export function PantryReviewModal({
  open,
  onOpenChange,
  items,
  onSilenceWeek,
  onDisable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PantryReviewEntry[];
  onSilenceWeek: () => void;
  onDisable: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, PantryAnswer>>({});
  /** Qué botón concreto está guardando: los tres de una fila son distintos. */
  const [busy, setBusy] = useState<{ id: string; answer: PantryAnswer } | null>(
    null,
  );
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  /** «Volver» desde la oferta de la lista, para no reabrirla sola otra vez. */
  const [restockDismissed, setRestockDismissed] = useState(false);

  const pending = items.filter((i) => answers[i.id] === undefined);
  /** Lo que va a la lista, con la respuesta que lo manda ahí. */
  const toBuy = items.flatMap((item) => {
    const given = answers[item.id];
    return given !== undefined && answerWantsRestock(given)
      ? [{ item, given }]
      : [];
  });
  const answered = items.length - pending.length;
  /*
    Qué vista toca se DERIVA del estado en vez de guardarse: al contestar la
    última pregunta aparece sola la oferta de la lista (es el paso que da sentido
    al repaso —corregir la despensa sin comprar lo que falta deja el trabajo a
    medias— y nadie va a buscar un botón para llegar ahí). Derivarla evita el
    fallo de guardarla: había que decidir el salto dentro del guardado de cada
    respuesta, o sea leyendo un `answers` que la respuesta anterior podía no haber
    actualizado todavía.
  */
  const view =
    pending.length === 0 &&
    toBuy.length > 0 &&
    !addedToList &&
    !restockDismissed
      ? "restock"
      : "review";

  /**
   * Guarda una respuesta. Se persiste de una en una (ver
   * `savePantryReviewAction`): quien abandona a la cuarta no pierde las tres
   * anteriores.
   */
  function answer(item: PantryReviewEntry, value: PantryAnswer) {
    vibrateTick();
    setBusy({ id: item.id, answer: value });
    void (async () => {
      const r = await safeAction(
        savePantryReviewAction(item.id, value),
        "No se pudo guardar la respuesta.",
      );
      setBusy(null);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      // Forma funcional, no `{ ...answers }`: dos filas contestadas seguidas
      // resuelven sus guardados por separado, y la segunda partiría de un
      // `answers` anterior a la primera — perdiéndola de vista.
      setAnswers((prev) => ({ ...prev, [item.id]: value }));
    })();
  }

  function toggleSkip(id: string, on: boolean) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addToList() {
    const chosen = toBuy.filter(({ item }) => !skipped.has(item.id));
    if (chosen.length === 0) {
      setRestockDismissed(true);
      return;
    }
    setAdding(true);
    void pushToList(chosen.map(({ item }) => item));
  }

  /*
    Cerrar a media pregunta no puede tirar lo ya contestado como «se acabó» o
    «queda poco»: la oferta de la lista solo salía al terminar, y al cerrar la
    tarjeta se refresca y desaparece (la semana ya está sellada), así que eso no
    llegaba a la lista ni volvía a ofrecerse. Tampoco se apunta solo —cerrar no
    es decir que sí—: se ofrece en un aviso, que sobrevive al desmontaje.
  */
  function handleOpenChange(next: boolean) {
    if (!next && view === "review" && !addedToList && !restockDismissed) {
      const chosen = toBuy
        .filter(({ item }) => !skipped.has(item.id))
        .map(({ item }) => item);
      if (chosen.length > 0) {
        toast(
          chosen.length === 1
            ? `¿Apunto «${chosen[0].name}» en la lista?`
            : `¿Apunto en la lista los ${chosen.length} que faltan?`,
          {
            duration: 10_000,
            action: {
              label: "Apuntar",
              onClick: () => void pushToList(chosen),
            },
          },
        );
      }
    }
    onOpenChange(next);
  }

  async function pushToList(chosen: PantryReviewEntry[]) {
    const r = await safeAction(
      addListItemsAction(
        // Sin cantidad a propósito: el usuario ha dicho que hace falta, no
        // cuánto. Inventar un número aquí sería una cifra que nadie ha
        // decidido, y la lista ya sabe proponerla cuando toca. Por lo mismo,
        // lo que ya está apuntado se deja como está (`ifMissing`).
        chosen.map((item) => ({
          kind: "product" as const,
          productId: item.productId,
          ifMissing: true,
        })),
      ),
      "No se pudo apuntar en la lista.",
    );
    setAdding(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    const total = (r.added ?? 0) + (r.merged ?? 0);
    toast.success(
      total === 1
        ? "1 producto apuntado en la lista"
        : `${total} productos apuntados en la lista`,
    );
    setAddedToList(true);
    // Medición de uso: es la mitad del valor del repaso (corregir la
    // despensa y además generar la compra), así que se cuenta aparte.
    trackFromClient({ name: "pantry_review_to_list", props: { count: total } });
  }

  // Agrupado por ubicación para que el repaso sea un paseo por la casa y no un
  // formulario: se abre la nevera una vez, no ocho.
  const groups = LOCATION_ORDER.map((location) => ({
    location,
    items: items.filter((i) => i.location === location),
  })).filter((g) => g.items.length > 0);

  const finished = pending.length === 0;

  return (
    <ResponsiveModal open={open} onOpenChange={handleOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>
            {view === "restock" ? "¿Lo apuntamos?" : "Repaso de despensa"}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {view === "restock"
              ? "Lo que se ha acabado o queda poco, a la lista de la compra."
              : finished
                ? "No queda nada por repasar."
                : "¿Te queda de esto? Un toque por producto."}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {view === "restock" ? (
          <div className="flex flex-col gap-3 px-4">
            <ul className="flex flex-col gap-2">
              {toBuy.map(({ item, given }) => {
                const cbId = `pantry-restock-${item.id}`;
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl border p-3"
                  >
                    <Checkbox
                      id={cbId}
                      checked={!skipped.has(item.id)}
                      onCheckedChange={(v) => toggleSkip(item.id, v === true)}
                      className="mt-0.5 size-5"
                    />
                    <Label
                      htmlFor={cbId}
                      className="flex flex-1 cursor-pointer flex-col items-start gap-1 font-normal"
                    >
                      <span className="text-sm font-medium break-words">
                        {item.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ANSWER_RECAP[given]}
                      </span>
                    </Label>
                  </li>
                );
              })}
            </ul>
            <ResponsiveModalFooter className="gap-2 px-0">
              <Button
                type="button"
                onClick={addToList}
                loading={adding}
                disabled={toBuy.every(({ item }) => skipped.has(item.id))}
              >
                <ShoppingCart aria-hidden />
                Apuntar en la lista
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRestockDismissed(true)}
                disabled={adding}
              >
                <ChevronLeft aria-hidden />
                Volver
              </Button>
            </ResponsiveModalFooter>
          </div>
        ) : finished ? (
          <div className="px-4 pb-2">
            <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              <PackageCheck aria-hidden className="size-6 text-primary" />
              Despensa al día. Con esto los avisos de caducidad y las ideas de
              menú vuelven a hablar de lo que tienes de verdad.
            </p>
            {toBuy.length > 0 && !addedToList ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setRestockDismissed(false)}
                className="mt-3 w-full"
              >
                <ShoppingCart aria-hidden />
                Apuntar en la lista ({toBuy.length})
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4">
            {groups.map((group) => (
              <section key={group.location} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {LOCATION_LABELS[group.location]}
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.items.map((item) => {
                    const given = answers[item.id];
                    return (
                      <li
                        key={item.id}
                        className="flex flex-col gap-2 rounded-xl border p-3"
                      >
                        <div className="flex items-center gap-2">
                          <ProductIcon
                            slug={item.productIcon}
                            name={item.name}
                            categoryIcon={item.categoryIcon}
                            size={20}
                            className={given ? "opacity-50" : undefined}
                          />
                          <span className="min-w-0 flex-1 text-sm font-medium break-words">
                            {item.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatQuantity(item.quantity, item.unit)}
                          </span>
                        </div>
                        {given ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Check aria-hidden className="size-4 text-success" />
                            {ANSWER_RECAP[given]}
                          </p>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {ANSWERS.map((a) => (
                              <Button
                                key={a.key}
                                type="button"
                                variant="outline"
                                /* El nombre accesible lleva el producto: sin él,
                                   un lector de pantalla anuncia ocho veces los
                                   mismos tres botones sin decir de qué son. */
                                aria-label={`${item.name}: ${a.label.toLowerCase()}`}
                                loading={
                                  busy?.id === item.id && busy.answer === a.key
                                }
                                disabled={busy?.id === item.id}
                                onClick={() => answer(item, a.key)}
                              >
                                {a.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {view === "restock" ? null : (
          <ResponsiveModalFooter className="gap-2">
            <ResponsiveModalClose asChild>
              <Button type="button" variant={finished ? "default" : "ghost"}>
                {finished ? "Listo" : "Cerrar"}
              </Button>
            </ResponsiveModalClose>
            {/*
              Las dos salidas viven aquí y no solo en Ajustes: nadie harto de que
              le pregunten va a buscar el interruptor. En una fila y en `ghost`,
              para no comerle sitio a la lista en una hoja de móvil. Solo mientras
              no se ha contestado nada — después de repasar, lo que toca es
              despedirse, no ofrecer apagarlo.
            */}
            {answered === 0 ? (
              <div className="mr-auto flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onSilenceWeek}
                >
                  No esta semana
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDisable}
                >
                  No volver a preguntar
                </Button>
              </div>
            ) : null}
          </ResponsiveModalFooter>
        )}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
