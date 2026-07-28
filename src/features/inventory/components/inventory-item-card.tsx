"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductIcon } from "@/components/product-icon";
import { cn } from "@/lib/utils";
import { expiryLabel, getExpiryStatus } from "@/lib/dates";
import {
  contentTotalLabel,
  formatQuantity,
  formatQuantityValue,
  quantityStep,
  roundQuantity,
  stepLabel,
} from "@/lib/units";
import { addProductToListAction } from "@/features/shopping-list/actions";
import type { Category, InventoryEntry } from "../queries";
import { getInventoryStatus } from "../status";
import { setInventoryQuantityAction } from "../actions";
import { EditItemDrawer } from "./edit-item-drawer";

export function InventoryItemCard({
  entry,
  categories,
  householdChains = [],
  onList = false,
  pinned = false,
}: {
  entry: InventoryEntry;
  categories: Category[];
  /** Tiendas habituales del hogar: ordenan el selector de tienda preferida. */
  householdChains?: string[];
  /** El producto ya está en la lista de la compra activa. */
  onList?: boolean;
  /** El producto está en "Mis habituales" del usuario actual (E5). */
  pinned?: boolean;
}) {
  const [qty, setQty] = useState(entry.quantity);
  const [serverQty, setServerQty] = useState(entry.quantity);
  const [editing, setEditing] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  const [, startTransition] = useTransition();
  const [isAdding, startAdding] = useTransition();
  // Ref para que clics rápidos consecutivos acumulen (evita el closure obsoleto).
  const qtyRef = useRef(entry.quantity);

  // Sincroniza el estado local cuando el servidor devuelve un valor nuevo
  // (patrón de ajuste de estado en render, no en efecto).
  if (serverQty !== entry.quantity) {
    setServerQty(entry.quantity);
    setQty(entry.quantity);
  }

  // El ref (para acumular clics rápidos) se sincroniza en un efecto, no en
  // render.
  useEffect(() => {
    qtyRef.current = entry.quantity;
  }, [entry.quantity]);

  function changeBy(delta: number) {
    const next = Math.max(0, roundQuantity(qtyRef.current + delta));
    qtyRef.current = next;
    setQty(next);
    startTransition(async () => {
      const result = await setInventoryQuantityAction(entry.id, next);
      if (result?.error) {
        toast.error(result.error);
        qtyRef.current = entry.quantity;
        setQty(entry.quantity);
      }
    });
  }

  function addToList() {
    startAdding(async () => {
      const result = await addProductToListAction(entry.productId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setAddedToList(true);
        toast.success(`${entry.productName} en la lista de la compra`);
      }
    });
  }

  const expiry = getExpiryStatus(entry.expiryDate);
  // Estado desde el helper compartido (misma clasificación que chips/página),
  // con la cantidad EN VIVO del stepper.
  const status = getInventoryStatus({
    quantity: qty,
    expiryDate: entry.expiryDate,
    useSoon: entry.useSoon,
    minQuantity: entry.minQuantity,
  });
  // El stepper existe para TODA unidad: a granel el paso es el de compra
  // (¼ kg, ½ l, 100 g/ml) en vez de 1, que en gramos no significaba nada.
  const step = quantityStep(entry.unit);
  const stepName = stepLabel(entry.unit);
  // Contenido total cuando el producto declara lo que trae cada unidad: "3 ud"
  // es lo que cuentas, "1,5 l" es lo que de verdad tienes en casa.
  const contentTotal = contentTotalLabel(
    qty,
    entry.unit,
    entry.contentSize !== null && entry.contentUnit !== null
      ? {
          size: entry.contentSize,
          unit: entry.contentUnit,
          estimate: entry.contentIsEstimate,
        }
      : null,
  );
  const emptied = status.out;
  const inList = onList || addedToList;

  return (
    <>
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
            aria-label={`Editar ${entry.productName}`}
          >
            {/* Icono del producto: grande, dentro de la tarjeta, arriba a la
                izquierda (sin caja). Decorativo. */}
            <ProductIcon
              slug={entry.productIcon}
              name={entry.productName}
              categoryIcon={entry.categoryIcon}
              size={32}
              className={cn("shrink-0", emptied && "opacity-50")}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block font-medium break-words line-clamp-2",
                  emptied && "text-muted-foreground",
                )}
              >
                {entry.productName}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {emptied ? (
                  <Badge className="border-transparent bg-warning/15 text-warning">
                    Agotado
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {formatQuantity(qty, entry.unit)}
                    {contentTotal ? ` · ${contentTotal}` : null}
                  </span>
                )}
                {expiry ? (
                  <Badge
                    className={cn(
                      "border-transparent",
                      expiry.status === "expired" &&
                        "bg-destructive/15 text-destructive",
                      expiry.status === "soon" && "bg-warning/15 text-warning",
                      expiry.status === "ok" && "bg-success/15 text-success",
                    )}
                  >
                    {expiryLabel(expiry.days)}
                  </Badge>
                ) : null}
                {status.low ? (
                  <Badge className="border-transparent bg-warning/15 text-warning">
                    Quedan pocas
                  </Badge>
                ) : null}
                {entry.useSoon ? (
                  <Badge className="border-transparent bg-warning/15 text-warning">
                    Consumir pronto
                  </Badge>
                ) : null}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label={`Quitar ${stepName} de ${entry.productName}`}
              onClick={() => changeBy(-step)}
              disabled={qty <= 0}
            >
              <Minus aria-hidden />
            </Button>
            <span
              className="min-w-8 text-center text-sm font-semibold tabular-nums"
              aria-live="polite"
            >
              {/* La key remonta solo el número: pequeño "pop" al cambiar sin
                  reemplazar la región aria-live. */}
              <span
                key={qty}
                className="inline-block animate-in zoom-in-50 duration-150"
              >
                {formatQuantityValue(qty)}
              </span>
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Añadir ${stepName} de ${entry.productName}`}
              onClick={() => changeBy(step)}
            >
              <Plus aria-hidden />
            </Button>
          </div>
        </div>

        {emptied ? (
          <div className="border-t p-2">
            {inList ? (
              <span className="flex h-11 w-full items-center justify-center gap-2 text-sm font-medium text-success">
                <Check aria-hidden className="size-4" />
                En la lista
              </span>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={addToList}
                loading={isAdding}
              >
                <ShoppingCart aria-hidden />
                Añadir a la lista
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <EditItemDrawer
        entry={{ ...entry, quantity: qty }}
        categories={categories}
        householdChains={householdChains}
        open={editing}
        onOpenChange={setEditing}
        pinned={pinned}
      />
    </>
  );
}
