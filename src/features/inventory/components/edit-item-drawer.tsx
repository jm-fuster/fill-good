"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatQuantity, LOCATION_OPTIONS, UNIT_LABELS } from "@/lib/units";
import type { LocationType } from "@/lib/supabase/types";
import type { Category, InventoryEntry } from "../queries";
import { deleteInventoryAction, updateInventoryAction } from "../actions";

const NO_CATEGORY = "__none__";

export function EditItemDrawer({
  entry,
  categories,
  open,
  onOpenChange,
}: {
  entry: InventoryEntry;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // "Consumir pronto" y "Ubicación": controlados, resincronizados cuando el
  // servidor cambia (mismo patrón de ajuste en render que el stepper).
  const [useSoon, setUseSoon] = useState(entry.useSoon);
  const [serverUseSoon, setServerUseSoon] = useState(entry.useSoon);
  if (serverUseSoon !== entry.useSoon) {
    setServerUseSoon(entry.useSoon);
    setUseSoon(entry.useSoon);
  }

  const [location, setLocation] = useState<LocationType>(entry.location);
  const [serverLocation, setServerLocation] = useState(entry.location);
  if (serverLocation !== entry.location) {
    setServerLocation(entry.location);
    setLocation(entry.location);
  }

  const [categoryId, setCategoryId] = useState(entry.categoryId ?? "");
  const [serverCategoryId, setServerCategoryId] = useState(entry.categoryId);
  if (serverCategoryId !== entry.categoryId) {
    setServerCategoryId(entry.categoryId);
    setCategoryId(entry.categoryId ?? "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    const result = await updateInventoryAction({}, formData);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("Cambios guardados");
    onOpenChange(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteInventoryAction(entry.id);
    setDeleting(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Eliminado del inventario");
    onOpenChange(false);
    router.refresh();
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
            <input type="hidden" name="useSoon" value={String(useSoon)} />

            <input type="hidden" name="categoryId" value={categoryId} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-name">Producto</Label>
              <Input
                id="edit-name"
                name="name"
                required
                maxLength={120}
                autoComplete="off"
                defaultValue={entry.productName}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-category">Categoría</Label>
              <Select
                value={categoryId === "" ? NO_CATEGORY : categoryId}
                onValueChange={(v) =>
                  setCategoryId(v === NO_CATEGORY ? "" : v)
                }
              >
                <SelectTrigger id="edit-category" className="w-full">
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ""}
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-location">Ubicación</Label>
              <Select
                value={location}
                onValueChange={(v) => setLocation(v as LocationType)}
                name="location"
              >
                <SelectTrigger id="edit-location" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              <p className="text-sm text-muted-foreground">
                Si tienes varios, pon la fecha del que caduque antes.
              </p>
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

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label htmlFor="edit-use-soon" className="flex flex-col gap-0.5">
                <span>Consumir pronto</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Priorízalo en los menús aunque no caduque
                </span>
              </Label>
              <Switch
                id="edit-use-soon"
                checked={useSoon}
                onCheckedChange={setUseSoon}
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
