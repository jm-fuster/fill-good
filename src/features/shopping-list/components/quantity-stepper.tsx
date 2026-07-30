"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { UnitType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  formatQuantity,
  formatQuantityValue,
  isCountable,
  isCountableOrUnset,
  quantityStep,
  roundQuantity,
  stepLabel,
} from "@/lib/units";
import { setListItemQuantityAction } from "../actions";

/**
 * Stepper ± inline para la cantidad de un artículo de la lista (L9). Optimista
 * con persistencia "debounced": una sola escritura al servidor tras dejar de
 * pulsar.
 *
 * El paso depende de la unidad (`quantityStep`): los contables van de uno en
 * uno y lo que se compra al peso salta ¼ kg, ½ l o 100 g/ml. A granel el número
 * se muestra CON su unidad, porque ahí "1,5" a secas no dice nada.
 *
 * Mínimo = un paso: para un contable, «sin cantidad» y «1» acaban igual al
 * finalizar la compra, así que el estado nulo solo escondía los controles, y las
 * filas antiguas con null se pintan como 1 (que es lo que valen). A granel, en
 * cambio, «sin cantidad» sí significa algo distinto de «1 kg» ("tomates, ya veré
 * cuántos cojo"), así que se respeta y se muestra "—" hasta el primer «+». Para
 * quitar el artículo están el deslizamiento y la papelera, no el «−».
 *
 * Se usa en `/lista` (al montar la lista) y en el modo compra (para corregir en
 * el pasillo lo que no había: apuntaste 3 cajas y solo quedaban 2, o la bolsa
 * pesó 0,75 kg y no 1). Es el mismo campo en los dos sitios, así que lo que
 * entra al inventario al finalizar es siempre lo que de verdad se metió en el
 * carro.
 */
export function QuantityStepper({
  itemId,
  name,
  quantity,
  unit,
  onQuantityChange,
}: {
  itemId: string;
  /** Nombre del artículo, solo para las etiquetas accesibles de los botones. */
  name: string;
  quantity: number | null;
  /** Unidad del artículo: fija el paso y si el número se muestra con unidad. */
  unit: UnitType | null;
  /**
   * Aviso al padre de la nueva cantidad, en el mismo toque y sin esperar a que
   * se persista. Lo usa el modo compra para recostear la línea y el total al
   * instante: sin esto, la banda de precios seguiría mostrando la cuenta de la
   * cantidad vieja hasta que Realtime devolviera el cambio (más de medio
   * segundo después), justo en la pantalla que existe para vigilar el total.
   */
  onQuantityChange?: (quantity: number | null) => void;
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

  // `latest` (lo próximo a persistir) hace también de acumulador para toques
  // rápidos: varias pulsaciones dentro del mismo frame comparten el valor de ese
  // render, así que sin el ref la segunda repetiría el mismo cálculo. Se nota
  // sobre todo a granel, donde bajar de 1 kg a 0 son cuatro toques. Mismo
  // remedio que en la tarjeta de inventario. Se resincroniza cuando el servidor
  // (o Realtime) manda un valor nuevo.
  useEffect(() => {
    latest.current = quantity;
  }, [quantity]);

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
    onQuantityChange?.(next);
  }

  const step = quantityStep(unit);
  const stepName = stepLabel(unit);
  const countable = isCountableOrUnset(unit);
  // Valor efectivo: un contable sin cantidad vale 1 en la compra, así que se
  // muestra como 1; a granel el null se conserva (no es lo mismo que 0,25 kg).
  const effective = (v: number | null) => v ?? (countable ? 1 : null);
  const shown = effective(qty);
  const text =
    shown === null
      ? "—"
      : unit === null || isCountable(unit)
        ? formatQuantityValue(shown)
        : formatQuantity(shown, unit);
  const dec = () => {
    const base = effective(latest.current);
    if (base !== null && base > step) change(roundQuantity(base - step));
  };
  const inc = () => change(roundQuantity((effective(latest.current) ?? 0) + step));

  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Restar ${stepName} a ${name}`}
        onClick={dec}
        disabled={shown === null || shown <= step}
      >
        <Minus aria-hidden className="text-muted-foreground" />
      </Button>
      <span
        className={cn(
          "text-center text-sm tabular-nums",
          // A granel el número lleva unidad ("0,75 kg"): un suelo algo mayor
          // evita el baile de anchura, y los valores largos crecen solos.
          countable ? "min-w-6" : "min-w-10",
        )}
        aria-live="polite"
      >
        {/* La key remonta solo el número: pequeño "pop" al cambiar sin
            reemplazar la región aria-live. */}
        <span
          key={text}
          className="inline-block animate-in zoom-in-50 duration-150"
        >
          {text}
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Sumar ${stepName} a ${name}`}
        onClick={inc}
      >
        <Plus aria-hidden className="text-muted-foreground" />
      </Button>
    </div>
  );
}
