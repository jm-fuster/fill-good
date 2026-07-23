"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { UNIT_OPTIONS } from "@/lib/units";
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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Unidad controlada, resincronizada cuando cambia el item mostrado.
  const [unit, setUnit] = useState<UnitType>(item.unit ?? "ud");
  const [serverUnit, setServerUnit] = useState(item.unit);
  if (serverUnit !== item.unit) {
    setServerUnit(item.unit);
    setUnit(item.unit ?? "ud");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    const result = await updateListItemAction({}, formData);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("Cambios guardados");
    onOpenChange(false);
    router.refresh();
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
            />
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
                defaultValue={item.quantity ?? ""}
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

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <ResponsiveModalFooter className="gap-2 px-0">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              <Trash2 aria-hidden />
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
