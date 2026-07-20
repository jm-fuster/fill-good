"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatQuantity, LOCATION_ICONS, LOCATION_LABELS } from "@/lib/units";
import type { ReviewEntry } from "../queries";
import { saveExpiryReviewAction } from "../actions";

type RowState = { expiry: string | null; useSoon: boolean };

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Presets de caducidad relativos a hoy, calculados en cliente. */
function useExpiryPresets() {
  return useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const plusDays = (n: number) => {
      const d = new Date(base);
      d.setDate(d.getDate() + n);
      return toISODate(d);
    };
    const plusMonths = (n: number) => {
      const d = new Date(base);
      d.setMonth(d.getMonth() + n);
      return toISODate(d);
    };
    return [
      { label: "+3 días", value: plusDays(3) },
      { label: "+1 semana", value: plusDays(7) },
      { label: "+1 mes", value: plusMonths(1) },
    ];
  }, []);
}

export function ExpiryReview({ entries }: { entries: ReviewEntry[] }) {
  const router = useRouter();
  const presets = useExpiryPresets();
  const [pending, setPending] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      entries.map((e) => [e.id, { expiry: e.expiryDate, useSoon: e.useSoon }]),
    ),
  );

  function patch(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function skip() {
    router.push("/inventario");
  }

  async function save() {
    setPending(true);
    const updates = entries.map((e) => ({
      id: e.id,
      expiryDate: rows[e.id]?.expiry ?? null,
      useSoon: rows[e.id]?.useSoon ?? false,
    }));
    const result = await saveExpiryReviewAction(updates);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Caducidades guardadas");
    router.push("/inventario");
  }

  return (
    <div className="flex flex-col gap-3 pb-32">
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => {
          const row = rows[entry.id];
          const expiry = row?.expiry ?? null;
          const useSoon = row?.useSoon ?? false;
          return (
            <li
              key={entry.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg"
                >
                  {entry.categoryIcon ?? "📦"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{entry.productName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span>{formatQuantity(entry.quantity, entry.unit)}</span>
                    <Badge variant="secondary">
                      {LOCATION_ICONS[entry.location]}{" "}
                      {LOCATION_LABELS[entry.location]}
                    </Badge>
                  </p>
                </div>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-xs font-medium text-muted-foreground">
                  Caducidad{" "}
                  <span className="font-normal">(opcional)</span>
                </legend>
                <div className="flex flex-wrap items-center gap-2">
                  {presets.map((p) => (
                    <Button
                      key={p.label}
                      type="button"
                      variant={expiry === p.value ? "default" : "outline"}
                      aria-pressed={expiry === p.value}
                      onClick={() =>
                        patch(entry.id, {
                          expiry: expiry === p.value ? null : p.value,
                        })
                      }
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                <Input
                  type="date"
                  aria-label={`Fecha exacta de caducidad de ${entry.productName}`}
                  value={expiry ?? ""}
                  onChange={(e) =>
                    patch(entry.id, { expiry: e.target.value || null })
                  }
                />
              </fieldset>

              <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <Label
                  htmlFor={`use-soon-${entry.id}`}
                  className="text-sm font-normal"
                >
                  Consumir pronto
                </Label>
                <Switch
                  id={`use-soon-${entry.id}`}
                  checked={useSoon}
                  onCheckedChange={(v) => patch(entry.id, { useSoon: v })}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-lg gap-2 px-4 pb-safe">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1 bg-background shadow-lg"
          onClick={skip}
          disabled={pending}
        >
          Omitir
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-1 shadow-lg sm:flex-[2]"
          onClick={save}
          disabled={pending}
        >
          <Check aria-hidden />
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
