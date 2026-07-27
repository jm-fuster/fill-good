"use client";

import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setListItemQuantityAction } from "../actions";

/**
 * Stepper ±1 inline para artículos contables de la lista (L9). Optimista con
 * persistencia "debounced": una sola escritura al servidor tras dejar de pulsar.
 *
 * Siempre visible y con mínimo 1: para un contable, «sin cantidad» y «1» acaban
 * igual al finalizar la compra, así que el estado nulo solo escondía los
 * controles. Las filas antiguas que sí tengan null se pintan como 1 (que es lo
 * que valen) y se materializan en cuanto se toca el stepper. Para quitar el
 * artículo están el deslizamiento y la papelera, no el «−».
 *
 * Se usa en `/lista` (al montar la lista) y en el modo compra (para corregir en
 * el pasillo lo que no había: apuntaste 3 cajas y solo quedaban 2). Es el mismo
 * campo en los dos sitios, así que lo que entra al inventario al finalizar es
 * siempre lo que de verdad se metió en el carro.
 */
export function QuantityStepper({
  itemId,
  name,
  quantity,
}: {
  itemId: string;
  /** Nombre del artículo, solo para las etiquetas accesibles de los botones. */
  name: string;
  quantity: number | null;
}) {
  const [qty, setQty] = useState<number | null>(quantity);
  const [serverQty, setServerQty] = useState<number | null>(quantity);
  // Reconciliar con el servidor (Realtime/refresh) sin pisar el optimismo local.
  if (serverQty !== quantity) {
    setServerQty(quantity);
    setQty(quantity);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<number | null>(quantity);

  function persist(next: number | null) {
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setListItemQuantityAction(itemId, latest.current).then((r) => {
        if (r?.error) toast.error(r.error);
      });
    }, 600);
  }

  function change(next: number | null) {
    setQty(next);
    persist(next);
  }

  // Valor efectivo: una fila antigua sin cantidad vale 1 en la compra, así que
  // se muestra como 1 en vez de esconder el stepper.
  const shown = qty ?? 1;
  const dec = () => {
    if (shown > 1) change(shown - 1);
  };
  const inc = () => change(shown + 1);

  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Restar uno a ${name}`}
        onClick={dec}
        disabled={shown <= 1}
      >
        <Minus aria-hidden className="text-muted-foreground" />
      </Button>
      <span
        className="min-w-6 text-center text-sm tabular-nums"
        aria-live="polite"
      >
        {/* La key remonta solo el número: pequeño "pop" al cambiar sin
            reemplazar la región aria-live. */}
        <span
          key={shown}
          className="inline-block animate-in zoom-in-50 duration-150"
        >
          {shown}
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Sumar uno a ${name}`}
        onClick={inc}
      >
        <Plus aria-hidden className="text-muted-foreground" />
      </Button>
    </div>
  );
}
