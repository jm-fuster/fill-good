"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProductIcon } from "@/components/product-icon";
import { formatQuantity, LOCATION_ICONS, LOCATION_LABELS } from "@/lib/units";
import type { ReviewEntry } from "../queries";
import { saveExpiryReviewAction } from "../actions";
import { ExpiryQuickPicker } from "./expiry-quick-picker";

type RowState = { expiry: string | null; useSoon: boolean };

export function ExpiryReview({ entries }: { entries: ReviewEntry[] }) {
  const router = useRouter();
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
    <div className="flex flex-col gap-3 pb-32 md:pb-0">
      <p className="text-sm text-muted-foreground">
        Si tienes varios de un producto, pon la fecha del que caduque antes.
      </p>
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
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
                >
                  <ProductIcon
                    slug={entry.productIcon}
                    name={entry.productName}
                    categoryIcon={entry.categoryIcon}
                    size={24}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words line-clamp-2">
                    {entry.productName}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span>{formatQuantity(entry.quantity, entry.unit)}</span>
                    <Badge variant="secondary">
                      {LOCATION_ICONS[entry.location]}{" "}
                      {LOCATION_LABELS[entry.location]}
                    </Badge>
                  </p>
                </div>
              </div>

              <ExpiryQuickPicker
                id={`expiry-${entry.id}`}
                value={expiry}
                onChange={(v) => patch(entry.id, { expiry: v })}
                ariaLabel={`Fecha exacta de caducidad de ${entry.productName}`}
                showHint={false}
              />

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

      <div className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-lg gap-2 px-4 pb-safe md:sticky md:inset-x-auto md:bottom-0 md:mx-0 md:max-w-none md:border-t md:bg-background/95 md:px-0 md:pt-3 md:pb-3 md:backdrop-blur-sm">
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
