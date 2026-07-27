"use client";

import {
  CirclePlus,
  ListChecks,
  PiggyBank,
  Tag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { formatEuro, formatEuroSigned } from "@/lib/money";
import { SAVINGS_WINDOW_DAYS } from "@/features/prices/savings";
import type { ReceiptSavingsSummary } from "@/features/prices/savings";
import type { TripComparison } from "@/features/shopping-list/trip-comparison";
import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";

/** Extras que se enumeran antes de resumir el resto en "y N más". */
const MAX_EXTRAS_SHOWN = 3;

/**
 * Celebración justo después de confirmar un ticket: el pico de atención del
 * flujo y el único momento en que estas cifras le importan al usuario. Reúne las
 * dos mecánicas: la hucha (G1) y la compra perfecta (G2).
 *
 * SOLO se abre cuando hay algo real que celebrar —dinero ahorrado o una compra
 * ceñida a la lista—, decisión del componente padre. Si el ticket ha salido caro,
 * el saldo negativo NO se escamotea (está en la hucha de /precios, netado) pero
 * tampoco se convierte en un reproche en la cara: no felicitar es distinto de
 * regañar. Por lo mismo, los extras se enumeran en tono neutro: son información
 * útil, no una regañina.
 *
 * El desglose está siempre visible, no escondido tras un despliegue: un número
 * grande sin explicación es exactamente lo que hace que la gente deje de creerse
 * este tipo de pantallas.
 */
export function SavingsCelebration({
  summary,
  trip,
  open,
  onContinue,
}: {
  summary: ReceiptSavingsSummary;
  trip?: TripComparison;
  open: boolean;
  onContinue: () => void;
}) {
  const months = Math.round(SAVINGS_WINDOW_DAYS / 30);
  const hasPriceSavings = summary.byPrice !== 0 && summary.comparedLines > 0;

  // El titular lo manda el dinero cuando lo hay; si no, la compra perfecta es la
  // noticia. Con `total = 0` un "A la hucha: 0,00 €" sería un titular triste
  // para una pantalla que solo se abre cuando algo ha ido bien.
  const hasSavings = summary.total > 0;
  const perfect = trip?.perfect ?? false;
  const onList = trip?.onList ?? 0;
  const extras = trip?.extras ?? [];
  const shownExtras = extras.slice(0, MAX_EXTRAS_SHOWN);
  const hiddenExtras = extras.length - shownExtras.length;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        // Cerrar por swipe, Escape u overlay equivale a continuar: el ticket ya
        // está confirmado, así que nunca se puede quedar atrapado aquí.
        if (!next) onContinue();
      }}
    >
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <div className="mx-auto mb-1 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground animate-in zoom-in-75 duration-300 md:mx-0">
            {hasSavings ? (
              <PiggyBank className="size-6" aria-hidden />
            ) : (
              <ListChecks className="size-6" aria-hidden />
            )}
          </div>
          <ResponsiveModalTitle>
            {hasSavings
              ? `A la hucha: ${formatEuro(summary.total)}`
              : "Compra perfecta"}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {hasSavings
              ? "Lo que esta compra le ha ahorrado al hogar."
              : "Te has llevado justo lo que llevabas en la lista."}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex flex-col gap-3 px-4">
          <ul className="flex flex-col gap-2">
            {hasPriceSavings ? (
              <li className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {summary.byPrice > 0 ? (
                    <TrendingDown className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <TrendingUp className="size-4 shrink-0" aria-hidden />
                  )}
                  {summary.byPrice > 0
                    ? "Mejor precio que de costumbre"
                    : "Precio algo por encima de lo habitual"}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatEuroSigned(summary.byPrice)}
                </span>
              </li>
            ) : null}
            {summary.discounts > 0 ? (
              <li className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Tag className="size-4 shrink-0" aria-hidden />
                  Descuentos del ticket
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatEuroSigned(summary.discounts)}
                </span>
              </li>
            ) : null}
          </ul>

          {summary.best ? (
            <p className="text-sm text-muted-foreground text-pretty">
              Donde más has ganado: <strong className="font-medium text-foreground">{summary.best.label}</strong>
              , {formatEuro(summary.best.amount)}.
            </p>
          ) : null}

          {/* Compra perfecta (G2). Con el recuento en vez de un "¡bien hecho!"
              genérico: es la prueba de que la comparación existió, y sostiene el
              titular cuando la noticia es esta y no el dinero. */}
          {perfect ? (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <ListChecks className="size-4 shrink-0" aria-hidden />
              {onList === 1
                ? "El producto del ticket estaba en tu lista."
                : `Los ${onList} productos del ticket estaban en tu lista.`}
            </p>
          ) : null}

          {extras.length > 0 ? (
            <p className="text-sm text-muted-foreground text-pretty">
              <CirclePlus
                className="mr-1.5 inline size-4 shrink-0 align-[-0.2em]"
                aria-hidden
              />
              {extras.length === 1
                ? "1 producto fuera de la lista: "
                : `${extras.length} productos fuera de la lista: `}
              <span className="text-foreground">
                {shownExtras.join(", ")}
                {hiddenExtras > 0 ? ` y ${hiddenExtras} más` : ""}
              </span>
              .
            </p>
          ) : null}

          {hasPriceSavings ? (
            <p className="text-xs text-muted-foreground text-pretty">
              El precio se compara con lo que pagabas por estos mismos productos
              en los últimos {months} meses, así la cifra no se infla con la
              subida general de precios.
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter>
          <Button onClick={onContinue}>Continuar</Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
