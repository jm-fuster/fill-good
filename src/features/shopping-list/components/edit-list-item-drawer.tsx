"use client";

import { useState } from "react";
import { Trash } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  effectivePackSize,
  formatPurchaseQuantity,
  formatQuantity,
  listTotalLabel,
  UNIT_OPTIONS,
} from "@/lib/units";
import { actionErrorMessage } from "@/lib/action-error";
import type { UnitType } from "@/lib/supabase/types";
import type { ListItem } from "../queries";
import { updateListItemAction } from "../actions";

export function EditListItemDrawer({
  item,
  open,
  onOpenChange,
  onRemove,
}: {
  item: ListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quitar de la lista con ventana de "Deshacer" (L6). */
  onRemove: (item: ListItem) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Unidad y cantidad controladas para poder decir a qué equivale la línea
  // mientras se teclea. Se resincronizan comparando el propio item —y no sus
  // campos— porque dos artículos distintos pueden compartir unidad y cantidad, y
  // ahí una comparación por valor no detectaría el cambio.
  const [unit, setUnit] = useState<UnitType>(item.unit ?? "ud");
  const [quantity, setQuantity] = useState(item.quantity?.toString() ?? "");
  const [shownItem, setShownItem] = useState(item);
  if (shownItem !== item) {
    setShownItem(item);
    setUnit(item.unit ?? "ud");
    setQuantity(item.quantity?.toString() ?? "");
  }

  // Pack (F4): con él, la cantidad de la lista cuenta COMPRAS, no unidades. Se
  // resuelve contra la unidad ELEGIDA aquí, no la guardada: pasar el artículo a
  // kg desactiva el pack, y el aviso tiene que caerse con él.
  const pack = effectivePackSize(unit, item.packSize);
  const typed = quantity.trim() === "" ? Number.NaN : Number(quantity);
  const total = listTotalLabel(
    Number.isFinite(typed) ? typed : null,
    unit,
    item.content ?? null,
    item.packSize ?? null,
  );
  // Con cantidad, la equivalencia completa ("2 packs = 20 ud"); sin ella, al
  // menos el factor, que es lo que hay que saber ANTES de escribir el número.
  const equivalence = total
    ? `${formatPurchaseQuantity(typed, unit, item.packSize ?? null)} ${total}`
    : pack
      ? `Viene en pack de ${formatQuantity(pack, "ud")}.`
      : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      const result = await updateListItemAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Cambios guardados");
      onOpenChange(false);
      // Sin `router.refresh()`: la acción ya revalida `/lista` (así se refresca
      // el catálogo si el nombre cambió) y la fila la actualiza el cambio suelto
      // de Realtime. Refrescar además duplicaba el render de la página.
    } catch (err) {
      setError(actionErrorMessage("No se pudieron guardar los cambios.", err));
    } finally {
      setPending(false);
    }
  }

  function handleDelete() {
    // Cierra el drawer y delega en el borrado diferido con "Deshacer" (L6).
    onOpenChange(false);
    onRemove(item);
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Editar producto</ResponsiveModalTitle>
        </ResponsiveModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <input type="hidden" name="itemId" value={item.id} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-list-name">Producto</Label>
            <Input
              id="edit-list-name"
              name="name"
              required
              maxLength={120}
              autoComplete="off"
              defaultValue={item.name}
              aria-describedby={
                item.productId ? "edit-list-name-hint" : undefined
              }
            />
            {/* El ítem vinculado muestra el nombre del producto, así que
                editarlo aquí lo renombra en todo el hogar. Decirlo evita la
                sorpresa de ver cambiado el inventario sin haber entrado. */}
            {item.productId ? (
              <p
                id="edit-list-name-hint"
                className="text-xs text-muted-foreground"
              >
                Cambiarlo renombra el producto también en el inventario.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-list-quantity">
                Cantidad{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="edit-list-quantity"
                name="quantity"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-describedby={
                  equivalence ? "edit-list-equivalence" : undefined
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-list-unit">Unidad</Label>
              <Select
                value={unit}
                onValueChange={(v) => setUnit(v as UnitType)}
                name="unit"
              >
                <SelectTrigger id="edit-list-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fuera del grid a propósito: a media columna la frase se parte en
              tres líneas justo cuando más se necesita leer de un golpe. */}
          {equivalence ? (
            <p
              id="edit-list-equivalence"
              className="-mt-2 text-xs text-muted-foreground"
            >
              {equivalence}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <ResponsiveModalFooter className="gap-2 px-0">
            <Button type="submit" size="lg" loading={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              <Trash aria-hidden />
              Quitar de la lista
            </Button>
            <ResponsiveModalClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </ResponsiveModalClose>
          </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
