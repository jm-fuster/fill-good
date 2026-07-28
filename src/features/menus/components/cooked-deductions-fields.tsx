"use client";

import { Input } from "@/components/ui/input";
import { formatQuantity, UNIT_LABELS } from "@/lib/units";
import type { CookedDeduction } from "../cooked";
import type { CookedDeductionInput } from "../actions";

/**
 * Cantidades prellenadas con las de la receta, solo para lo descontable. El
 * valor es string porque lo edita un `<input type="number">`.
 */
export function initialDeductionQty(
  items: CookedDeduction[],
): Record<string, string> {
  const init: Record<string, string> = {};
  for (const it of items) {
    if (it.deductible) init[it.key] = String(it.suggestedQty);
  }
  return init;
}

/** Cuántas líneas se descontarían con las cantidades actuales. */
export function deductionCount(
  items: CookedDeduction[],
  qty: Record<string, string>,
): number {
  return items.filter(
    (it) => it.deductible && (Number(qty[it.key]) || 0) > 0,
  ).length;
}

/** Payload para `confirmCookedDeductionsAction`: solo descontables con cantidad. */
export function deductionPayload(
  items: CookedDeduction[],
  qty: Record<string, string>,
): CookedDeductionInput[] {
  return items
    .filter((it) => it.deductible)
    .map((it) => ({
      productId: it.productId!,
      unit: it.unit!,
      quantity: Number(qty[it.key]) || 0,
    }))
    .filter((p) => p.quantity > 0);
}

/**
 * Revisión de cantidades a descontar del inventario (M2): los ingredientes con
 * match y stock, con cantidad editable, y aparte los que no se pueden descontar
 * (sin match, sin stock o unidad incompatible).
 *
 * Solo los campos: quien lo monta pone el título y el botón de confirmar. Así lo
 * comparten el drawer de «Lo cocinamos» (modal propio) y el repaso de platos,
 * que lo despliega INLINE en la fila —ahí no puede abrirse otro modal encima,
 * porque anidar `ResponsiveModal` hace que el segundo se cierre solo—.
 */
export function CookedDeductionsFields({
  items,
  qty,
  onQtyChange,
}: {
  items: CookedDeduction[];
  qty: Record<string, string>;
  onQtyChange: (key: string, value: string) => void;
}) {
  const deductibles = items.filter((i) => i.deductible);
  const informational = items.filter((i) => !i.deductible);

  return (
    <>
      {deductibles.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {deductibles.map((it) => (
            <li
              key={it.key}
              className="flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium break-words line-clamp-2">
                  {it.productName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Tienes {formatQuantity(it.availableQty, it.unit!)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="decimal"
                  aria-label={`Cantidad a descontar de ${it.productName}`}
                  min={0}
                  max={it.availableQty}
                  step={it.unit === "ud" ? 1 : 0.01}
                  value={qty[it.key] ?? ""}
                  onChange={(e) => onQtyChange(it.key, e.target.value)}
                  className="w-20 text-right"
                />
                <span className="w-7 text-sm text-muted-foreground">
                  {UNIT_LABELS[it.unit!]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {informational.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            No se descuenta
          </p>
          <ul className="flex flex-col gap-1.5">
            {informational.map((it) => (
              <li
                key={it.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-2 text-sm"
              >
                <span className="min-w-0 truncate">{it.ingredientName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {it.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
