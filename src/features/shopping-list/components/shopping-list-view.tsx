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
import { useRealtimeList } from "../use-realtime-list";
import type {
  CatalogProduct,
  HabitualProduct,
  ListItem,
  Suggestion,
} from "../queries";
import {
  addProductToListAction,
  checkoutAction,
  deleteListItemAction,
  toggleItemAction,
} from "../actions";
import { AddItemForm } from "./add-item-form";
import { EditListItemDrawer } from "./edit-list-item-drawer";

function signatureOf(items: ListItem[]) {
  return items
    .map((i) => `${i.id}:${i.isChecked}:${i.quantity}:${i.unit}:${i.name}`)
    .join("|");
}

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
  const [editMode, setEditMode] = useState(false);
  const [editItem, setEditItem] = useState<ListItem | null>(null);

  // Resincroniza con el servidor cuando llegan cambios (Realtime / refresh).
  const currentSig = signatureOf(initialItems);
  if (currentSig !== sig) {
    setSig(currentSig);
    setItems(initialItems);
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

  const pending = items.filter((i) => !i.isChecked);
  const done = items.filter((i) => i.isChecked);

  // Evita repetir en "Habituales" lo que ya sale en "Se está acabando".
  const suggestedIds = new Set(suggestions.map((s) => s.productId));
  const habitualChips = habituales.filter((h) => !suggestedIds.has(h.id));

  return (
    <div className="flex flex-col gap-4">
      <AddItemForm catalog={catalog} />

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="La lista está vacía"
          description="Añade productos arriba. Al terminar la compra, lo que marques pasará a tu inventario."
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {editMode ? "Elige un producto para editarlo" : `${items.length} producto${items.length === 1 ? "" : "s"}`}
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

      {!editMode && suggestions.length > 0 ? (
        <Suggestions suggestions={suggestions} />
      ) : null}

      {!editMode && habitualChips.length > 0 ? (
        <Habituales products={habitualChips} />
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

function Suggestions({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const [adding, startAdd] = useTransition();

  function add(productId: string) {
    startAdd(async () => {
      const r = await addProductToListAction(productId);
      if (r?.error) toast.error(r.error);
      else router.refresh();
    });
  }

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
              disabled={adding}
              onClick={() => add(s.productId)}
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

function Habituales({ products }: { products: HabitualProduct[] }) {
  const router = useRouter();
  const [adding, startAdd] = useTransition();

  function add(productId: string) {
    startAdd(async () => {
      const r = await addProductToListAction(productId);
      if (r?.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-dashed p-3">
      <h2 className="mb-2 text-sm font-medium">Habituales</h2>
      <div className="flex flex-wrap gap-2">
        {products.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            size="sm"
            disabled={adding}
            onClick={() => add(p.id)}
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
