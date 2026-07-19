"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/layout/empty-state";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/units";
import { useRealtimeList } from "../use-realtime-list";
import type { ListItem, Suggestion } from "../queries";
import {
  addProductToListAction,
  checkoutAction,
  deleteListItemAction,
  toggleItemAction,
} from "../actions";
import { AddItemForm } from "./add-item-form";

function signatureOf(items: ListItem[]) {
  return items
    .map((i) => `${i.id}:${i.isChecked}:${i.quantity}:${i.name}`)
    .join("|");
}

export function ShoppingListView({
  listId,
  initialItems,
  suggestions,
  productNames,
}: {
  listId: string;
  initialItems: ListItem[];
  suggestions: Suggestion[];
  productNames: string[];
}) {
  useRealtimeList(listId);
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [sig, setSig] = useState(signatureOf(initialItems));

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

  return (
    <div className="flex flex-col gap-4">
      <AddItemForm productNames={productNames} />

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="La lista está vacía"
          description="Añade productos arriba. Al terminar la compra, lo que marques pasará a tu inventario."
        />
      ) : (
        <div className="flex flex-col gap-1">
          {pending.map((item) => (
            <ListRow key={item.id} item={item} onToggle={toggle} />
          ))}

          {done.length > 0 ? (
            <p className="mt-4 mb-1 text-xs font-medium text-muted-foreground">
              En el carro ({done.length})
            </p>
          ) : null}
          {done.map((item) => (
            <ListRow key={item.id} item={item} onToggle={toggle} />
          ))}
        </div>
      )}

      {suggestions.length > 0 ? (
        <Suggestions suggestions={suggestions} />
      ) : null}

      {done.length > 0 ? <CheckoutBar count={done.length} /> : null}
    </div>
  );
}

function ListRow({
  item,
  onToggle,
}: {
  item: ListItem;
  onToggle: (id: string, checked: boolean) => void;
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

  return (
    <div className="flex items-center gap-1 rounded-lg">
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
          {item.name}
          {item.quantity ? (
            <span className="ml-1.5 text-muted-foreground">
              · {formatQuantity(item.quantity, item.unit ?? "ud")}
            </span>
          ) : null}
        </span>
      </label>
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
      <h2 className="mb-2 text-sm font-medium">Se está acabando</h2>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Button
            key={s.productId}
            variant="outline"
            size="sm"
            disabled={adding}
            onClick={() => add(s.productId)}
          >
            <Plus aria-hidden />
            {s.name}
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
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-lg px-4 pb-safe">
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
