"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, ShoppingCart, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/layout/empty-state";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/units";
import type { UnitType } from "@/lib/supabase/types";
import { useRealtimeList } from "../use-realtime-list";
import type {
  CatalogProduct,
  HabitualProduct,
  ListItem,
  Suggestion,
} from "../queries";
import {
  addListItemAction,
  addProductToListAction,
  checkoutAction,
  deleteListItemAction,
  toggleItemAction,
} from "../actions";
import { AddItemForm } from "./add-item-form";
import type { AutocompleteOption } from "./product-autocomplete";
import { EditListItemDrawer } from "./edit-list-item-drawer";

function signatureOf(items: ListItem[]) {
  return items
    .map((i) => `${i.id}:${i.isChecked}:${i.quantity}:${i.unit}:${i.name}`)
    .join("|");
}

/** Alta que el usuario dispara desde el input o un chip. */
export type AddInput =
  | { kind: "free"; name: string; quantity: number | null; unit: UnitType | null }
  | {
      kind: "product";
      productId: string;
      name: string;
      quantity: number | null;
      unit: UnitType | null;
    };

/** Alta optimista pendiente de confirmar contra el servidor. */
type PendingAdd = { tempId: string; realId: string | null; item: ListItem };

export function ShoppingListView({
  listId,
  initialItems,
  suggestions,
  habituales,
  catalog,
}: {
  listId: string;
  initialItems: ListItem[];
  suggestions: Suggestion[];
  habituales: HabitualProduct[];
  catalog: CatalogProduct[];
}) {
  useRealtimeList(listId);
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [sig, setSig] = useState(signatureOf(initialItems));
  const [pendingAdds, setPendingAdds] = useState<PendingAdd[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editItem, setEditItem] = useState<ListItem | null>(null);

  // Resincroniza con el servidor cuando llegan cambios (Realtime / refresh) y
  // descarta los ítems optimistas que ya han aterrizado en el servidor.
  const currentSig = signatureOf(initialItems);
  if (currentSig !== sig) {
    setSig(currentSig);
    setItems(initialItems);
    const serverIds = new Set(initialItems.map((i) => i.id));
    setPendingAdds((prev) =>
      prev.filter((p) => !(p.realId && serverIds.has(p.realId))),
    );
  }

  function toggle(id: string, checked: boolean) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, isChecked: checked } : it)),
    );
    toggleItemAction(id, checked).then((r) => {
      if (r?.error) {
        toast.error(r.error);
        router.refresh();
      }
    });
  }

  // Alta optimista: el ítem aparece al instante y se reconcilia con el refresh.
  async function addItem(input: AddInput): Promise<boolean> {
    const tempId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `temp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const optimistic: ListItem = {
      id: tempId,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      isChecked: false,
      productId: input.kind === "product" ? input.productId : null,
      addedByMe: true,
    };
    setPendingAdds((prev) => [...prev, { tempId, realId: null, item: optimistic }]);

    let result;
    if (input.kind === "free") {
      const fd = new FormData();
      fd.set("name", input.name);
      if (input.quantity != null) fd.set("quantity", String(input.quantity));
      if (input.unit) fd.set("unit", input.unit);
      result = await addListItemAction({}, fd);
    } else {
      result = await addProductToListAction(
        input.productId,
        input.quantity,
        input.unit,
      );
    }

    if (result.error) {
      setPendingAdds((prev) => prev.filter((p) => p.tempId !== tempId));
      toast.error(result.error);
      return false;
    }
    if (result.warning) toast.warning(result.warning);
    if (result.merged) {
      const m = result.merged;
      const qtyText =
        m.quantity != null ? ` → ${formatQuantity(m.quantity, m.unit ?? "ud")}` : "";
      toast.info(`${m.name} ya estaba en la lista${qtyText}`);
    }
    if (result.itemId) {
      const realId = result.itemId;
      setPendingAdds((prev) =>
        prev.map((p) => (p.tempId === tempId ? { ...p, realId } : p)),
      );
    }
    router.refresh();
    return true;
  }

  // Ítems optimistas aún no presentes en los datos del servidor.
  const optimisticItems = pendingAdds
    .filter((p) => !(p.realId && items.some((i) => i.id === p.realId)))
    .map((p) => p.item);
  const allItems = [...items, ...optimisticItems];

  const pending = allItems.filter((i) => !i.isChecked);
  const done = allItems.filter((i) => i.isChecked);

  // Productos ya en la lista (servidor + optimistas) para ocultar sus chips.
  const onListProductIds = new Set<string>();
  for (const i of allItems) if (i.productId) onListProductIds.add(i.productId);

  // Evita repetir en "Habituales" lo que ya sale en "Se está acabando".
  const suggestedIds = new Set(suggestions.map((s) => s.productId));
  const visibleSuggestions = suggestions.filter(
    (s) => !onListProductIds.has(s.productId),
  );
  const habitualChips = habituales.filter(
    (h) => !suggestedIds.has(h.id) && !onListProductIds.has(h.id),
  );

  // L4: opciones al enfocar el input vacío (sugerencias primero, luego
  // habituales), resueltas contra el catálogo para reutilizar el mismo alta.
  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  const focusOptions: AutocompleteOption[] = [];
  const seenFocus = new Set<string>();
  for (const s of visibleSuggestions) {
    const product = catalogById.get(s.productId);
    if (!product || seenFocus.has(product.id)) continue;
    seenFocus.add(product.id);
    focusOptions.push({
      product,
      reason:
        s.reason === "restock" && s.intervalDays
          ? `cada ~${s.intervalDays} días`
          : "Quedan pocas",
    });
  }
  for (const h of habitualChips) {
    const product = catalogById.get(h.id);
    if (!product || seenFocus.has(product.id)) continue;
    seenFocus.add(product.id);
    focusOptions.push({ product, reason: "Habitual" });
  }

  return (
    <div className="flex flex-col gap-4">
      <AddItemForm
        catalog={catalog}
        onAdd={addItem}
        onListProductIds={onListProductIds}
        defaultOptions={focusOptions}
      />

      {allItems.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="La lista está vacía"
          description="Añade productos arriba. Al terminar la compra, lo que marques pasará a tu inventario."
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {editMode ? "Elige un producto para editarlo" : `${allItems.length} producto${allItems.length === 1 ? "" : "s"}`}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
            >
              {editMode ? <Check aria-hidden /> : <Pencil aria-hidden />}
              {editMode ? "Hecho" : "Editar"}
            </Button>
          </div>

          {!editMode && pending.length > 0 ? (
            <Button asChild variant="outline" size="lg" className="print:hidden">
              <Link href="/lista/compra">
                <Store aria-hidden />
                Modo compra
              </Link>
            </Button>
          ) : null}

          <div className="flex flex-col gap-1">
            {pending.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                editMode={editMode}
                onToggle={toggle}
                onEdit={setEditItem}
              />
            ))}

            {done.length > 0 ? (
              <p className="mt-4 mb-1 text-xs font-medium text-muted-foreground">
                En el carro ({done.length})
              </p>
            ) : null}
            {done.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                editMode={editMode}
                onToggle={toggle}
                onEdit={setEditItem}
              />
            ))}
          </div>
        </>
      )}

      {!editMode && visibleSuggestions.length > 0 ? (
        <Suggestions suggestions={visibleSuggestions} onAdd={addItem} />
      ) : null}

      {!editMode && habitualChips.length > 0 ? (
        <Habituales products={habitualChips} onAdd={addItem} />
      ) : null}

      {!editMode && done.length > 0 ? <CheckoutBar count={done.length} /> : null}

      {editItem ? (
        <EditListItemDrawer
          item={editItem}
          open={editItem !== null}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ListRow({
  item,
  editMode,
  onToggle,
  onEdit,
}: {
  item: ListItem;
  editMode: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onEdit: (item: ListItem) => void;
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();

  function remove() {
    startDelete(async () => {
      const r = await deleteListItemAction(item.id);
      if (r?.error) toast.error(r.error);
      else router.refresh();
    });
  }

  const label = (
    <>
      {item.name}
      {item.quantity ? (
        <span className="ml-1.5 text-muted-foreground">
          · {formatQuantity(item.quantity, item.unit ?? "ud")}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="flex items-center gap-1 rounded-lg">
      {editMode ? (
        // En modo edición no se puede marcar como comprado: la fila abre el
        // editor de producto (nombre / cantidad / unidad).
        <button
          type="button"
          onClick={() => onEdit(item)}
          className="flex min-h-12 flex-1 items-center gap-3 px-1 text-left text-sm"
          aria-label={`Editar ${item.name}`}
        >
          <Pencil aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">{label}</span>
        </button>
      ) : (
        <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3 px-1">
          <Checkbox
            checked={item.isChecked}
            onCheckedChange={(v) => onToggle(item.id, v === true)}
            aria-label={`Marcar ${item.name}`}
            className="size-5"
          />
          <span
            className={cn(
              "flex-1 text-sm",
              item.isChecked && "text-muted-foreground line-through",
            )}
          >
            {label}
          </span>
        </label>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Quitar ${item.name}`}
        onClick={remove}
        disabled={deleting}
      >
        <Trash2 aria-hidden className="text-muted-foreground" />
      </Button>
    </div>
  );
}

function Suggestions({
  suggestions,
  onAdd,
}: {
  suggestions: Suggestion[];
  onAdd: (input: AddInput) => Promise<boolean>;
}) {
  return (
    <section className="rounded-xl border border-dashed p-3">
      <h2 className="mb-2 text-sm font-medium">Sugerencias</h2>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => {
          const reason =
            s.reason === "restock" && s.intervalDays
              ? `Sueles comprarlo cada ~${s.intervalDays} días`
              : "Quedan pocas";
          return (
            <Button
              key={s.productId}
              variant="outline"
              size="sm"
              onClick={() =>
                onAdd({
                  kind: "product",
                  productId: s.productId,
                  name: s.name,
                  quantity: null,
                  unit: s.unit,
                })
              }
              className="h-auto flex-col items-start gap-0.5 py-1.5"
            >
              <span className="flex items-center gap-1">
                <Plus aria-hidden className="size-3.5" />
                {s.name}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {reason}
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function Habituales({
  products,
  onAdd,
}: {
  products: HabitualProduct[];
  onAdd: (input: AddInput) => Promise<boolean>;
}) {
  return (
    <section className="rounded-xl border border-dashed p-3">
      <h2 className="mb-2 text-sm font-medium">Habituales</h2>
      <div className="flex flex-wrap gap-2">
        {products.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            size="sm"
            onClick={() =>
              onAdd({
                kind: "product",
                productId: p.id,
                name: p.name,
                quantity: null,
                unit: p.defaultUnit,
              })
            }
          >
            <Plus aria-hidden />
            {p.name}
          </Button>
        ))}
      </div>
    </section>
  );
}

function CheckoutBar({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function checkout() {
    startTransition(async () => {
      const r = await checkoutAction();
      if (r?.error) {
        toast.error(r.error);
      } else {
        toast.success(
          `${r.added} producto${r.added === 1 ? "" : "s"} añadido${
            r.added === 1 ? "" : "s"
          } al inventario`,
        );
        // Revisión opcional de caducidades de lo recién comprado.
        const ids = r.inventoryItemIds ?? [];
        if (ids.length > 0) {
          router.push(`/inventario/revision?items=${ids.join(",")}`);
        } else {
          router.refresh();
        }
      }
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-lg px-4 pb-safe md:sticky md:inset-x-auto md:bottom-0 md:mx-0 md:max-w-none md:border-t md:bg-background/95 md:px-0 md:pt-3 md:pb-3 md:backdrop-blur-sm">
      <Button
        size="lg"
        className="w-full shadow-lg"
        disabled={pending}
        onClick={checkout}
      >
        <ShoppingCart aria-hidden />
        {pending
          ? "Guardando…"
          : `Finalizar compra (${count}) → inventario`}
      </Button>
    </div>
  );
}
