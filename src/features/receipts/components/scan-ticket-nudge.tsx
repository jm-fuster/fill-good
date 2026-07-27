"use client";

import Link from "next/link";
import { ReceiptText, ScanLine, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePersistedFlag } from "@/hooks/use-persisted-flag";
import type { PendingTicketTrip } from "@/features/shopping-list/queries";

/**
 * Oferta de escanear el ticket de una compra cerrada desde la lista que aún no
 * lo tiene. Aparece justo después del checkout (la revisión de caducidades) y
 * sigue en `/lista` mientras el ticket se pueda emparejar, para quien llega a
 * casa con el papel en la mano un rato después.
 *
 * Por qué un aviso descartable y no un segundo botón junto a «Finalizar compra»:
 * no hace falta decidirlo en la caja. El cruce lista↔ticket se resuelve solo y
 * en diferido — `linkReceiptToTrip` empareja el ticket con la compra cerrada
 * cuando llegue, dentro de su ventana de 48 h (`shopping-list/trips.ts`).
 *
 * El checkout y la confirmación de un ticket siguen siendo dos vías
 * independientes de entrada al inventario (`checkoutAction` y
 * `confirmReceiptAction`), pero encadenarlas ya NO duplica el stock: la revisión
 * del ticket marca como «solo precio» los productos que la compra emparejada ya
 * metió (`getAlreadyStockedProductIds`).
 */
export function ScanTicketNudge({
  trip,
  compact = false,
}: {
  trip: PendingTicketTrip;
  /** Una sola línea, para pantallas donde el aviso no es la tarea principal. */
  compact?: boolean;
}) {
  // Silenciar es POR COMPRA (la clave lleva el id): descartar el aviso de esta
  // compra no debe callar el de la siguiente. Al ser la misma clave en las dos
  // pantallas, descartarlo en una lo descarta también en la otra.
  const [dismissed, setDismissed] = usePersistedFlag(
    `lista:ticket-descartado:${trip.id}`,
  );
  if (dismissed) return null;

  if (compact) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-dashed p-2 pl-3">
        <ReceiptText className="size-4 shrink-0 text-chart-3" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">¿Tienes el ticket?</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/escanear">
            <ScanLine aria-hidden />
            Escanear
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Descartar el aviso del ticket"
          onClick={() => setDismissed(true)}
          className="shrink-0"
        >
          <X aria-hidden className="text-muted-foreground" />
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <ReceiptText className="size-4 shrink-0 text-chart-3" aria-hidden />
            ¿Tienes el ticket de la compra?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Escanéalo y añadimos los precios: verás el gasto y si algo ha
            subido.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Descartar el aviso del ticket"
          onClick={() => setDismissed(true)}
          className="-mt-1.5 -mr-1.5 shrink-0"
        >
          <X aria-hidden className="text-muted-foreground" />
        </Button>
      </div>
      <Button asChild variant="outline" size="lg" className="md:self-start">
        <Link href="/escanear">
          <ScanLine aria-hidden />
          Escanear ticket
        </Link>
      </Button>
    </section>
  );
}
