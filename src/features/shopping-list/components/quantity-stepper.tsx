"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-error";
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

/** Espera antes de persistir: varios toques seguidos son UNA sola escritura. */
const DEBOUNCE_MS = 600;

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
 *
 * MIENTRAS HAYA UN TOQUE SIN PERSISTIR, LO LOCAL MANDA. Es lo que arregla el
 * «+» que volvía al número anterior: el valor de la fila también llega del
 * servidor (por Realtime o por una relectura), y el eco del primer toque —que
 * trae el número viejo— aterrizaba cuando ya habías dado el segundo, pisando la
 * pantalla Y el acumulador desde el que se calcula el siguiente paso, así que el
 * toque no solo se veía mal: se perdía de verdad.
 */
export function QuantityStepper({
  itemId,
  name,
  quantity,
  unit,
  onQuantityChange,
  onBusy,
}: {
  itemId: string;
  /** Nombre del artículo, solo para las etiquetas accesibles de los botones. */
  name: string;
  quantity: number | null;
  /** Unidad del artículo: fija el paso y si el número se muestra con unidad. */
  unit: UnitType | null;
  /**
   * Aviso al padre de la nueva cantidad, en el mismo toque y sin esperar a que
   * se persista. Con esto la fila entera va a una: el modo compra recuesta la
   * línea y el total al instante, y en `/lista` la equivalencia («= 10 ud») no
   * se queda contando la cantidad vieja.
   */
  onQuantityChange?: (quantity: number | null) => void;
  /**
   * Aviso de que este stepper tiene algo sin asentar (un toque sin persistir o
   * una escritura en vuelo). El padre lo usa para no aplicar a esta fila lo que
   * llegue del servidor mientras tanto, que iría por detrás.
   */
  onBusy?: (busy: boolean) => void;
}) {
  const [qty, setQty] = useState<number | null>(quantity);
  const [serverQty, setServerQty] = useState<number | null>(quantity);
  /**
   * ¿Queda algo local sin asentar (un toque sin persistir o una escritura en
   * vuelo)? En estado y no solo en refs porque hace falta LEERLO AL RENDERIZAR,
   * que es donde se decide si el valor del servidor entra o se descarta.
   */
  const [dirty, setDirty] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lo próximo a persistir, y acumulador para toques rápidos: varias pulsaciones
  // dentro del mismo frame comparten el valor de ese render, así que sin el ref
  // la segunda repetiría el mismo cálculo. Se nota sobre todo a granel, donde
  // bajar de 1 kg a 0 son cuatro toques. Mismo remedio que en la tarjeta de
  // inventario.
  const latest = useRef<number | null>(quantity);
  const writing = useRef(0);
  const busy = useRef(false);

  // Por referencia: el volcado al desmontar los usa desde un cleanup, cuando ya
  // no hay render que capture las props nuevas.
  const idRef = useRef(itemId);
  const notify = useRef({ onQuantityChange, onBusy });
  useEffect(() => {
    idRef.current = itemId;
    notify.current = { onQuantityChange, onBusy };
  });

  /** ¿Manda lo local? Queda un toque sin persistir o una escritura en vuelo. */
  const localWins = useCallback(
    () => timer.current !== null || writing.current > 0,
    [],
  );

  const settle = useCallback(() => {
    if (localWins()) return;
    setDirty(false);
    if (!busy.current) return;
    busy.current = false;
    notify.current.onBusy?.(false);
  }, [localWins]);

  const write = useCallback(() => {
    writing.current += 1;
    setListItemQuantityAction(idRef.current, latest.current)
      .then((r) => {
        if (r?.error) toast.error(r.error);
      })
      .catch((err: unknown) => {
        toast.error(actionErrorMessage("No se pudo guardar la cantidad.", err));
      })
      .finally(() => {
        writing.current -= 1;
        settle();
      });
  }, [settle]);

  // Valor nuevo del servidor (Realtime o relectura): se acepta solo si no hay
  // nada local sin asentar. Si lo hay, se descarta a propósito — es más viejo.
  if (serverQty !== quantity) {
    setServerQty(quantity);
    if (!dirty) setQty(quantity);
  }

  // El acumulador desde el que se calcula el paso siguiente sigue a lo que se
  // ve, salvo mientras manda lo local (ahí lo lleva `persist`).
  useEffect(() => {
    if (!dirty) latest.current = qty;
  }, [qty, dirty]);

  useEffect(() => {
    const armed = timer;
    return () => {
      // La fila se desmonta con un toque sin persistir: al (des)marcar el
      // artículo su `key` cambia y React la remonta, y eso TIRABA la escritura
      // pendiente (dabas al «+», marcabas, y la cantidad volvía a la de antes).
      // Se vuelca ya en vez de perderse.
      if (armed.current !== null) {
        clearTimeout(armed.current);
        armed.current = null;
        write();
      }
      if (busy.current) {
        busy.current = false;
        notify.current.onBusy?.(false);
      }
    };
  }, [write]);

  function persist(next: number | null) {
    latest.current = next;
    setDirty(true);
    if (timer.current !== null) clearTimeout(timer.current);
    if (!busy.current) {
      busy.current = true;
      notify.current.onBusy?.(true);
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      write();
    }, DEBOUNCE_MS);
  }

  function change(next: number | null) {
    setQty(next);
    persist(next);
    notify.current.onQuantityChange?.(next);
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
