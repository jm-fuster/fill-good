"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Star, Store, TrendingDown, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProductIcon } from "@/components/product-icon";
import { ProductIconPicker } from "@/components/product-icon-picker";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ProductCombobox,
  type ComboboxProduct,
} from "@/components/product-combobox";
import { cn } from "@/lib/utils";
import { CHAIN_OPTIONS, chainLabel } from "@/features/prices/chains";
import { formatQuantity, LOCATION_OPTIONS, UNIT_OPTIONS } from "@/lib/units";
import type {
  InventoryEventKind,
  LocationType,
  UnitType,
} from "@/lib/supabase/types";
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
const NO_CHAIN = "__none__";

export function EditItemDrawer({
  entry,
  categories,
  householdChains = [],
  open,
  onOpenChange,
  pinned = false,
}: {
  entry: InventoryEntry;
  categories: Category[];
  /** Tiendas habituales del hogar (L15 f4): salen primero en el selector. */
  householdChains?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El producto está en "Mis habituales" del usuario actual (E5). */
  pinned?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Borrado con red de seguridad: confirmación en dos toques en el propio botón
  // (sin modal sobre modal). El primer toque arma la confirmación 5 s; el segundo
  // ejecuta. Al cerrar el drawer o pasado el tiempo, vuelve al estado inicial.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Reinicia la confirmación de borrado al cerrar el drawer (patrón de ajuste de
  // estado en render, como el pin de arriba). Limpia el temporizador al desmontar.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    // Un temporizador pendiente que se dispare tras cerrar solo vuelve a poner
    // `false` (inocuo); `requestDelete` limpia el temporizador viejo al re-armar.
    if (!open) setConfirmDelete(false);
  }
  useEffect(
    () => () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    },
    [],
  );

  function requestDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 5000);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmDelete(false);
    handleDelete("consumed");
  }

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

  // Icono manual (L16): null = automático (se adivina del nombre/categoría).
  const [icon, setIcon] = useState<string | null>(entry.productIcon);
  const [serverIcon, setServerIcon] = useState(entry.productIcon);
  if (serverIcon !== entry.productIcon) {
    setServerIcon(entry.productIcon);
    setIcon(entry.productIcon);
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  // Icono de la categoría seleccionada (para la vista previa del automático).
  const selectedCategoryIcon =
    categories.find((c) => c.id === categoryId)?.icon ?? entry.categoryIcon;

  // Tiendas del hogar primero (L15 f4): de ocho cadenas, las que este hogar no
  // pisa nunca son ruido. Solo se agrupa si la separación aporta algo: sin
  // tiendas habituales (o con todas marcadas) la lista plana se lee mejor.
  const habitualChains = CHAIN_OPTIONS.filter((c) =>
    householdChains.includes(c.value),
  );
  const otherChains = CHAIN_OPTIONS.filter(
    (c) => !householdChains.includes(c.value),
  );
  const groupChains = habitualChains.length > 0 && otherChains.length > 0;
  const chainItem = (c: { value: string; label: string }) => (
    <SelectItem key={c.value} value={c.value}>
      {c.label}
    </SelectItem>
  );

  // Tienda preferida (L15): controlada y resincronizada con el servidor.
  const [preferredChain, setPreferredChain] = useState(
    entry.preferredChain ?? "",
  );
  const [serverChain, setServerChain] = useState(entry.preferredChain);
  if (serverChain !== entry.preferredChain) {
    setServerChain(entry.preferredChain);
    setPreferredChain(entry.preferredChain ?? "");
  }

  // Unidad de la fila. Editable para poder recolocar lo que entró de un ticket
  // con la unidad equivocada: una calabaza llega como «0,72 kg» y sin poder
  // pasarla a «1 ud» se queda sin stepper de ±1 para siempre.
  const [unit, setUnit] = useState<UnitType>(entry.unit);
  const [serverUnit, setServerUnit] = useState(entry.unit);
  if (serverUnit !== entry.unit) {
    setServerUnit(entry.unit);
    setUnit(entry.unit);
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
    try {
      const result = await updateInventoryAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Cambios guardados");
      onOpenChange(false);
      router.refresh();
    } catch {
      setError("No se pudieron guardar los cambios. Comprueba tu conexión.");
    } finally {
      setPending(false);
    }
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
    <>
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
          <input type="hidden" name="preferredChain" value={preferredChain} />
          <input type="hidden" name="icon" value={icon ?? ""} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-name">Producto</Label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                aria-label="Cambiar icono del producto"
                className="relative flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ProductIcon
                  slug={icon}
                  name={entry.productName}
                  categoryIcon={selectedCategoryIcon}
                  size={26}
                />
                <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <Pencil className="size-2.5" aria-hidden />
                </span>
              </button>
              <Input
                id="edit-name"
                name="name"
                required
                maxLength={120}
                autoComplete="off"
                defaultValue={entry.productName}
                className="flex-1"
              />
            </div>
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
                  <SelectItem key={c.id} value={c.id} textValue={c.name}>
                    <span className="flex items-center gap-2">
                      <ProductIcon categoryIcon={c.icon} size={18} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-chain" className="flex items-center gap-1.5">
              <Store className="size-4 text-muted-foreground" aria-hidden />
              Tienda preferida{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Select
              value={preferredChain === "" ? NO_CHAIN : preferredChain}
              onValueChange={(v) =>
                setPreferredChain(v === NO_CHAIN ? "" : v)
              }
            >
              <SelectTrigger id="edit-chain" className="w-full">
                <SelectValue placeholder="Cualquier tienda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CHAIN}>Cualquier tienda</SelectItem>
                {groupChains ? (
                  <>
                    <SelectGroup>
                      <SelectLabel>Tus tiendas</SelectLabel>
                      {habitualChains.map(chainItem)}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Otras</SelectLabel>
                      {otherChains.map(chainItem)}
                    </SelectGroup>
                  </>
                ) : (
                  CHAIN_OPTIONS.map(chainItem)
                )}
              </SelectContent>
            </Select>
            {entry.savings ? (
              // Fase 3: otra cadena sale más barata según tus tickets. Informativo
              // (acento cálido de precios); el aviso también aparece en la lista.
              <div className="flex items-start gap-1.5 rounded-lg bg-chart-3/10 p-2 text-sm text-chart-3">
                <TrendingDown className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  En{" "}
                  <span className="font-medium">
                    {chainLabel(entry.savings.cheaperChain)}
                  </span>{" "}
                  ahorras ~{entry.savings.savingsPct}% frente a{" "}
                  {chainLabel(entry.savings.currentChain)}, según tus tickets.
                </span>
              </div>
            ) : preferredChain === "" && entry.inferredChain ? (
              // Fase 2: pista inferida del histórico de tickets. Un toque la fija
              // como preferencia manual (pasa a mandar sobre la inferencia).
              <button
                type="button"
                onClick={() => setPreferredChain(entry.inferredChain as string)}
                className="flex items-start gap-1.5 rounded-lg bg-muted/60 p-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                <Store className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Según tus tickets, sueles comprarlo en{" "}
                  <span className="font-medium text-foreground">
                    {chainLabel(entry.inferredChain)}
                  </span>
                  . Tócalo para fijarlo.
                </span>
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Dónde sueles comprarlo. Sirve para filtrar por tienda en el modo
                compra.
              </p>
            )}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-quantity">Cantidad</Label>
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
              <Label htmlFor="edit-unit">Unidad</Label>
              <Select
                value={unit}
                onValueChange={(v) => setUnit(v as UnitType)}
                name="unit"
              >
                <SelectTrigger id="edit-unit" className="w-full">
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

          {unit === "ud" ? (
            <div className="flex flex-col gap-2">
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
            <Button type="submit" size="lg" loading={pending}>
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
                onClick={requestDelete}
                loading={deleting}
                aria-live="polite"
              >
                <Trash2 aria-hidden />
                {confirmDelete ? "¿Seguro? Eliminar" : "Eliminar del inventario"}
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

    <ProductIconPicker
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      value={icon}
      name={entry.productName}
      categoryIcon={selectedCategoryIcon}
      onSelect={setIcon}
    />
    </>
  );
}
