"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Layers,
  List,
  Minus,
  Plus,
  ShoppingCart,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/layout/empty-state";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/units";
import { usePersistedFlag } from "@/hooks/use-persisted-flag";
import { useRealtimeList } from "../use-realtime-list";
import type {
  CatalogProduct,
  HabitualProduct,
  ListItem,
  Suggestion,
} from "../queries";
import {
  deleteListItemAction,
  setListItemQuantityAction,
  toggleItemAction,
} from "../actions";
import { AddItemForm } from "./add-item-form";
import { runAddAction, showAddResultToast, type AddInput } from "./add-item";
import type { AutocompleteOption } from "./product-autocomplete";
import { useCheckout } from "./use-checkout";
import { EditListItemDrawer } from "./edit-list-item-drawer";

function signatureOf(items: ListItem[]) {
  return items
    .map((i) => `${i.id}:${i.isChecked}:${i.quantity}:${i.unit}:${i.name}`)
    .join("|");
}

/** Alta optimista pendiente de confirmar contra el servidor. */
type PendingAdd = { tempId: string; realId: string | null; item: ListItem };

/** Orden de la categoría "Otros" / ítems sin categoría (va al final). */
const NO_CATEGORY_SORT = 9_000;

/**
 * Agrupa ítems por categoría para la vista agrupada (L10): orden por
 * `sort_order` (los sin categoría al final en "Otros"); dentro del grupo se
 * respeta el orden ya recibido (position). Los altas optimistas sin categoría
 * caen en "Otros" hasta que reconcilian.
 */
function groupByCategory(items: ListItem[]) {
  const byCat = new Map<
    string,
    { name: string; icon: string | null; sort: number; items: ListItem[] }
  >();
  for (const it of items) {
    const name = it.categoryName ?? "Otros";
    let g = byCat.get(name);
    if (!g) {
      g = {
        name,
        icon: it.categoryIcon ?? null,
        sort: it.categorySort ?? NO_CATEGORY_SORT,
        items: [],
      };
      byCat.set(name, g);
    }
    g.items.push(it);
  }
  return [...byCat.values()].sort(
    (a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "es"),
  );
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
  const [pendingAdds, setPendingAdds] = useState<PendingAdd[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<ListItem | null>(null);
  // L10 — Agrupar por categoría (persistido en localStorage, por dispositivo).
  const [grouped, setGrouped] = usePersistedFlag("lista:grouped");
  // Temporizadores de borrado diferido (id → timeout) para la ventana de undo.
  const removeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

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
    // Suelta los ids ya borrados en el servidor (confirmados).
    setRemovedIds((prev) => {
      const next = new Set([...prev].filter((id) => serverIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }

  // Al desmontar, confirma los borrados aún en ventana de undo (no perderlos).
  useEffect(() => {
    const timers = removeTimers.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        void deleteListItemAction(id);
      }
      timers.clear();
    };
  }, []);

  // L6 — Borrado diferido con "Deshacer": oculta el ítem al instante y solo
  // llama al servidor al expirar el toast (5 s). Si se deshace antes, no se
  // borra nada (conserva posición y added_by).
  function scheduleRemove(item: ListItem) {
    if (removeTimers.current.has(item.id)) return;
    setRemovedIds((prev) => new Set(prev).add(item.id));

    const timer = setTimeout(() => {
      removeTimers.current.delete(item.id);
      deleteListItemAction(item.id).then((r) => {
        if (r?.error) {
          toast.error(r.error);
          setRemovedIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        } else {
          router.refresh();
        }
      });
    }, 5000);
    removeTimers.current.set(item.id, timer);

    toast(`${item.name} quitado`, {
      duration: 5000,
      action: {
        label: "Deshacer",
        onClick: () => undoRemove(item.id),
      },
    });
  }

  function undoRemove(id: string) {
    const timer = removeTimers.current.get(id);
    if (timer) clearTimeout(timer);
    removeTimers.current.delete(id);
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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

    const result = await runAddAction(input);

    if (result.error) {
      setPendingAdds((prev) => prev.filter((p) => p.tempId !== tempId));
      toast.error(result.error);
      return false;
    }
    showAddResultToast(result);
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
  // Oculta los ítems en ventana de undo (borrado diferido, L6).
  const allItems = [...items, ...optimisticItems].filter(
    (i) => !removedIds.has(i.id),
  );

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
              {allItems.length} producto{allItems.length === 1 ? "" : "s"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGrouped(!grouped)}
              aria-pressed={grouped}
            >
              {grouped ? <List aria-hidden /> : <Layers aria-hidden />}
              {grouped ? "Sin agrupar" : "Agrupar"}
            </Button>
          </div>

          {pending.length > 0 ? (
            <Button asChild variant="outline" size="lg" className="print:hidden">
              <Link href="/lista/compra">
                <Store aria-hidden />
                Modo compra
              </Link>
            </Button>
          ) : null}

          <div className="flex flex-col gap-1">
            {grouped ? (
              groupByCategory(pending).map((g) => (
                <section key={g.name} aria-label={g.name}>
                  <h2 className="mt-2 mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    {g.icon ? <span aria-hidden>{g.icon}</span> : null}
                    {g.name}
                  </h2>
                  {g.items.map((item) => (
                    <ListRow
                      key={item.id}
                      item={item}
                      onToggle={toggle}
                      onEdit={setEditItem}
                      onRemove={scheduleRemove}
                    />
                  ))}
                </section>
              ))
            ) : (
              pending.map((item) => (
                <ListRow
                  key={item.id}
                  item={item}
                  onToggle={toggle}
                  onEdit={setEditItem}
                  onRemove={scheduleRemove}
                />
              ))
            )}

            {done.length > 0 ? (
              <p className="mt-4 mb-1 text-xs font-medium text-muted-foreground">
                En el carro ({done.length})
              </p>
            ) : null}
            {done.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                onToggle={toggle}
                onEdit={setEditItem}
                onRemove={scheduleRemove}
              />
            ))}
          </div>
        </>
      )}

      {visibleSuggestions.length > 0 ? (
        <Suggestions suggestions={visibleSuggestions} onAdd={addItem} />
      ) : null}

      {habitualChips.length > 0 ? (
        <Habituales products={habitualChips} onAdd={addItem} />
      ) : null}

      {done.length > 0 ? <CheckoutBar count={done.length} /> : null}

      {editItem ? (
        <EditListItemDrawer
          item={editItem}
          open={editItem !== null}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
          onRemove={scheduleRemove}
        />
      ) : null}
    </div>
  );
}

/** Umbral (px) de deslizamiento para confirmar "Quitar". */
const SWIPE_THRESHOLD = 72;

function ListRow({
  item,
  onToggle,
  onEdit,
  onRemove,
}: {
  item: ListItem;
  onToggle: (id: string, checked: boolean) => void;
  onEdit: (item: ListItem) => void;
  onRemove: (item: ListItem) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef({
    x: 0,
    y: 0,
    active: false,
    axis: "none" as "none" | "h" | "v",
    dx: 0,
  });
  // Suprime el "click" que sigue a un deslizamiento (no abrir el editor).
  const swiped = useRef(false);

  // Contable = se cuenta de una en una: unidad "ud" o sin unidad (L9).
  const countable = item.unit == null || item.unit === "ud";

  function onPointerDown(e: React.PointerEvent) {
    // Solo gesto táctil/lápiz; en escritorio se usa el botón papelera.
    if (e.pointerType === "mouse") return;
    gesture.current = { x: e.clientX, y: e.clientY, active: true, axis: "none", dx: 0 };
    swiped.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g.active) return;
    const deltaX = e.clientX - g.x;
    const deltaY = e.clientY - g.y;
    if (g.axis === "none") {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      g.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
      if (g.axis === "h") {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }
    }
    if (g.axis === "h") {
      const clamped = Math.min(0, deltaX);
      g.dx = clamped;
      setDx(clamped);
      setDragging(true);
      if (clamped <= -8) swiped.current = true;
    }
  }

  function endGesture() {
    const g = gesture.current;
    g.active = false;
    setDragging(false);
    if (g.axis === "h" && g.dx <= -SWIPE_THRESHOLD) {
      setDx(0);
      onRemove(item);
    } else {
      setDx(0);
    }
    g.axis = "none";
    g.dx = 0;
  }

  return (
    <div className="group relative overflow-hidden rounded-lg">
      {/* Fondo revelado al deslizar hacia la izquierda. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 flex items-center gap-1.5 bg-destructive px-4 text-sm font-medium text-destructive-foreground"
      >
        <Trash2 className="size-4" />
        Quitar
      </div>
      <div
        className="relative flex items-center gap-1 rounded-lg bg-background"
        style={{
          touchAction: "pan-y",
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        {/* Zona 1: checkbox con área táctil generosa (marca/desmarca). */}
        <label className="flex min-h-12 shrink-0 cursor-pointer items-center py-1 pr-3 pl-1">
          <Checkbox
            checked={item.isChecked}
            onCheckedChange={(v) => onToggle(item.id, v === true)}
            aria-label={`Marcar ${item.name}`}
            className="size-5"
          />
        </label>
        {/* Zona 2: el texto abre el editor directamente (L5, sin modo edición). */}
        <button
          type="button"
          onClick={() => onEdit(item)}
          aria-label={`Editar ${item.name}`}
          className="flex min-h-12 flex-1 items-center text-left text-sm"
        >
          <span
            className={cn(
              "flex-1 underline decoration-dotted decoration-muted-foreground/30 underline-offset-4",
              item.isChecked && "text-muted-foreground line-through",
            )}
          >
            {item.name}
            {/* Unidades no contables (g/kg/ml/l): la cantidad se edita en el drawer. */}
            {!countable && item.quantity ? (
              <span className="ml-1.5 text-muted-foreground">
                · {formatQuantity(item.quantity, item.unit ?? "ud")}
              </span>
            ) : null}
          </span>
        </button>
        {/* Stepper ±1 inline para unidades contables (ud o sin unidad) (L9). */}
        {countable ? <QuantityStepper item={item} /> : null}
        {/* Papelera: oculta por defecto, visible en hover/foco (escritorio). */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Quitar ${item.name}`}
          onClick={() => onRemove(item)}
          className="pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
        >
          <Trash2 aria-hidden className="text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Stepper ±1 inline para ítems contables (L9). Optimista con persistencia
 * "debounced": una sola escritura al servidor tras dejar de pulsar. "−" sobre
 * 1 deja el ítem sin cantidad (null); "+" sobre sin-cantidad empieza en 1.
 */
function QuantityStepper({ item }: { item: ListItem }) {
  const [qty, setQty] = useState<number | null>(item.quantity);
  const [serverQty, setServerQty] = useState<number | null>(item.quantity);
  // Reconciliar con el servidor (Realtime/refresh) sin pisar el optimismo local.
  if (serverQty !== item.quantity) {
    setServerQty(item.quantity);
    setQty(item.quantity);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<number | null>(item.quantity);

  function persist(next: number | null) {
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setListItemQuantityAction(item.id, latest.current).then((r) => {
        if (r?.error) toast.error(r.error);
      });
    }, 600);
  }

  function change(next: number | null) {
    setQty(next);
    persist(next);
  }

  const dec = () => change(qty != null && qty > 1 ? qty - 1 : null);
  const inc = () => change((qty ?? 0) + 1);

  return (
    <div className="flex shrink-0 items-center">
      {qty != null ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Restar uno a ${item.name}`}
            onClick={dec}
          >
            <Minus aria-hidden className="text-muted-foreground" />
          </Button>
          <span className="min-w-6 text-center text-sm tabular-nums" aria-live="polite">
            {qty}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Sumar uno a ${item.name}`}
            onClick={inc}
          >
            <Plus aria-hidden className="text-muted-foreground" />
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Añadir cantidad a ${item.name}`}
          onClick={inc}
        >
          <Plus aria-hidden className="text-muted-foreground" />
        </Button>
      )}
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
  const { checkout, pending } = useCheckout();

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
