"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CollapsibleFields } from "@/components/collapsible-fields";
import { Fab, fabButtonClass } from "@/components/layout/fab";
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
import { ProductIcon } from "@/components/product-icon";
import { actionErrorMessage } from "@/lib/action-error";
import { LOCATION_OPTIONS, UNIT_OPTIONS } from "@/lib/units";
import type { LocationType, UnitType } from "@/lib/supabase/types";
import type { Category } from "../queries";
import { addInventoryAction } from "../actions";
import { ExpiryQuickPicker } from "./expiry-quick-picker";
import { PackagingFields } from "./packaging-fields";

/** Valor de «Sin categoría» en el Select: Radix no admite una opción con value "". */
const NO_CATEGORY = "__none__";

export function AddProductDrawer({
  categories,
  productNames,
}: {
  categories: Category[];
  productNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldsKey, setFieldsKey] = useState(0);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      const result = await addInventoryAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Producto añadido al inventario");
      setOpen(false);
      setFieldsKey((k) => k + 1);
      router.refresh();
    } catch (err) {
      setError(actionErrorMessage("No se pudo añadir el producto.", err));
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Al cerrar se olvida el error: si no, al reabrir seguía el aviso de
        // la vez anterior sobre un formulario ya vacío.
        if (!next) setError(null);
      }}
    >
      {/* Escritorio: acción en el header, junto a "Ver precios". */}
      <Button className="hidden md:inline-flex" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Añadir producto
      </Button>
      {/* Móvil: botón flotante (FAB). */}
      <Fab className="md:hidden">
        <Button
          size="icon"
          aria-label="Añadir producto"
          onClick={() => setOpen(true)}
          className={fabButtonClass}
        >
          <Plus className="size-6" aria-hidden />
        </Button>
      </Fab>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Añadir producto</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Se añadirá a tu inventario. Si el producto ya existe, se suma a la
            cantidad.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <AddProductFields
            key={fieldsKey}
            categories={categories}
            productNames={productNames}
          />

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <ResponsiveModalFooter sticky>
            <Button type="submit" size="lg" loading={pending}>
              {pending ? "Añadiendo…" : "Añadir al inventario"}
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

function AddProductFields({
  categories,
  productNames,
}: {
  categories: Category[];
  productNames: string[];
}) {
  const listId = useId();
  const [location, setLocation] = useState<LocationType>("pantry");
  const [unit, setUnit] = useState<UnitType>("ud");
  const [categoryId, setCategoryId] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-name">Producto</Label>
        <Input
          id="add-name"
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          list={listId}
          placeholder="p. ej. Leche entera"
        />
        <datalist id={listId}>
          {productNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="add-category">Categoría</Label>
        {/* «Sin categoría» es también una OPCIÓN, como en la ficha: antes solo
            era el placeholder, y elegida una categoría no había forma de
            volver atrás. El valor viaja en un input oculto porque el del
            Select sería el centinela, no la cadena vacía que espera la acción. */}
        <input type="hidden" name="categoryId" value={categoryId} />
        <Select
          value={categoryId === "" ? NO_CATEGORY : categoryId}
          onValueChange={(v) => setCategoryId(v === NO_CATEGORY ? "" : v)}
        >
          <SelectTrigger id="add-category" className="w-full">
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

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-quantity">Cantidad</Label>
          <Input
            id="add-quantity"
            name="quantity"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            defaultValue={1}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-unit">Unidad</Label>
          <Select
            value={unit}
            onValueChange={(v) => setUnit(v as UnitType)}
            name="unit"
          >
            <SelectTrigger id="add-unit" className="w-full">
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

      {/* Mismo reparto que en editar: a la vista lo imprescindible para dar de
          alta, y los ajustes finos plegados. Dar de alta un producto no debería
          exigir decidir su contenido por envase.
          El «todo opcional» va aquí una vez y no campo a campo: repetirlo en
          cada etiqueta era ruido en una sección que ya es opcional por serlo. */}
      <CollapsibleFields
        title="Ajustes adicionales"
        hint={
          unit === "ud"
            ? "Todo opcional: caducidad, ubicación, envase y avisos"
            : "Todo opcional: caducidad, ubicación y avisos"
        }
      >
        <ExpiryQuickPicker
          id="add-expiry"
          name="expiryDate"
          value={expiryDate}
          onChange={setExpiryDate}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="add-location">Ubicación</Label>
          <Select
            value={location}
            onValueChange={(v) => setLocation(v as LocationType)}
            name="location"
          >
            <SelectTrigger id="add-location" className="w-full">
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
          <Label htmlFor="add-min">Avísame cuando queden menos de</Label>
          <Input
            id="add-min"
            name="minQuantity"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="p. ej. 2"
          />
        </div>

        {unit === "ud" ? <PackagingFields idPrefix="add" /> : null}
      </CollapsibleFields>
    </>
  );
}
