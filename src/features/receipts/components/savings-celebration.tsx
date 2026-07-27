"use client";

import { PiggyBank, Tag, TrendingDown, TrendingUp } from "lucide-react";

import { formatEuro, formatEuroSigned } from "@/lib/money";
import { SAVINGS_WINDOW_DAYS } from "@/features/prices/savings";
import type { ReceiptSavingsSummary } from "@/features/prices/savings";
import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";

/**
 * Celebración de la hucha (G1) justo después de confirmar un ticket: el pico de
 * atención del flujo y el único momento en que la cifra le importa al usuario.
 *
 * SOLO se abre cuando hay algo real que celebrar (`total > 0`, decisión del
 * componente padre). Si el ticket ha salido caro, el saldo negativo NO se
 * escamotea —está en la hucha de /precios, netado— pero tampoco se convierte en
 * un reproche en la cara: no felicitar es distinto de regañar.
 *
 * El desglose está siempre visible, no escondido tras un despliegue: un número
 * grande sin explicación es exactamente lo que hace que la gente deje de creerse
 * este tipo de pantallas.
 */
export function SavingsCelebration({
  summary,
  open,
  onContinue,
}: {
  summary: ReceiptSavingsSummary;
  open: boolean;
  onContinue: () => void;
}) {
  const months = Math.round(SAVINGS_WINDOW_DAYS / 30);
  const hasPriceSavings = summary.byPrice !== 0 && summary.comparedLines > 0;

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
            <PiggyBank className="size-6" aria-hidden />
          </div>
          <ResponsiveModalTitle>
            A la hucha: {formatEuro(summary.total)}
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Lo que esta compra le ha ahorrado al hogar.
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
