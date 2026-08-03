"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatPurchaseQuantity } from "@/lib/units";
import type { AddListItemsInput } from "@/features/shopping-list/schemas";
import type { RestockCandidate } from "@/features/shopping-list/queries";
import { suggestionReasonLabel } from "@/features/shopping-list/suggestion-reason";

/** Todo marcado al abrir: el sentido de esto es apuntarlo en un toque. */
export function initialRestockSelection(
  candidates: RestockCandidate[],
): Set<string> {
  return new Set(candidates.map((c) => c.productId));
}

/** Payload para `addListItemsAction`: los marcados, con su cantidad sugerida. */
export function restockPayload(
  candidates: RestockCandidate[],
  selected: ReadonlySet<string>,
): AddListItemsInput {
  return candidates
    .filter((c) => selected.has(c.productId))
    .map((c) => ({
      kind: "product" as const,
      productId: c.productId,
      quantity: c.suggestedQuantity,
    }));
}

/** Copia del aviso tras apuntar, compartida por los dos sitios que lo hacen. */
export function restockToastMessage(result: {
  added?: number;
  merged?: number;
}): string {
  const added = result.added ?? 0;
  const merged = result.merged ?? 0;
  const total = added + merged;
  if (total === 0) return "No se apuntó nada";
  const base =
    total === 1
      ? "1 producto apuntado en la lista"
      : `${total} productos apuntados en la lista`;
  // Solo se fusiona si entre calcular y confirmar alguien lo apuntó desde otro
  // móvil: entonces se suma a esa fila en vez de duplicarla (L3). Decirlo evita
  // que el número del aviso parezca no cuadrar con las filas nuevas de /lista.
  return merged > 0 ? `${base} (sumado a lo que ya había)` : base;
}

/**
 * Lo que se ha quedado a cero (o bajo mínimo) al cocinar, para apuntarlo sin
 * salir del gesto. Cierra el círculo inventario → lista: el momento en que se
 * vacía la nevera es el momento en que nace la compra, y hasta ahora eso solo se
 * descubría al abrir /lista, quizá ya en la puerta del supermercado.
 *
 * Solo los campos, igual que `CookedDeductionsFields`: quien lo monta pone el
 * título y el botón. Lo comparten el drawer de «Lo cocinamos» (que lo enseña como
 * segundo paso del mismo modal) y el repaso de platos (inline en la fila); anidar
 * `ResponsiveModal` no es una opción, porque el segundo se cierra solo.
 *
 * El motivo se toma de `suggestionReasonLabel`, el mismo que usa /lista: si aquí
 * dijera «Se ha agotado» y allí otra cosa para el mismo producto, la app parecería
 * estar contando dos historias distintas.
 */
export function CookedRestockFields({
  candidates,
  selected,
  onToggle,
  idPrefix = "restock",
}: {
  candidates: RestockCandidate[];
  selected: ReadonlySet<string>;
  onToggle: (productId: string, on: boolean) => void;
  /** Prefijo de los id de checkbox: en el repaso hay varias filas a la vez. */
  idPrefix?: string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {candidates.map((c) => {
        const cbId = `${idPrefix}-${c.productId}`;
        return (
          <li
            key={c.productId}
            className="flex items-start gap-3 rounded-xl border p-3"
          >
            <Checkbox
              id={cbId}
              checked={selected.has(c.productId)}
              onCheckedChange={(v) => onToggle(c.productId, v === true)}
              className="mt-0.5 size-5"
            />
            <Label
              htmlFor={cbId}
              className="flex flex-1 cursor-pointer flex-col items-start gap-1 font-normal"
            >
              <span className="text-sm font-medium break-words">{c.name}</span>
              <span className="text-xs text-muted-foreground">
                {suggestionReasonLabel(c)} ·{" "}
                {formatPurchaseQuantity(c.suggestedQuantity, c.unit, c.packSize)}
              </span>
            </Label>
          </li>
        );
      })}
    </ul>
  );
}
