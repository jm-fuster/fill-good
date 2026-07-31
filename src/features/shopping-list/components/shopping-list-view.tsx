"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  ArrowUpDown,
  Check,
  Layers,
  List,
  ListOrdered,
  Plus,
  ShoppingCart,
  Store,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { EmptyState } from "@/components/layout/empty-state";
import { Fab, fabButtonClass } from "@/components/layout/fab";
import { useNavListBadge } from "@/components/layout/nav-list-count";
import { ProductIcon } from "@/components/product-icon";
import { ChainChip } from "@/components/chain-chip";
import { cn } from "@/lib/utils";
import { vibrateTick } from "@/lib/haptics";
import { useSwipeAction } from "@/hooks/use-swipe-action";
import { AisleOrderPanel } from "@/features/categories/components/aisle-order-panel";
import type { ChainAisleOrders } from "@/features/categories/aisle-order";
import type { StoreCategory } from "@/features/categories/queries";
import { chainLabel } from "@/features/prices/chains";
import type { ChainSavingsTip } from "@/features/prices/chain-savings";
import { ScanTicketNudge } from "@/features/receipts/components/scan-ticket-nudge";
import {
  defaultListQuantity,
  formatPurchaseQuantity,
  listTotalLabel,
} from "@/lib/units";
import {
  usePersistedChoice,
  usePersistedFlag,
} from "@/hooks/use-persisted-flag";
import type { ListItemRealtimeRow } from "../list-sync";
import { useSyncedList } from "../use-synced-list";
import {
  ACTIVE_CHAIN_KEY,
  resolveChain,
  storeOptionsFor,
} from "../aisle-view";
import type {
  CatalogProduct,
  ListItem,
  PendingTicketTrip,
  Suggestion,
} from "../queries";
import {
  deleteListItemAction,
  dismissSuggestionAction,
  fetchListItemsAction,
  reorderListItemsAction,
  restoreListItemAction,
  restoreSuggestionAction,
  toggleItemAction,
} from "../actions";
import { suggestionReasonLabel } from "../suggestion-reason";
import { groupByCategory } from "../grouping";
import { AddItemsPicker } from "./add-items-picker";
import { runAddAction, showAddResultToast, type AddInput } from "./add-item";
import { ItemReorderList } from "./item-reorder-list";
import { QuantityStepper } from "./quantity-stepper";
import { useCheckout } from "./use-checkout";
import { EditListItemDrawer } from "./edit-list-item-drawer";

/** Alta optimista pendiente de confirmar contra el servidor. */
type PendingAdd = { tempId: string; realId: string | null; item: ListItem };

export function ShoppingListView({
  listId,
  initialItems,
  suggestions,
  catalog,
  pendingTicket,
  categories,
  aisleOrders,
  chains,
}: {
  listId: string;
  initialItems: ListItem[];
  suggestions: Suggestion[];
  catalog: CatalogProduct[];
  /** Compra cerrada sin ticket: ofrece escanearlo (G2). null = nada que ofrecer. */
  pendingTicket: PendingTicketTrip | null;
  /** Pasillos del hogar en su orden GENERAL, para el editor de orden. */
  categories: StoreCategory[];
  /** Órdenes de pasillo propios de cada tienda del hogar (excepciones). */
  aisleOrders: ChainAisleOrders;
  /** Supermercados del hogar: cada uno puede guardar su propio orden. */
  chains: string[];
}) {
  const { user } = useUser();
  const myUserId = user?.id ?? null;

  // Fila con la que se pinta un alta que llega de otro móvil. El evento de
  // Realtime trae la fila pero no lo que cuelga del producto (categoría, envase,
  // ahorro), así que hasta que la cura lo complete cae en "Otros": aparecer al
  // instante importa más en el pasillo que aparecer con su pasillo puesto.
  const provisionalItem = useCallback(
    (row: ListItemRealtimeRow): ListItem => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity === null ? null : Number(row.quantity),
      unit: row.unit,
      isChecked: row.is_checked,
      position: row.position,
      createdAt: row.created_at,
      productId: row.product_id,
      addedByMe: row.added_by !== null && row.added_by === myUserId,
    }),
    [myUserId],
  );

  const fetchItems = useCallback(async (id: string) => {
    const result = await fetchListItemsAction(id);
    return result.items ?? null;
  }, []);

  // La lista viva: siembra del servidor y, a partir de ahí, cambios sueltos de
  // Realtime aplicados en memoria (ver `use-synced-list.ts`). Antes cada toque
  // —propio o del otro móvil— recargaba la página entera, y varias respuestas en
  // vuelo se pisaban entre ellas: de ahí que lo quitado reapareciera.
  const list = useSyncedList<ListItem>({
    listId,
    initialItems,
    fetchItems,
    provisionalItem,
  });

  const [pendingAdds, setPendingAdds] = useState<PendingAdd[]>([]);
  const [editItem, setEditItem] = useState<ListItem | null>(null);
  /** Ids con un «quitar» ya en marcha (papelera y deslizamiento a la vez). */
  const removing = useRef<Set<string>>(new Set());
  // L17 — Selector de altas (el «+»): el catálogo entero para marcar de golpe.
  const [adding, setAdding] = useState(false);
  // Sugerencias descartadas en esta sesión: se ocultan al instante y el servidor
  // las silencia un mes. Al llegar el refresh ya no vienen, así que el set solo
  // cubre la ventana entre el clic y la respuesta.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // L10 — Agrupar por categoría (persistido en localStorage, por dispositivo).
  const [grouped, setGrouped] = usePersistedFlag("lista:grouped");
  // L14 — Modo reordenar (arrastrar artículos). Efímero, no se persiste.
  const [reordering, setReordering] = useState(false);
  // Orden de los PASILLOS (no de los artículos), en un sheet dentro del modo
  // reordenar: es la misma pregunta —«en qué orden quiero recorrer esto»— pero
  // una respuesta que se guarda y se reutiliza en cada compra, y por tienda.
  const [aisleOrdering, setAisleOrdering] = useState(false);
  // Tienda elegida, compartida con el modo compra (`ACTIVE_CHAIN_KEY`).
  const [storedChain, setStoredChain] = usePersistedChoice(ACTIVE_CHAIN_KEY);
  const storeLabelId = useId();

  // L6 — Quitar con "Deshacer". El borrado se confirma en el servidor de
  // inmediato (así sobrevive a una recarga); la fila sale al instante para dar
  // respuesta inmediata y queda VETADA: ninguna respuesta del servidor pedida
  // antes del borrado puede devolverla (era justo el bug de «lo quito y vuelve»).
  // "Deshacer" restaura la fila tal cual (mismo id, posición y added_by) desde la
  // instantánea que devuelve el borrado.
  function removeItem(item: ListItem) {
    if (removing.current.has(item.id)) return;
    removing.current.add(item.id);
    list.remove(item.id);
    // Si era un alta aún sin confirmar, se cae también su fila optimista.
    setPendingAdds((prev) => prev.filter((p) => p.item.id !== item.id));

    deleteListItemAction(item.id).then((r) => {
      if (r?.error) {
        // El servidor rechazó el borrado: vuelve a mostrarse.
        removing.current.delete(item.id);
        list.unremove(item);
        toast.error(r.error);
        return;
      }
      const snapshot = r?.deleted;
      toast(`${item.name} quitado`, {
        duration: 5000,
        action: snapshot
          ? {
              label: "Deshacer",
              onClick: () => {
                removing.current.delete(item.id);
                list.unremove(item);
                restoreListItemAction(snapshot).then((res) => {
                  if (res?.error) {
                    toast.error(res.error);
                    // No volvió: fuera otra vez, o quedaría una fila fantasma.
                    list.remove(item.id);
                  }
                });
              },
            }
          : undefined,
      });
    });
  }

  function toggle(id: string, checked: boolean) {
    if (checked) vibrateTick();
    const before = list.items.find((i) => i.id === id)?.isChecked ?? !checked;
    list.patch(id, { isChecked: checked });
    // `track` marca la fila mientras la escritura viaja: lo que llegue del
    // servidor para ella entre tanto se ignora. Sin eso, marcar y desmarcar
    // rápido dejaba la fila marcada medio segundo (el eco del primer toque
    // aterrizaba cuando ya se había hecho el segundo).
    list.pending.track(id, toggleItemAction(id, checked)).then((r) => {
      if (!r?.error) return;
      toast.error(r.error);
      list.patch(id, { isChecked: before });
      list.heal(0);
    });
  }

  /** Marca varias filas como «escribiéndose» mientras la acción viaja. */
  function trackAll(ids: string[], work: Promise<unknown>) {
    for (const id of ids) {
      list.pending.track(id, work).catch(() => {});
    }
  }

  // L14 — Aplica un nuevo orden de pendientes: reordena el estado local al
  // instante (con las posiciones que va a escribir el servidor, para que el
  // orden no "salte" al llegar los ecos) y persiste.
  function applyReorder(globalIds: string[]) {
    const inSet = new Set(globalIds);
    const byId = new Map(list.items.map((i) => [i.id, i]));
    const reordered = globalIds.flatMap((id, index) => {
      const item = byId.get(id);
      return item ? [{ ...item, position: index }] : [];
    });
    // Conserva cualquier pendiente no incluido y los marcados al final.
    const rest = list.items.filter((i) => i.isChecked || !inSet.has(i.id));
    list.replace([...reordered, ...rest]);

    const work = reorderListItemsAction(globalIds);
    trackAll(globalIds, work);
    work.then((r) => {
      if (r?.error) {
        toast.error(r.error);
        list.heal(0);
      }
    });
  }

  // Alta optimista: el ítem aparece al instante y se reconcilia al confirmar.
  async function addItem(input: AddInput): Promise<boolean> {
    const tempId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `temp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    // Lo que ya sabemos del catálogo viaja en la fila optimista en vez de
    // esperar al servidor: el envase es el dato que justifica la línea («= 10
    // ud») y la categoría es el pasillo en el que se pinta. Verlos aparecer medio
    // segundo después se lee como que la app ha cambiado de opinión.
    const product =
      input.kind === "product"
        ? catalog.find((p) => p.id === input.productId)
        : undefined;
    const optimistic: ListItem = {
      id: tempId,
      name: input.name,
      // Mismo defecto que aplica el servidor, para que la fila no parpadee de
      // «+» a «− 1 +» al confirmarse.
      quantity: input.quantity ?? defaultListQuantity(input.unit),
      unit: input.unit,
      isChecked: false,
      // Al final de la lista, que es donde la va a poner el servidor.
      position:
        list.items.reduce((max, i) => Math.max(max, i.position), 0) + 1,
      createdAt: new Date().toISOString(),
      productId: input.kind === "product" ? input.productId : null,
      addedByMe: true,
      packSize: product?.packSize ?? null,
      productIcon: product?.icon ?? null,
      categoryName: product?.categoryName ?? undefined,
      categoryIcon: product?.categoryIcon ?? null,
      categorySort: product?.categorySort,
      // En un alta de texto libre no hay nada de esto: el producto lo resuelve el
      // servidor por nombre normalizado, así que llega con la cura (igual que el
      // contenido y el aviso de ahorro, que no están en el catálogo ligero).
    };
    setPendingAdds((prev) => [
      ...prev,
      { tempId, realId: null, item: optimistic },
    ]);

    let result: Awaited<ReturnType<typeof runAddAction>>;
    try {
      result = await runAddAction(input);
    } catch {
      // Si la acción lanza (red caída), el ítem optimista quedaría huérfano en la
      // lista: se revierte y se avisa para que el usuario reintente.
      setPendingAdds((prev) => prev.filter((p) => p.tempId !== tempId));
      toast.error("No se pudo añadir. Comprueba tu conexión e inténtalo de nuevo.");
      return false;
    }

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
      // Fila nueva confirmada: entra ya con su id de verdad (si fue una fusión
      // L3, la fila que había ya está en la lista y solo cambia su cantidad).
      if (!result.merged) list.add({ ...optimistic, id: realId });
    }
    // Y la cura completa lo que el catálogo ligero no trae (contenido, aviso de
    // ahorro, el pasillo de un alta de texto libre).
    list.heal();
    return true;
  }

  // Descartar una sugerencia: la silencia un mes en todo el hogar. Con
  // "Deshacer", porque es un clic pequeño junto al de añadir y equivocarse aquí
  // significaría no volver a ver ese producto sugerido en un mes.
  function dismissSuggestion(s: Suggestion) {
    setDismissedIds((prev) => new Set(prev).add(s.productId));
    dismissSuggestionAction(s.productId).then((r) => {
      if (r?.error) {
        setDismissedIds((prev) => {
          const next = new Set(prev);
          next.delete(s.productId);
          return next;
        });
        toast.error(r.error);
        return;
      }
      toast(`${s.name} descartado`, {
        duration: 5000,
        action: {
          label: "Deshacer",
          onClick: () => {
            setDismissedIds((prev) => {
              const next = new Set(prev);
              next.delete(s.productId);
              return next;
            });
            restoreSuggestionAction(s.productId).then((res) => {
              if (res?.error) toast.error(res.error);
            });
          },
        },
      });
    });
  }

  // Ítems optimistas aún no presentes en los datos del servidor.
  const optimisticItems = pendingAdds
    .filter((p) => !(p.realId && list.items.some((i) => i.id === p.realId)))
    .map((p) => p.item);
  const allItems = [...list.items, ...optimisticItems];

  const pending = allItems.filter((i) => !i.isChecked);
  const done = allItems.filter((i) => i.isChecked);

  // El badge de la navbar lo publica esta pantalla mientras está montada: aquí se
  // sabe la cuenta exacta (con lo optimista incluido) y sale gratis, en vez de
  // que el badge relea por su cuenta con cada cambio.
  const badge = useNavListBadge();
  const pendingCount = pending.length;
  useEffect(() => badge.claim(), [badge]);
  useEffect(() => {
    badge.publish(pendingCount);
  }, [badge, pendingCount]);

  /** Cantidad al vuelo desde el stepper: la fila entera cuenta lo mismo. */
  function setQuantity(id: string, quantity: number | null) {
    list.patch(id, { quantity });
  }

  /** El stepper tiene toques sin asentar: que no los pise el servidor. */
  function setQuantityBusy(id: string, busy: boolean) {
    list.pending.setHold(id, busy);
  }

  // Tienda con la que se miran los pasillos: la MISMA elección que el modo
  // compra, no una propia de esta pantalla (ver `aisle-view.ts`). Aquí solo
  // decide el ORDEN de los grupos —nada se filtra, que estás montando la lista
  // entera—, y por eso el chip de «sin elegir» se llama "General" y no "Todas".
  const storeOptions = storeOptionsFor(chains, allItems);
  const activeChain = resolveChain(storedChain, storeOptions);
  const chainOrder = activeChain ? aisleOrders[activeChain] : undefined;
  // Solo se pregunta si hay algo que responder: agrupada (es lo único que el
  // orden cambia aquí) y con dos tiendas o más, igual que en el modo compra.
  const showStorePicker = grouped && storeOptions.length >= 2;

  // Productos ya en la lista (servidor + optimistas) para ocultar sus chips.
  const onListProductIds = new Set<string>();
  for (const i of allItems) if (i.productId) onListProductIds.add(i.productId);

  const visibleSuggestions = suggestions.filter(
    (s) => !onListProductIds.has(s.productId) && !dismissedIds.has(s.productId),
  );

  // L14 — Modo reordenar: vista enfocada solo con los pendientes arrastrables.
  if (reordering && pending.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Reordenar la lista</p>
            <p className="text-xs text-muted-foreground">
              {grouped
                ? "Arrastra el asa dentro de cada pasillo."
                : "Arrastra el asa para cambiar el orden."}
            </p>
          </div>
          <Button size="sm" onClick={() => setReordering(false)}>
            <Check aria-hidden />
            Listo
          </Button>
        </div>

        {/* Mover artículos a mano vale para ESTA lista; el orden de los pasillos
            se guarda y manda en todas las compras siguientes. Están juntos porque
            quien entra aquí quiere lo segundo casi siempre —recorrer la tienda
            como es— y hasta ahora solo encontraba lo primero. */}
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setAisleOrdering(true)}
        >
          <ListOrdered aria-hidden />
          {storeOptions.length >= 2
            ? "Orden de los pasillos por tienda"
            : "Orden de los pasillos"}
        </Button>

        <ItemReorderList
          items={pending}
          grouped={grouped}
          chainOrder={chainOrder}
          onReorder={applyReorder}
        />

        {/* `noDrag`: las filas del editor se arrastran, y sin esto arrastrarlas
            cerraría el sheet. Con dos tiendas o más el panel saca su conmutador
            «General + una tienda por chip»: ahí es donde se guarda el orden de
            cada súper. */}
        <ResponsiveModal open={aisleOrdering} onOpenChange={setAisleOrdering}>
          <ResponsiveModalContent noDrag>
            <ResponsiveModalHeader>
              <ResponsiveModalTitle>Orden de los pasillos</ResponsiveModalTitle>
              <ResponsiveModalDescription>
                Colócalos como los recorres en la tienda. Se guarda al mover y
                manda en la lista agrupada y en el modo compra.
              </ResponsiveModalDescription>
            </ResponsiveModalHeader>
            <div className="px-4">
              {/* Abre por la tienda que se está mirando (`chain`), con el
                  conmutador para saltar a otra (`stores`). Las tiendas ofrecidas
                  son las MISMAS que las del selector de arriba: cualquier orden
                  que se pueda ver, se tiene que poder editar. */}
              <AisleOrderPanel
                categories={categories}
                orders={aisleOrders}
                stores={storeOptions}
                chain={activeChain}
              />
            </div>
            <ResponsiveModalFooter>
              <Button variant="outline" onClick={() => setAisleOrdering(false)}>
                Listo
              </Button>
            </ResponsiveModalFooter>
          </ResponsiveModalContent>
        </ResponsiveModal>
      </div>
    );
  }

  return (
    // La reserva del final de la lista (se suma a la del shell) sigue al FAB:
    // sin ella, el botón flotante tapa el «+» del stepper de la última fila, y
    // el FAB sube cuando aparece la banda de «Finalizar compra».
    <div
      className={cn(
        "flex flex-col gap-4 md:pb-0",
        done.length > 0 ? "pb-fab-over-bar" : "pb-fab",
      )}
    >
      {/* El alta entera vive en el «+» (L17): FAB al alcance del pulgar en móvil
          y este botón en escritorio, donde no hay FAB. Antes esto era un
          formulario de uno-en-uno ocupando el sitio de la propia lista. */}
      <div className="hidden md:flex md:justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Añadir a la lista
        </Button>
      </div>

      {pendingTicket ? <ScanTicketNudge trip={pendingTicket} /> : null}

      {allItems.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="La lista está vacía"
          description="Marca de una vez todo lo que necesites. Al terminar la compra, lo que marques pasará a tu inventario."
          action={
            <Button size="lg" onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Añadir productos
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              {allItems.length} producto{allItems.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-1">
              {pending.length >= 2 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReordering(true)}
                >
                  <ArrowUpDown aria-hidden />
                  Reordenar
                </Button>
              ) : null}
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
          </div>

          {/* Mismo patrón que el panel de Ajustes (rótulo + chips): lo que se
              elige aquí es con qué tienda se miran los pasillos, y viaja al modo
              compra. "General" = el orden del hogar, sin tienda concreta. */}
          {showStorePicker ? (
            <div className="flex flex-col gap-2">
              <p
                id={storeLabelId}
                className="text-xs font-medium text-muted-foreground"
              >
                Orden de los pasillos
              </p>
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                role="group"
                aria-labelledby={storeLabelId}
              >
                <ChainChip
                  label="General"
                  active={activeChain === null}
                  onClick={() => setStoredChain(null)}
                />
                {storeOptions.map((chain) => (
                  <ChainChip
                    key={chain}
                    label={chainLabel(chain)}
                    active={activeChain === chain}
                    onClick={() => setStoredChain(chain)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {pending.length > 0 ? (
            <Button
              asChild
              variant="outline"
              size="lg"
              className="print:hidden"
            >
              <Link href="/lista/compra">
                <Store aria-hidden />
                Modo compra
              </Link>
            </Button>
          ) : null}

          <div className="flex flex-col gap-1">
            {grouped
              ? groupByCategory(pending, chainOrder).map((g) => (
                  <section key={g.name} aria-label={g.name}>
                    <h2 className="mt-2 mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <ProductIcon categoryIcon={g.icon} size={16} />
                      {g.name}
                    </h2>
                    {g.items.map((item) => (
                      <ListRow
                        key={`${item.id}:${item.isChecked ? "c" : "p"}`}
                        item={item}
                        onToggle={toggle}
                        onEdit={setEditItem}
                        onRemove={removeItem}
                        onQuantity={setQuantity}
                        onQuantityBusy={setQuantityBusy}
                        showIcon
                      />
                    ))}
                  </section>
                ))
              : pending.map((item) => (
                  <ListRow
                    key={`${item.id}:${item.isChecked ? "c" : "p"}`}
                    item={item}
                    onToggle={toggle}
                    onEdit={setEditItem}
                    onRemove={removeItem}
                    onQuantity={setQuantity}
                    onQuantityBusy={setQuantityBusy}
                    showIcon
                  />
                ))}

            {done.length > 0 ? (
              <p className="mt-4 mb-1 text-xs font-medium text-muted-foreground">
                En el carro ({done.length})
              </p>
            ) : null}
            {/* La key incluye el estado marcado: al (des)marcar, la fila se
                desmonta y entra animada en su nueva sección, en vez de
                teletransportarse (React reutilizaría el nodo con la key sola). */}
            {done.map((item) => (
              <ListRow
                key={`${item.id}:${item.isChecked ? "c" : "p"}`}
                item={item}
                onToggle={toggle}
                onEdit={setEditItem}
                onRemove={removeItem}
                onQuantity={setQuantity}
                onQuantityBusy={setQuantityBusy}
                showIcon
              />
            ))}
          </div>
        </>
      )}

      {visibleSuggestions.length > 0 ? (
        <Suggestions
          suggestions={visibleSuggestions}
          onAdd={addItem}
          onDismiss={dismissSuggestion}
        />
      ) : null}

      {done.length > 0 ? <CheckoutBar count={done.length} /> : null}

      {editItem ? (
        <EditListItemDrawer
          item={editItem}
          open={editItem !== null}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
          onRemove={removeItem}
        />
      ) : null}

      {/* Alta en móvil, como en inventario y en el modo compra. Sube por encima
          de la banda de «Finalizar compra» en cuanto hay algo en el carro, que
          si no la taparía; y desaparece al imprimir (la lista se imprime). */}
      <Fab
        className="md:hidden print:hidden"
        bottomClass={done.length > 0 ? "bottom-fab-over-bar" : "bottom-fab"}
      >
        <Button
          size="icon"
          aria-label="Añadir a la lista"
          className={fabButtonClass}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-6" aria-hidden />
        </Button>
      </Fab>

      {/* L17 — El catálogo del hogar para marcar de golpe lo que haga falta. Las
          sugerencias que van dentro son las MISMAS que se ven en la página (sin
          lo descartado ni lo que ya está en la lista). */}
      <ResponsiveModal open={adding} onOpenChange={setAdding}>
        <ResponsiveModalContent>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>Añadir a la lista</ResponsiveModalTitle>
            <ResponsiveModalDescription>
              Marca todo lo que necesites y entra de una vez.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <AddItemsPicker
            catalog={catalog}
            suggestions={visibleSuggestions}
            onListProductIds={[...onListProductIds]}
            onDone={() => {
              setAdding(false);
              // Las filas nuevas llegan por Realtime; esto les pone lo que el
              // evento no trae (pasillo, contenido, aviso de ahorro).
              list.heal(0);
            }}
          />
        </ResponsiveModalContent>
      </ResponsiveModal>
    </div>
  );
}

/**
 * Sugerencias visibles antes de plegar el resto. Con "agotado" entre las
 * fuentes, una despensa grande puede generar decenas: se muestran las más
 * urgentes y el resto queda a un toque, nunca truncado en silencio.
 */
const SUGGESTIONS_MAX = 8;

function ListRow({
  item,
  onToggle,
  onEdit,
  onRemove,
  onQuantity,
  onQuantityBusy,
  showIcon = false,
}: {
  item: ListItem;
  onToggle: (id: string, checked: boolean) => void;
  onEdit: (item: ListItem) => void;
  onRemove: (item: ListItem) => void;
  /** Cantidad nueva del stepper, en el mismo toque (para la equivalencia). */
  onQuantity: (id: string, quantity: number | null) => void;
  /** El stepper tiene toques sin asentar: no aplicar lo del servidor. */
  onQuantityBusy: (id: string, busy: boolean) => void;
  /** Muestra el icono de categoría delante del nombre (vista sin agrupar). */
  showIcon?: boolean;
}) {
  const { swipeProps, actionProps } = useSwipeAction(() => onRemove(item));

  const total = listTotalLabel(
    item.quantity,
    item.unit,
    item.content ?? null,
    item.packSize ?? null,
  );

  return (
    <div
      className="group relative overflow-hidden rounded-lg animate-in fade-in zoom-in-95 duration-200"
      // Safari no recorta al border-radius del padre cuando un hijo usa
      // transform (bleed de las esquinas del fondo rojo al deslizar); esta
      // máscara fuerza el clip correcto sin afectar a otros navegadores.
      style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
    >
      {/* Lo que hay detrás de la fila NO es un fondo decorativo: es el botón que
          destapa el deslizamiento, y quitar es tocarlo. Deslizar no borra (ver
          `useSwipeAction`). */}
      <button
        {...actionProps}
        aria-label={`Quitar ${item.name}`}
        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 bg-destructive text-sm font-medium text-destructive-foreground"
      >
        <Trash2 className="size-4" aria-hidden />
        Quitar
      </button>
      <div
        className="relative flex items-center gap-1 rounded-lg bg-background"
        {...swipeProps}
      >
        {/* Zona 1: checkbox con área táctil generosa (marca/desmarca).
            htmlFor/id asocian explícitamente el label con el Checkbox de Radix
            (que renderiza un <button>, no un <input> nativo). */}
        <label
          htmlFor={`chk-${item.id}`}
          className="flex min-h-12 shrink-0 cursor-pointer items-center py-1 pr-3 pl-1"
        >
          <Checkbox
            id={`chk-${item.id}`}
            checked={item.isChecked}
            onCheckedChange={(v) => onToggle(item.id, v === true)}
            aria-label={`Marcar ${item.name}`}
            className="size-5"
          />
        </label>
        {/* Icono de categoría (solo en la vista sin agrupar; en agrupada ya lo
            muestra la cabecera). Decorativo: la categoría no es esencial para
            usar la fila. */}
        {showIcon ? (
          <span
            aria-hidden
            className="flex w-5 shrink-0 justify-center"
          >
            <ProductIcon
              slug={item.productIcon}
              name={item.name}
              categoryIcon={item.categoryIcon}
              size={18}
            />
          </span>
        ) : null}
        {/* Zona 2: el texto abre el editor directamente (L5, sin modo edición). */}
        <button
          type="button"
          // El total va en la etiqueta accesible porque el aria-label tapa el
          // texto visible: sin esto, quien navega con lector solo oye "Huevos"
          // y se pierde justo el dato que evita multiplicar de más.
          aria-label={total ? `Editar ${item.name} ${total}` : `Editar ${item.name}`}
          onClick={() => onEdit(item)}
          // `min-w-0` + `break-words`: un nombre sin espacios (hasta 120
          // caracteres válidos) no tiene punto de corte, y el mínimo implícito
          // de flex (min-width: auto) ensancharía la fila entera hasta sacar el
          // stepper y la papelera de la pantalla. Mismo patrón que la tarjeta
          // de inventario.
          className="flex min-h-12 min-w-0 flex-1 items-center text-left text-sm"
        >
          <span
            className={cn(
              "min-w-0 flex-1 break-words underline decoration-dotted decoration-muted-foreground/30 underline-offset-4",
              item.isChecked && "text-muted-foreground line-through",
            )}
          >
            {item.name}
            {/* A qué equivale la línea de verdad: un «1» con pack de 10 repone
                10 ud, y "3 bricks" no dice si es litro y medio o tres. Con
                `nowrap` para que no se parta por dentro y deje el «=» colgando
                al final de una línea con los nombres largos. */}
            {/* El punteado de esta fila significa «toca para editar el nombre»,
                y corriendo bajo el total lo hacía pasar por parte del nombre.
                `inline-block` es lo que de verdad lo corta: la decoración del
                padre se propaga a los hijos EN LÍNEA y un `no-underline` suelto
                no la apaga; hace falta una caja atómica, que es justo por lo que
                los badges de tienda y ahorro son `inline-flex`. */}
            {total ? (
              <span className="ml-1.5 inline-block whitespace-nowrap text-muted-foreground no-underline">
                {total}
              </span>
            ) : null}
            {/* L15: si otra tienda sale más barata (fase 3), el aviso de ahorro
                sustituye al badge neutro (es estrictamente más útil); si no, la
                pista discreta de dónde comprarlo (fase 1/2). */}
            {item.savings ? (
              <SavingsBadge tip={item.savings} />
            ) : item.preferredChain ? (
              <ChainBadge chain={item.preferredChain} />
            ) : null}
          </span>
        </button>
        {/* Stepper inline para cualquier unidad (L9): ±1 en contables, ±¼ kg /
            ±½ l / ±100 g-ml a granel, que ahí muestra también la unidad. */}
        <QuantityStepper
          itemId={item.id}
          name={item.name}
          quantity={item.quantity}
          unit={item.unit}
          onQuantityChange={(quantity) => onQuantity(item.id, quantity)}
          onBusy={(busy) => onQuantityBusy(item.id, busy)}
        />
        {/* Papelera: siempre visible en táctil (móvil, donde no hay hover ni se
            descubre el swipe); en escritorio se oculta y se revela al hover/foco. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Quitar ${item.name}`}
          onClick={() => onRemove(item)}
          className="opacity-100 transition-opacity md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:focus-visible:pointer-events-auto md:focus-visible:opacity-100"
        >
          <Trash2 aria-hidden className="text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

/** Pista discreta de la tienda preferida de un producto (L15). */
function ChainBadge({ chain }: { chain: string }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted-foreground no-underline">
      <Store className="size-3" aria-hidden />
      {chainLabel(chain)}
    </span>
  );
}

/** Aviso de ahorro: otra cadena sale más barata (L15, fase 3; acento de precios). */
function SavingsBadge({ tip }: { tip: ChainSavingsTip }) {
  return (
    <span
      className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-chart-3/10 px-1.5 py-0.5 align-middle text-[11px] font-medium text-chart-3 no-underline"
      title={`Más barato en ${chainLabel(tip.cheaperChain)} que en ${chainLabel(tip.currentChain)}`}
    >
      <TrendingDown className="size-3" aria-hidden />
      {chainLabel(tip.cheaperChain)} −{tip.savingsPct}%
    </span>
  );
}

/**
 * Lo que te falta: caducado, bajo mínimo, agotado o toca reponer. En lista y no
 * en chips sueltos porque cada fila tiene que caber el motivo —una sugerencia
 * sin explicar por qué aparece se ignora— y un «Descartar» con área táctil de
 * verdad al lado del de añadir.
 */
function Suggestions({
  suggestions,
  onAdd,
  onDismiss,
}: {
  suggestions: Suggestion[];
  onAdd: (input: AddInput) => Promise<boolean>;
  onDismiss: (s: Suggestion) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? suggestions : suggestions.slice(0, SUGGESTIONS_MAX);
  const hidden = suggestions.length - visible.length;

  return (
    <section className="rounded-xl border border-dashed p-3">
      <h2 className="mb-1 text-sm font-medium">Te puede faltar</h2>
      <ul className="flex flex-col gap-0.5">
        {visible.map((s) => {
          // La cantidad sugerida ya viene contada en packs, así que se nombra
          // como tal y se acompaña de a cuántas unidades equivale.
          const qtyLabel = formatPurchaseQuantity(
            s.suggestedQuantity,
            s.unit,
            s.packSize,
          );
          const total = listTotalLabel(
            s.suggestedQuantity,
            s.unit,
            null,
            s.packSize,
          );
          return (
            <li key={s.productId} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onAdd({
                    kind: "product",
                    productId: s.productId,
                    name: s.name,
                    quantity: s.suggestedQuantity,
                    unit: s.unit,
                  })
                }
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left transition-colors hover:bg-muted"
                aria-label={`Añadir ${qtyLabel} de ${s.name}${total ? ` ${total}` : ""}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {s.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {suggestionReasonLabel(s)}
                  </span>
                </span>
                {/* En una línea, no apilado: apilarlo hacía más alta justo la
                    fila con pack y desalineaba la columna de números, así que la
                    sugerencia que más destacaba era la que traía envase, no la
                    más urgente. */}
                <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                  {total ? `${qtyLabel} ${total}` : qtyLabel}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Descartar ${s.name}`}
                onClick={() => onDismiss(s)}
              >
                <X aria-hidden className="text-muted-foreground" />
              </Button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 || showAll ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
        >
          {showAll ? "Ver menos" : `Ver todas (${suggestions.length})`}
        </Button>
      ) : null}
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
        loading={pending}
        onClick={checkout}
      >
        <ShoppingCart aria-hidden />
        {pending ? "Guardando…" : `Finalizar compra (${count}) → inventario`}
      </Button>
    </div>
  );
}
