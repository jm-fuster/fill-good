"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
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
import { Switch } from "@/components/ui/switch";
import {
  ProductCombobox,
  type ComboboxProduct,
} from "@/components/product-combobox";
import { cn } from "@/lib/utils";
import { formatQuantity, LOCATION_OPTIONS, UNIT_LABELS } from "@/lib/units";
import type { InventoryEventKind, LocationType } from "@/lib/supabase/types";
import type { Category, InventoryEntry } from "../queries";
import { getInventoryStatus } from "../status";
import {
  deleteInventoryAction,
  getMergeCandidatesAction,
  mergeProductsAction,
  togglePinAction,
  updateInventoryAction,
} from "../actions";
import {
  deleteAliasAction,
  getProductAliasesAction,
  type ProductAlias,
} from "@/features/receipts/actions";
import { ExpiryQuickPicker } from "./expiry-quick-picker";

const NO_CATEGORY = "__none__";

export function EditItemDrawer({
  entry,
  categories,
  open,
  onOpenChange,
  pinned = false,
}: {
  entry: InventoryEntry;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El producto está en "Mis habituales" del usuario actual (E5). */
  pinned?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Pin "Mis habituales": optimista, resincronizado con el prop del servidor.
  const [isPinned, setIsPinned] = useState(pinned);
  const [serverPinned, setServerPinned] = useState(pinned);
  const [pinPending, startPin] = useTransition();
  if (serverPinned !== pinned) {
    setServerPinned(pinned);
    setIsPinned(pinned);
  }

  function togglePin(next: boolean) {
    setIsPinned(next);
    startPin(async () => {
      const res = await togglePinAction(entry.productId);
      if (res.error) {
        toast.error(res.error);
        setIsPinned(!next);
        return;
      }
      if (typeof res.pinned === "boolean") setIsPinned(res.pinned);
      toast.success(
        res.pinned
          ? `${entry.productName} en Mis habituales`
          : `${entry.productName} quitado de Mis habituales`,
      );
      router.refresh();
    });
  }

  // Aliases aprendidos (E8): se recargan bajo demanda al abrir el drawer (cada
  // tarjeta tiene su propio drawer, así que productId no cambia en una instancia).
  const [aliases, setAliases] = useState<ProductAlias[]>([]);
  const [removingAlias, startRemove] = useTransition();
  useEffect(() => {
    if (!open) return;
    let active = true;
    getProductAliasesAction(entry.productId).then((rows) => {
      if (active) setAliases(rows);
    });
    return () => {
      active = false;
    };
  }, [open, entry.productId]);

  function removeAlias(id: string) {
    const prev = aliases;
    setAliases((a) => a.filter((x) => x.id !== id));
    startRemove(async () => {
      const res = await deleteAliasAction(id);
      if (res.error) {
        toast.error(res.error);
        setAliases(prev);
      }
    });
  }

  // Fusionar con otro producto (E9): candidatos cargados al abrir el drawer.
  const [mergeCandidates, setMergeCandidates] = useState<ComboboxProduct[]>([]);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [merging, startMerge] = useTransition();
  useEffect(() => {
    if (!open) return;
    let active = true;
    getMergeCandidatesAction(entry.productId).then((rows) => {
      if (active) {
        setMergeCandidates(rows);
        setMergeTarget(null);
      }
    });
    return () => {
      active = false;
    };
  }, [open, entry.productId]);

  function confirmMerge() {
    if (!mergeTarget) return;
    startMerge(async () => {
      const res = await mergeProductsAction(entry.productId, mergeTarget);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Productos fusionados");
      onOpenChange(false);
      router.refresh();
    });
  }

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

  const [expiryDate, setExpiryDate] = useState<string | null>(
    entry.expiryDate,
  );
  const [serverExpiryDate, setServerExpiryDate] = useState(entry.expiryDate);
  if (serverExpiryDate !== entry.expiryDate) {
    setServerExpiryDate(entry.expiryDate);
    setExpiryDate(entry.expiryDate);
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

  // ¿El lote está caducado o caduca pronto? Solo entonces preguntamos si se
  // consumió o se tiró (M8); en el caso feliz se registra consumo sin fricción.
  const status = getInventoryStatus({
    quantity: entry.quantity,
    expiryDate: entry.expiryDate,
    useSoon: entry.useSoon,
    minQuantity: entry.minQuantity,
  });
  const askWaste = status.expired || status.soon;

  async function handleDelete(kind: InventoryEventKind) {
    setDeleting(true);
    const result = await deleteInventoryAction(entry.id, kind);
    setDeleting(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      kind === "discarded" ? "Anotado como tirado" : "Eliminado del inventario",
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{entry.productName}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {formatQuantity(entry.quantity, entry.unit)} en existencias
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

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

          <ExpiryQuickPicker
            id="edit-expiry"
            name="expiryDate"
            value={expiryDate}
            onChange={setExpiryDate}
          />

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

          {entry.unit === "ud" ? (
            <div className="flex flex-col gap-2">
              <input type="hidden" name="unit" value={entry.unit} />
              <Label htmlFor="edit-pack">
                Unidades por compra{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="edit-pack"
                name="packSize"
                type="number"
                inputMode="numeric"
                min={1}
                step="any"
                defaultValue={entry.packSize ?? ""}
              />
              <p className="text-sm text-muted-foreground">
                Si lo compras en cajas (p. ej. 30 sobres), pon cuántas unidades
                trae cada compra.
              </p>
            </div>
          ) : null}

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

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="edit-pin" className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <Star
                  aria-hidden
                  className={cn(
                    "size-4",
                    isPinned && "fill-current text-warning",
                  )}
                />
                Mis habituales
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                Ánclalo arriba en tu inventario
              </span>
            </Label>
            <Switch
              id="edit-pin"
              checked={isPinned}
              onCheckedChange={togglePin}
              disabled={pinPending}
            />
          </div>

          {aliases.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Nombres en tickets</span>
              <p className="text-sm text-muted-foreground">
                Cómo aparece en tus tickets. Bórralo si se asoció por error;
                no afecta a tu historial de precios.
              </p>
              <ul className="flex flex-col gap-1.5">
                {aliases.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-lg border py-1 pr-1 pl-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {a.alias}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Borrar el nombre «${a.alias}»`}
                      onClick={() => removeAlias(a.id)}
                      disabled={removingAlias}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {mergeCandidates.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                Fusionar con otro producto
              </span>
              <p className="text-sm text-muted-foreground">
                Une este producto con otro: el historial de precios de ambos
                se juntará en el que elijas. Esta acción no se puede deshacer.
              </p>
              <ProductCombobox
                products={mergeCandidates}
                value={mergeTarget}
                onChange={setMergeTarget}
                ariaLabel="Producto con el que fusionar"
                placeholder="Buscar producto…"
                triggerLabel="Elegir producto…"
              />
              {mergeTarget ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={confirmMerge}
                  disabled={merging}
                >
                  {merging
                    ? "Fusionando…"
                    : `Fusionar «${entry.productName}» en «${
                        mergeCandidates.find((p) => p.id === mergeTarget)
                          ?.name ?? "…"
                      }»`}
                </Button>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <ResponsiveModalFooter className="gap-2 px-0">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
            {askWaste ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  Al quitarlo, ¿qué ha pasado con lo que quedaba?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleDelete("consumed")}
                    disabled={deleting}
                  >
                    Lo consumí
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleDelete("discarded")}
                    disabled={deleting}
                  >
                    <Trash2 aria-hidden />
                    Lo tiré
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleDelete("consumed")}
                disabled={deleting}
              >
                <Trash2 aria-hidden />
                Eliminar del inventario
              </Button>
            )}
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
