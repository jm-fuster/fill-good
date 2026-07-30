"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { effectivePackSize, formatQuantity } from "@/lib/units";

/**
 * Unidades por compra (`pack_size`, F4): una caja de 30 sobres, un cartón de 10
 * huevos. Es un MULTIPLICADOR — lo que entra al inventario al finalizar la compra
 * o al confirmar un ticket es cantidad × pack—, así que el campo dice de vuelta
 * qué va a hacer con el número. Sin ese eco, un dedo torpe aquí mete diez veces
 * más de lo comprado y no se nota hasta mirar el inventario.
 *
 * Solo se muestra con unidad 'ud': multiplicar kilos por «unidades de la compra»
 * no significa nada, y así lo trata también `effectivePackSize`.
 *
 * No confundir con el contenido de cada unidad (`ContentPerUnitFields`), que mide
 * lo que trae el envase. Se combinan: un pack de 6 bricks de 1 l.
 */
export function PackSizeField({
  idPrefix,
  defaultValue = null,
}: {
  /** Prefijo de los ids: los dos drawers pueden convivir en el árbol. */
  idPrefix: string;
  defaultValue?: number | null;
}) {
  const [value, setValue] = useState(defaultValue?.toString() ?? "");

  const typed = value.trim() === "" ? Number.NaN : Number(value);
  const pack = effectivePackSize("ud", typed);
  // Un 1 es un no-op silencioso (`effectivePackSize` lo descarta), y callarlo
  // dejaría a quien lo escribe esperando un multiplicador que no va a llegar.
  const isNoop = typed === 1;
  const hintId = `${idPrefix}-pack-hint`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-pack`}>
        Unidades por compra{" "}
        <span className="text-muted-foreground">(opcional)</span>
      </Label>
      <Input
        id={`${idPrefix}-pack`}
        name="packSize"
        type="number"
        inputMode="numeric"
        min={1}
        step="any"
        placeholder="p. ej. 30"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={hintId}
      />
      {/* La consecuencia concreta sustituye a la explicación genérica en cuanto
          hay un número: ya ha hecho su trabajo, y repetir las dos alarga un
          drawer que en móvil se recorre a pulgar. */}
      <p id={hintId} className="text-sm text-muted-foreground">
        {pack
          ? `Cada compra repondrá ${formatQuantity(pack, "ud")} en el inventario.`
          : isNoop
            ? "Con 1 no hay pack: cada compra repone una unidad."
            : "Si lo compras en cajas (p. ej. 30 sobres), pon cuántas unidades trae cada compra."}
      </p>
    </div>
  );
}
