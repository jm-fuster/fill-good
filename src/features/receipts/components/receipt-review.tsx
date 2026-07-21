"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ProductCombobox,
  type ComboboxProduct,
} from "@/components/product-combobox";
import { cn } from "@/lib/utils";
import type { UnitType } from "@/lib/supabase/types";
import type { ReceiptHeader, ReceiptItem } from "../queries";
import { confirmReceiptAction, type ConfirmItemDecision } from "../actions";

type Row = {
  itemId: string;
  description: string;
  quantity: string;
  unit: UnitType;
  productId: string | null;
  include: boolean;
  totalPrice: number | null;
  rawText: string | null;
  /** Estado del match al escanear: fija el orden/agrupación (no cambia en vivo). */
  initialStatus: string;
};

/** Una línea "necesita decisión" si la IA no la asoció a un producto existente. */
function needsDecision(status: string): boolean {
  return status !== "auto" && status !== "manual";
}

export function ReceiptReview({
  receipt,
  items,
  products,
}: {
  receipt: ReceiptHeader;
  items: ReceiptItem[];
  products: ComboboxProduct[];
}) {
  const router = useRouter();
  const [storeName, setStoreName] = useState(receipt.storeName ?? "");
  const [purchaseDate, setPurchaseDate] = useState(receipt.purchasedAt ?? "");
  const [total, setTotal] = useState(
    receipt.total === null ? "" : String(receipt.total),
  );
  const [pending, setPending] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    // Las líneas que necesitan decisión (new_product / sin match) van primero,
    // para que no queden enterradas; dentro de cada grupo se respeta el orden
    // del ticket (sort estable).
    items
      .map<Row>((i) => ({
        itemId: i.id,
        description: i.description,
        quantity: String(i.quantity),
        unit: i.unit,
        productId: i.productId,
        include: true,
        totalPrice: i.totalPrice,
        rawText: i.rawText,
        initialStatus: i.matchStatus,
      }))
      .sort(
        (a, b) =>
          Number(needsDecision(b.initialStatus)) -
          Number(needsDecision(a.initialStatus)),
      ),
  );

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.itemId === id ? { ...r, ...patch } : r)),
    );
  }

  async function confirm() {
    setPending(true);
    const decisions: ConfirmItemDecision[] = rows.map((r) => ({
      itemId: r.itemId,
      description: r.description.trim() || "Producto",
      quantity: Number(r.quantity.replace(",", ".")) || 1,
      unit: r.unit,
      productId: r.productId,
      skip: !r.include,
    }));
    const result = await confirmReceiptAction({
      receiptId: receipt.id,
      storeName: storeName.trim() || null,
      purchaseDate: purchaseDate || null,
      total: total ? Number(total.replace(",", ".")) : null,
      items: decisions,
    });
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `${result.added} producto${result.added === 1 ? "" : "s"} añadido${
        result.added === 1 ? "" : "s"
      } al inventario`,
    );
    // Revisión opcional de caducidades de lo recién añadido.
    const ids = result.inventoryItemIds ?? [];
    if (ids.length > 0) {
      router.push(`/inventario/revision?items=${ids.join(",")}`);
    } else {
      router.push("/inventario");
    }
  }

  const includedCount = rows.filter((r) => r.include).length;
  const pendingRows = rows.filter((r) => needsDecision(r.initialStatus));
  const matchedRows = rows.filter((r) => !needsDecision(r.initialStatus));

  function renderRow(row: Row) {
    const linked = row.productId !== null;
    return (
      <div
        key={row.itemId}
        className="flex flex-col gap-2 rounded-xl border p-3"
      >
        <div className="flex items-start gap-2">
          <Checkbox
            checked={row.include}
            onCheckedChange={(v) => update(row.itemId, { include: v === true })}
            aria-label="Incluir este producto"
            className="mt-1 size-5"
          />
          <div className="flex-1">
            <Input
              value={row.description}
              onChange={(e) =>
                update(row.itemId, { description: e.target.value })
              }
              aria-label="Nombre del producto"
              disabled={!row.include}
            />
            {row.rawText ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {row.rawText}
                {row.totalPrice !== null
                  ? ` · ${row.totalPrice.toFixed(2)} €`
                  : ""}
              </p>
            ) : null}
          </div>
          <Input
            value={row.quantity}
            onChange={(e) => update(row.itemId, { quantity: e.target.value })}
            type="number"
            inputMode="decimal"
            step="any"
            className="w-16"
            aria-label="Cantidad"
            disabled={!row.include}
          />
        </div>
        {row.include ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Producto del catálogo
              </span>
              {linked ? (
                <Badge
                  className={cn(
                    "border-transparent bg-success/15 text-success",
                  )}
                >
                  <Check aria-hidden className="size-3" />
                  {row.initialStatus === "auto"
                    ? "Asociado automáticamente"
                    : "Asociado"}
                </Badge>
              ) : (
                <Badge className="border-transparent bg-warning/15 text-warning">
                  Elegir producto
                </Badge>
              )}
            </div>
            <ProductCombobox
              products={products}
              value={row.productId}
              onChange={(id) => update(row.itemId, { productId: id })}
              allowCreateNew
              createNewLabel="➕ Crear producto nuevo"
              ariaLabel="Producto asociado"
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del ticket</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rv-store">Tienda</Label>
            <Input
              id="rv-store"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rv-date">Fecha</Label>
              <Input
                id="rv-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rv-total">Total (€)</Label>
              <Input
                id="rv-total"
                type="number"
                inputMode="decimal"
                step="any"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-medium">
          Productos ({includedCount} de {rows.length})
        </h2>

        {pendingRows.length > 0 ? (
          <div className="mb-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-warning">
              Necesitan decisión ({pendingRows.length})
            </p>
            {pendingRows.map(renderRow)}
          </div>
        ) : null}

        {matchedRows.length > 0 ? (
          <div className="flex flex-col gap-2">
            {pendingRows.length > 0 ? (
              <p className="text-xs font-medium text-muted-foreground">
                Asociados ({matchedRows.length})
              </p>
            ) : null}
            {matchedRows.map(renderRow)}
          </div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-lg px-4 pb-safe">
        <Button
          size="lg"
          className="w-full shadow-lg"
          disabled={pending || includedCount === 0}
          onClick={confirm}
        >
          <Check aria-hidden />
          {pending ? "Guardando…" : "Confirmar y añadir al inventario"}
        </Button>
      </div>
    </div>
  );
}
