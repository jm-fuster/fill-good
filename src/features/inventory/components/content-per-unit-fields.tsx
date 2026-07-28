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
import { MEASURE_UNIT_OPTIONS } from "@/lib/units";
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

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-content-size`}>
        Contenido de cada unidad{" "}
        <span className="text-muted-foreground">(opcional)</span>
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Input
          id={`${idPrefix}-content-size`}
          name="contentSize"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          placeholder="p. ej. 500"
          defaultValue={defaultSize ?? ""}
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
      <p className="text-sm text-muted-foreground">
        Lo que trae cada envase (un brick de 500 ml, una bolsa de 1 kg). Sigues
        contando unidades, pero la app sabe cuánto tienes en casa.
      </p>

      {/* Fruta, carne o pescado: cuentas piezas y pagas al peso, pero la pieza no
          pesa siempre lo mismo. Marcarlo cambia la confianza, no el dato. */}
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${idPrefix}-content-estimate`}
          name="contentIsEstimate"
          defaultChecked={defaultIsEstimate}
          className="mt-0.5 size-5"
        />
        <Label
          htmlFor={`${idPrefix}-content-estimate`}
          className="flex flex-col items-start gap-0.5 font-normal"
        >
          <span>Es un peso medio aproximado</span>
          <span className="text-sm text-muted-foreground">
            Para fruta, carne o pescado: se mostrará con «≈» y no se usará para
            afirmar si te llega.
          </span>
        </Label>
      </div>
    </div>
  );
}
