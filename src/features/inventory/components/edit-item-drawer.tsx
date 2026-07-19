"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQuantity, UNIT_LABELS } from "@/lib/units";
import type { InventoryEntry } from "../queries";
import { deleteInventoryAction, updateInventoryAction } from "../actions";

export function EditItemDrawer({
  entry,
  open,
  onOpenChange,
}: {
  entry: InventoryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateInventoryAction({}, formData);
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Cambios guardados");
        onOpenChange(false);
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deleteInventoryAction(entry.id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Eliminado del inventario");
        onOpenChange(false);
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle>{entry.productName}</DrawerTitle>
            <DrawerDescription>
              {formatQuantity(entry.quantity, entry.unit)} en existencias
            </DrawerDescription>
          </DrawerHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
            <input type="hidden" name="inventoryId" value={entry.id} />
            <input type="hidden" name="productId" value={entry.productId} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-quantity">
                Cantidad ({UNIT_LABELS[entry.unit]})
              </Label>
              <Input
                id="edit-quantity"
                name="quantity"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                defaultValue={entry.quantity}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-expiry">
                Caducidad{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="edit-expiry"
                name="expiryDate"
                type="date"
                defaultValue={entry.expiryDate ?? ""}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-min">
                Avísame cuando queden menos de{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="edit-min"
                name="minQuantity"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                defaultValue={entry.minQuantity ?? ""}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DrawerFooter className="gap-2 px-0">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 aria-hidden />
                Eliminar del inventario
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
