"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatContentTotal, MEASURE_UNIT_OPTIONS } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";

/**
 * Contenido de cada unidad de un producto contable: "3 bricks de 500 ml".
 *
 * Separa lo que se CUENTA (la cantidad del formulario) de lo que se MIDE y se
 * paga, que es una propiedad del envase, no de la forma de contar. Solo se
 * muestra con unidad 'ud': en kg o l la medida ya ES la cantidad.
 *
 * No confundir con "Unidades por compra" (`pack_size`), que cuenta unidades
 * dentro de una compra (una caja de 30 sobres). Se pueden combinar: un pack de
 * 6 bricks de 1 l.
 *
 * La unidad va con `aria-label` en vez de un `<Label>` propio a propósito: es la
 * segunda mitad de un único campo ("500 ml"), y dos etiquetas de distinto largo
 * en la misma rejilla desalinean los controles.
 */
export function ContentPerUnitFields({
  idPrefix,
  defaultSize = null,
  defaultUnit = null,
  defaultIsEstimate = false,
}: {
  /** Prefijo de los ids: los dos drawers pueden convivir en el árbol. */
  idPrefix: string;
  defaultSize?: number | null;
  defaultUnit?: UnitType | null;
  /** El contenido guardado era un peso medio (fruta, carne al peso). */
  defaultIsEstimate?: boolean;
}) {
  const [unit, setUnit] = useState<UnitType | undefined>(
    defaultUnit ?? undefined,
  );
  const [size, setSize] = useState(defaultSize?.toString() ?? "");
  const [isEstimate, setIsEstimate] = useState(defaultIsEstimate);

  const typed = size.trim() === "" ? Number.NaN : Number(size.replace(",", "."));
  const hasSize = Number.isFinite(typed) && typed > 0;
  const hintId = `${idPrefix}-content-hint`;
  const estimateId = `${idPrefix}-content-estimate`;

  // Mismo trato que el pack: en reposo, qué es esto; en cuanto hay un número, la
  // consecuencia concreta. Con tamaño pero sin unidad, el pie adelanta el error
  // que devolvería el servidor («elige la unidad») en vez de esperar al envío.
  const hint = !hasSize
    ? "Lo que trae cada envase (un brick de 500 ml)."
    : unit
      ? `Cada unidad trae ${formatContentTotal(1, typed, unit)}.`
      : "Elige la unidad del contenido.";

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-content-size`}>Contenido de cada unidad</Label>
      <div className="grid grid-cols-2 gap-3">
        <Input
          id={`${idPrefix}-content-size`}
          name="contentSize"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          placeholder="p. ej. 500"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          aria-describedby={hintId}
        />
        <Select
          value={unit}
          onValueChange={(v) => setUnit(v as UnitType)}
          name="contentUnit"
        >
          <SelectTrigger className="w-full" aria-label="Unidad del contenido">
            <SelectValue placeholder="Unidad" />
          </SelectTrigger>
          <SelectContent>
            {MEASURE_UNIT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        {hint}
      </p>

      {/* Fruta, carne o pescado: cuentas piezas y pagas al peso, pero la pieza no
          pesa siempre lo mismo. Marcarlo cambia la confianza, no el dato.
          Solo aparece con un contenido escrito, porque es un matiz SOBRE ese
          dato: sin contenido, la acción guarda la bandera en false de todas
          formas (lo exige `products_content_estimate_needs_content`), así que
          desmontarlo no pierde nada aunque el FormData salga sin el campo. */}
      {hasSize ? (
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox
            id={estimateId}
            name="contentIsEstimate"
            checked={isEstimate}
            onCheckedChange={(v) => setIsEstimate(v === true)}
            className="size-5"
          />
          <Label htmlFor={estimateId} className="font-normal">
            Es un peso medio (fruta, carne, pescado)
          </Label>
        </div>
      ) : null}
    </div>
  );
}
