"use client";

import { useState } from "react";
import { PiggyBank, ReceiptText, Tag, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEuro, formatEuroSigned } from "@/lib/money";
import { useCountUp } from "@/hooks/use-count-up";
import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import type { SavingsEntry } from "@/features/prices/spending";

/**
 * Por qué este ticket movió la hucha. Se dice con palabras y no repitiendo los
 * dos importes: la fila ya lleva su cifra a la derecha, y meter otras dos al
 * lado convierte una lista que se ojea en un balance que hay que leer.
 */
function reasonLabel(entry: SavingsEntry): string {
  if (entry.discount > 0 && entry.byPrice !== 0) return "Descuentos y precio";
  if (entry.discount > 0) return "Descuentos del ticket";
  return entry.byPrice > 0
    ? "Más barato de lo habitual"
    : "Más caro de lo habitual";
}

/**
 * Hucha del hogar (G1) como titular de /perfil: la cifra del mes cuenta hacia
 * arriba al entrar, una moneda cae por la ranura, y el saldo se puede abrir para
 * ver de qué compras sale.
 *
 * Las tres decisiones que sostienen esto:
 *
 * - **La animación no puede costar rendimiento.** La moneda y el meneo son CSS
 *   sobre transform/opacity (compositor, sin layout) y suenan una sola vez; el
 *   contador escribe en el nodo del DOM en vez de re-renderizar por frame (ver
 *   useCountUp). Con `prefers-reduced-motion` no se mueve nada y la cifra final
 *   aparece directamente.
 * - **Solo se celebra si hay algo que celebrar.** Con saldo negativo (has pagado
 *   por encima de tu precio habitual) no hay moneda ni verde: una hucha
 *   festejando un mes malo destruiría la credibilidad de todo el marcador.
 * - **El número grande tiene que poder abrirse.** Es la lección del bloque que
 *   había antes: una cifra sin desglose es justo lo que hace que la gente deje
 *   de creerse estas pantallas. Aquí el desglose por concepto está siempre
 *   visible y, además, hay una lista ticket a ticket.
 */
export function SavingsPiggy({
  savingsTotal,
  discountTotal,
  savingsByPrice,
  entries,
}: {
  savingsTotal: number;
  discountTotal: number;
  savingsByPrice: number;
  entries: SavingsEntry[];
}) {
  const [open, setOpen] = useState(false);
  const positive = savingsTotal >= 0;
  const amountRef = useCountUp<HTMLParagraphElement>(
    savingsTotal,
    formatEuroSigned,
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-5">
      <div className="flex flex-col items-center gap-0.5 text-center">
        <div className="relative mb-1 inline-flex">
          {positive ? (
            <span
              aria-hidden
              className="absolute top-0 left-1/2 size-2.5 rounded-full bg-chart-3 animate-coin-drop"
            />
          ) : null}
          <PiggyBank
            aria-hidden
            className={cn(
              "size-14",
              positive ? "text-success animate-piggy-nudge" : "text-warning",
            )}
          />
        </div>
        <p className="text-sm text-muted-foreground">A la hucha este mes</p>
        {/* Solo la cifra dentro de este nodo: useCountUp le reescribe el texto. */}
        <p
          ref={amountRef}
          className={cn(
            "text-4xl font-semibold tabular-nums",
            positive ? "text-success" : "text-warning",
          )}
        >
          {formatEuroSigned(savingsTotal)}
        </p>
      </div>

      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {discountTotal > 0 ? (
          <li className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1">
              <Tag className="size-3.5 shrink-0" aria-hidden />
              Descuentos del ticket
            </span>
            <span className="tabular-nums">{formatEuro(discountTotal)}</span>
          </li>
        ) : null}
        {savingsByPrice !== 0 ? (
          <li className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1">
              {savingsByPrice > 0 ? (
                <TrendingDown className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <TrendingUp className="size-3.5 shrink-0" aria-hidden />
              )}
              Precio frente a lo habitual
            </span>
            <span className="tabular-nums">
              {formatEuroSigned(savingsByPrice)}
            </span>
          </li>
        ) : null}
      </ul>

      {entries.length > 0 ? (
        <ResponsiveModal open={open} onOpenChange={setOpen}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            className="-mb-1 self-center text-muted-foreground"
          >
            <ReceiptText aria-hidden />
            {entries.length === 1
              ? "Ver el movimiento"
              : `Ver los ${entries.length} movimientos`}
          </Button>
          <ResponsiveModalContent>
            <ResponsiveModalHeader>
              <ResponsiveModalTitle>Movimientos de la hucha</ResponsiveModalTitle>
              <ResponsiveModalDescription>
                Las compras que movieron el saldo este mes. Las que no traían
                descuentos ni desvío de precio no aparecen.
              </ResponsiveModalDescription>
            </ResponsiveModalHeader>
            <ul className="flex flex-col divide-y px-4 pb-4">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-3 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {entry.chainLabel}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.dateLabel
                        ? `${entry.dateLabel} · ${reasonLabel(entry)}`
                        : reasonLabel(entry)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium tabular-nums",
                      entry.total >= 0 ? "text-success" : "text-warning",
                    )}
                  >
                    {formatEuroSigned(entry.total)}
                  </span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 py-3 font-medium">
                <span className="text-sm">Total del mes</span>
                <span
                  className={cn(
                    "shrink-0 text-sm tabular-nums",
                    positive ? "text-success" : "text-warning",
                  )}
                >
                  {formatEuroSigned(savingsTotal)}
                </span>
              </li>
            </ul>
          </ResponsiveModalContent>
        </ResponsiveModal>
      ) : null}
    </div>
  );
}
