"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Cap defensivo: ignorar toques que dejarían la fecha a más de +5 años. */
const MAX_YEARS_AHEAD = 5;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Suma tiempo SOBRE la fecha seleccionada actual (o sobre hoy si está vacía).
 * "+1 semana" dos veces → hoy+14 días; "+1 mes" y luego "+1 semana" → +1 mes +7 días.
 * `setMonth` ya maneja el fin de mes. Si el resultado superaría +5 años, se
 * ignora el toque (se devuelve la fecha actual sin cambios).
 */
function addTime(
  current: string | null,
  kind: "days" | "months",
  amount: number,
): string | null {
  const base = current ? new Date(`${current}T00:00:00`) : new Date();
  base.setHours(0, 0, 0, 0);
  if (kind === "days") base.setDate(base.getDate() + amount);
  else base.setMonth(base.getMonth() + amount);

  const cap = new Date();
  cap.setHours(0, 0, 0, 0);
  cap.setFullYear(cap.getFullYear() + MAX_YEARS_AHEAD);
  if (base.getTime() > cap.getTime()) return current;

  return toISODate(base);
}

const PRESETS = [
  { label: "+3 días", kind: "days", amount: 3 },
  { label: "+1 semana", kind: "days", amount: 7 },
  { label: "+1 mes", kind: "months", amount: 1 },
] as const;

/**
 * Selector rápido de caducidad compartido (F2): chips ADITIVOS (cada toque suma
 * sobre la fecha actual), campo de fecha exacta editable y botón "Borrar".
 * Controlado: el padre mantiene el valor (`value` / `onChange`). Si se pasa
 * `name`, el `<input type="date">` lo lleva para que FormData lo recoja.
 */
export function ExpiryQuickPicker({
  id,
  name,
  value,
  onChange,
  label = "Caducidad",
  ariaLabel,
  showHint = true,
}: {
  id: string;
  name?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  ariaLabel?: string;
  showHint?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label} <span className="text-muted-foreground">(opcional)</span>
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            variant="outline"
            onClick={() => onChange(addTime(value, p.kind, p.amount))}
          >
            {p.label}
          </Button>
        ))}
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            <X aria-hidden />
            Borrar
          </Button>
        ) : null}
      </div>
      <Input
        id={id}
        name={name}
        type="date"
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {showHint ? (
        <p className="text-sm text-muted-foreground">
          Si tienes varios, pon la fecha del que caduque antes.
        </p>
      ) : null}
    </div>
  );
}
