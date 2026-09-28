"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ListOrdered,
  Plus,
  ShoppingCart,
  Sparkles,
  Store,
  Trash,
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
import { Fab, fabButtonClass } from "@/components/layout/fab";
import { useNavListBadge } from "@/components/layout/nav-list-count";
import { ProductIcon } from "@/components/product-icon";
import { ChainChip } from "@/components/chain-chip";
import { actionErrorMessage, safeAction } from "@/lib/action-error";
import { cn } from "@/lib/utils";
import {
  usePersistedChoice,
  usePersistedFlag,
} from "@/hooks/use-persisted-flag";
import { useSwipeAction } from "@/hooks/use-swipe-action";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { AisleOrderPanel } from "@/features/categories/components/aisle-order-panel";
import {
  aisleSort,
  type ChainAisleOrders,
} from "@/features/categories/aisle-order";
import type { StoreCategory } from "@/features/categories/queries";
import { chainLabel, orderChains } from "@/features/prices/chains";
import {
  ACTIVE_CHAIN_KEY,
  resolveChain,
  storeOptionsFor,
} from "../aisle-view";
import { vibrateTick } from "@/lib/haptics";
import { formatEuro } from "@/lib/money";
import { formatPurchaseQuantity, listTotalLabel } from "@/lib/units";
import type { ListItemRealtimeRow } from "../list-sync";
import { useSyncedList } from "../use-synced-list";
import { NO_CATEGORY_SORT } from "../grouping";
import {
  deleteListItemAction,
  fetchShoppingModeItemsAction,
  restoreListItemAction,
  toggleItemAction,
} from "../actions";
import { lineCostOf } from "../line-cost";
import type { CatalogProduct, ShoppingModeItem, Suggestion } from "../queries";
import { AddItemsPicker } from "./add-items-picker";
import { runAddAction, showAddResultToast, type AddInput } from "./add-item";
import { QuantityStepper } from "./quantity-stepper";
import { suggestionReasonLabel } from "../suggestion-reason";
import { useCheckout } from "./use-checkout";

/** Clave del único bloque cuando la lista va sin agrupar (no lleva cabecera). */
const FLAT_GROUP = "__lista__";

/** Bloque de la vista principal: un pasillo, o la lista entera sin agrupar. */
type AisleGroup = {
  /** Clave estable para la `key` de React y el plegado de los cogidos. */
  key: string;
  /** Cabecera del pasillo; null = sin agrupar (la lista va de una pieza). */
  name: string | null;
  icon: string | null;
  items: ShoppingModeItem[];
};

export function ShoppingMode({
  listId,
  initialItems,
  catalog,
  suggestions,
  categories,
  aisleOrders,
  chains,
}: {
  listId: string;
  initialItems: ShoppingModeItem[];
  catalog: CatalogProduct[];
  suggestions: Suggestion[];
  /** Pasillos del hogar en su orden GENERAL, para corregirlo sin salir de aquí. */
  categories: StoreCategory[];
  /** Órdenes de pasillo propios de cada tienda del hogar (excepciones). */
  aisleOrders: ChainAisleOrders;
  /** Supermercados del hogar (elegidos o deducidos de los tickets). */
  chains: string[];
}) {
  // Fila con la que se pinta un alta que llega del otro móvil: el evento trae la
  // fila, no lo que cuelga del producto (pasillo, envase, PRECIO), así que cae en
  // "Otros" y sin coste hasta que la cura lo complete. En el pasillo, verla
  // aparecer al instante vale más que verla aparecer completa.
  const provisionalItem = useCallback(
    (row: ListItemRealtimeRow): ShoppingModeItem => ({
      id: row.id,
      name: row.name,
      productId: row.product_id,
      quantity: row.quantity === null ? null : Number(row.quantity),
      unit: row.unit,
      isChecked: row.is_checked,
      position: row.position,
      createdAt: row.created_at,
      categoryName: "Otros",
      categoryIcon: null,
      productIcon: null,
      categoryId: null,
      categorySort: NO_CATEGORY_SORT,
      unitPrice: null,
      content: null,
      packSize: null,
      preferredChain: null,
    }),
    [],
  );

  const fetchItems = useCallback(async (id: string) => {
    const result = await fetchShoppingModeItemsAction(id);
    return result.items ?? null;
  }, []);

  // La lista viva de la compra. `checkedLast: false` porque aquí los cogidos se
  // ordenan dentro de cada pasillo, no al final de todo (ver `groups`).
  const list = useSyncedList<ShoppingModeItem>({
    listId,
    initialItems,
    fetchItems,
    provisionalItem,
    checkedLast: false,
  });

  const [adding, setAdding] = useState(false);
  // Orden de pasillos en un sheet: se corrige aquí, delante de la estantería,
  // que es donde se nota que no cuadra (también sigue en Ajustes y en /lista).
  const [ordering, setOrdering] = useState(false);
  // Recomendaciones ya añadidas en esta sesión: se ocultan al instante y siguen
  // ocultas mientras dure la compra. Las sugerencias las calcula el servidor al
  // entrar aquí, y ya no se recalculan en cada cambio (era medio segundo de
  // trabajo por cada artículo cogido); lo añadido no puede volver a ofrecerse.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  /** Ids con un «quitar» ya en marcha (papelera y deslizamiento a la vez). */
  const removing = useRef<Set<string>>(new Set());
  // L13 — Secciones con los cogidos expandidos (por defecto contraídos).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  // La misma preferencia que el conmutador "Agrupar" de `/lista`, con OTRO
  // defecto a propósito: mientras nadie la haya tocado, editar la lista es más
  // cómodo en plano y comprarla es más cómodo por pasillos, que es como se han
  // comportado siempre las dos pantallas. En cuanto el usuario elige en `/lista`
  // (se escribe el valor), manda su elección también aquí: reordenar a mano y
  // que el modo compra lo ignorase dejaba ese trabajo en nada.
  const [grouped] = usePersistedFlag("lista:grouped", true);
  // Tienda de esta compra (null = "Todas", sin decidir). Empezó siendo solo un
  // filtro (L15) y ahora manda también en el ORDEN de los pasillos: es la misma
  // pregunta ("¿dónde estás?") y tener dos controles para responderla dos veces
  // sería justo la confusión que hay que evitar.
  //
  // Se GUARDA (antes era estado local que volvía a "Todas" en cada entrada): se
  // compra muchas veces en el mismo sitio, y sobre todo es lo que permite que
  // `/lista` agrupe por los pasillos de esa tienda en vez de por el orden
  // general. Una sola respuesta para las dos pantallas (ver `aisle-view.ts`).
  const [storedChain, setStoredChain] = usePersistedChoice(ACTIVE_CHAIN_KEY);
  // Sección "otras tiendas" contraída por defecto.
  const [showOther, setShowOther] = useState(false);

  // Pantalla siempre encendida mientras dura la compra. Lo comparte con el modo
  // cocinado, que está en la misma situación: el móvil apoyado y las manos
  // ocupadas (ver `useWakeLock`).
  useWakeLock();

  function toggle(id: string, checked: boolean) {
    if (checked) vibrateTick();
    const before = list.items.find((i) => i.id === id)?.isChecked ?? !checked;
    list.patch(id, { isChecked: checked });
    // `track` marca la fila mientras la escritura viaja: lo que llegue del
    // servidor para ella entre tanto va por detrás y se ignora.
    list.pending
      .track(id, toggleItemAction(id, checked))
      .then((r) => {
        if (!r?.error) return;
        toast.error(r.error);
        list.patch(id, { isChecked: before });
        list.heal(0);
      })
      /*
        Sin `catch` no había red de seguridad justo donde más falta hace: aquí
        se marca dentro del súper, con la cobertura que haya. `track` re-lanza
        el rechazo (su `try/finally` no lo captura), así que una petición que
        muere por falta de red se saltaba el `then` entero: ni aviso, ni vuelta
        atrás, y la casilla se quedaba marcada como si se hubiera guardado.
        Treinta segundos después la cura la desmarcaba sola, ya en otro pasillo
        y sin nada que lo explicara.
      */
      .catch((err: unknown) => {
        toast.error(actionErrorMessage("No se pudo marcar.", err));
        list.patch(id, { isChecked: before });
      });
  }

  // La cantidad que corrige el stepper se guarda TAMBIÉN aquí, no solo dentro de
  // su propio estado: es lo que permite recostear la línea y el total en el mismo
  // toque (ver `costs`). El stepper sigue siendo el que persiste.
  function setQuantity(id: string, quantity: number | null) {
    list.patch(id, { quantity });
  }

  /** El stepper tiene toques sin asentar: que no los pise el servidor. */
  function setQuantityBusy(id: string, busy: boolean) {
    list.pending.setHold(id, busy);
  }

  /**
   * Quitar de la lista sin salir de la compra. Dejar algo sin marcar ya
   * significa "hoy no lo cojo, queda para la próxima"; esto significa la otra
   * cosa —"ya no lo quiero", porque lo han descatalogado o has cambiado de
   * idea delante del estante—, y hasta ahora obligaba a volver a `/lista`
   * mientras el artículo seguía contando en "quedan N por coger".
   *
   * Mismo borrado con "Deshacer" que en `/lista`: se confirma en el servidor de
   * inmediato (sobrevive a una recarga), sale al instante y queda vetado, para
   * que ninguna respuesta pedida antes del borrado lo devuelva.
   */
  function removeItem(item: ShoppingModeItem) {
    if (removing.current.has(item.id)) return;
    removing.current.add(item.id);
    list.remove(item.id);

    deleteListItemAction(item.id)
      .then((r) => {
      if (r?.error) {
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
                restoreListItemAction(snapshot)
                  .then((res) => {
                    if (res?.error) {
                      toast.error(res.error);
                      list.remove(item.id);
                    }
                  })
                  .catch((err: unknown) => {
                    toast.error(
                      actionErrorMessage("No se pudo restaurar.", err),
                    );
                    list.remove(item.id);
                  });
              },
            }
          : undefined,
      });
      })
      /*
        Sin `catch`, un borrado que no llega al servidor dejaba el artículo
        fuera de la pantalla PARA SIEMPRE en este móvil: `list.remove` lo mete
        en `tombstones`, que por diseño no se sueltan mientras dure el montaje,
        así que ninguna cura ni evento posterior podía devolverlo. El otro móvil
        seguía viéndolo, y este solo lo recuperaba al recargar en casa.
      */
      .catch((err: unknown) => {
        removing.current.delete(item.id);
        list.unremove(item);
        toast.error(actionErrorMessage("No se pudo quitar.", err));
      });
  }

  const visible = list.items;

  // Las mismas tiendas que ofrece `/lista`, con la misma regla (ver `aisle-view`).
  const storeOptions = useMemo(
    () => storeOptionsFor(chains, visible),
    [chains, visible],
  );

  // Con una sola tienda no hay pregunta que hacer: "Todas" y ella muestran lo
  // mismo, y su orden es el general del hogar (que se edita igual desde el sheet).
  const showStorePicker = storeOptions.length >= 2;

  // Tienda efectiva: si la guardada dejó de existir (cambió la lista o las
  // tiendas del hogar), volvemos a "Todas" sin tocar estado en render.
  const effectiveChain = resolveChain(storedChain, storeOptions);
  const chainOrder = effectiveChain ? aisleOrders[effectiveChain] : undefined;

  // Vista principal (tienda activa + sin asignar) y, aparte, los ítems de otras
  // tiendas agrupados por cadena para la sección secundaria. Agrupada, la
  // principal va por pasillo EN EL ORDEN DE ESA TIENDA; sin agrupar, de una
  // pieza y en el orden que trae la lista (el de «Reordenar»).
  const { groups, otherGroups, otherPending } = useMemo(() => {
    const isMain = (it: ShoppingModeItem) =>
      effectiveChain === null ||
      it.preferredChain === effectiveChain ||
      !it.preferredChain;

    const mainItems: ShoppingModeItem[] = [];
    const byChain = new Map<string, ShoppingModeItem[]>();
    let otherPendingCount = 0;

    for (const it of visible) {
      if (isMain(it)) {
        mainItems.push(it);
      } else {
        const chain = it.preferredChain as string;
        const arr = byChain.get(chain);
        if (arr) arr.push(it);
        else byChain.set(chain, [it]);
        if (!it.isChecked) otherPendingCount += 1;
      }
    }

    let groupsArr: AisleGroup[];
    if (grouped) {
      const byCat = new Map<
        string,
        { name: string; icon: string | null; sort: number; items: ShoppingModeItem[] }
      >();
      for (const it of mainItems) {
        let g = byCat.get(it.categoryName);
        if (!g) {
          g = {
            name: it.categoryName,
            icon: it.categoryIcon,
            sort: aisleSort(it.categorySort, it.categoryId, chainOrder),
            items: [],
          };
          byCat.set(it.categoryName, g);
        }
        g.items.push(it);
      }
      groupsArr = [...byCat.values()]
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "es"))
        .map((g) => ({
          key: g.name,
          name: g.name,
          icon: g.icon,
          items: g.items,
        }));
    } else {
      groupsArr =
        mainItems.length > 0
          ? [{ key: FLAT_GROUP, name: null, icon: null, items: mainItems }]
          : [];
    }
    for (const g of groupsArr) {
      g.items.sort((a, b) => Number(a.isChecked) - Number(b.isChecked));
    }

    const otherGroupsArr = orderChains([...byChain.keys()]).map((chain) => ({
      chain,
      items: byChain
        .get(chain)!
        .sort((a, b) => Number(a.isChecked) - Number(b.isChecked)),
    }));

    return {
      groups: groupsArr,
      otherGroups: otherGroupsArr,
      otherPending: otherPendingCount,
    };
  }, [visible, effectiveChain, chainOrder, grouped]);

  // Coste de cada línea CON LA CANTIDAD QUE HAY EN PANTALLA: en el pasillo se
  // corrige con el stepper (eran 3 cajas y solo quedaban 2), y el total tiene que
  // seguir al dedo. Antes venía multiplicado del servidor, así que hasta que
  // Realtime devolvía el cambio la banda de precios enseñaba la cuenta vieja,
  // justo en la pantalla que existe para vigilar el total.
  const costs = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of visible) {
      const cost = lineCostOf(it.unitPrice, it.quantity, it.unit);
      if (cost !== null) map.set(it.id, cost);
    }
    return map;
  }, [visible]);

  // Una compra sin ningún precio conocido no tiene columna de coste: ni banda de
  // total ni hueco en las filas. Es la MISMA condición para las dos cosas a
  // propósito, para que no puedan separarse y volver a contradecirse.
  const showCost = costs.size > 0;
  const total = [...costs.values()].reduce((s, c) => s + c, 0);
  const remaining = visible
    .filter((i) => !i.isChecked)
    .reduce((s, i) => s + (costs.get(i.id) ?? 0), 0);
  const totalPending = visible.filter((i) => !i.isChecked).length;
  const checkedCount = visible.filter((i) => i.isChecked).length;

  // Esta pantalla se hace cargo del badge de la navbar mientras dura la compra.
  // No se ve (el modo compra tapa la nav), y es justo el motivo: sin reclamarlo,
  // el badge saldría a releer su cuenta con CADA artículo que se coge.
  const badge = useNavListBadge();
  useEffect(() => badge.claim(), [badge]);
  useEffect(() => {
    badge.publish(totalPending);
  }, [badge, totalPending]);

  // L7 — Finalizar la compra desde aquí (al salir, el wake lock se libera en
  // el cleanup del efecto). Sin ids que revisar → vuelve a `/lista`.
  const { checkout, pending: checkingOut } = useCheckout("/lista");

  // L12 — Añadir desde el modo compra. La fila aparece por el cambio suelto de
  // Realtime (sin optimismo local aquí, aceptable en v1) y la cura le pone
  // pasillo y precio, que es lo que el evento no trae.
  async function addItem(input: AddInput): Promise<boolean> {
    const result = await safeAction(
      runAddAction(input),
      "No se pudo añadir a la lista.",
    );
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    showAddResultToast(result);
    list.heal();
    return true;
  }

  // Lo que ya está en la lista, para que el selector lo marque como tal: volver
  // a marcarlo suma cantidad en vez de duplicar la fila (L3).
  const onListProductIds = useMemo(
    () => visible.flatMap((i) => (i.productId ? [i.productId] : [])),
    [visible],
  );

  // Recomendaciones aún no añadidas. El servidor excluye lo que estaba en la
  // lista AL ENTRAR, pero no se recalcula durante la compra: lo que apunta
  // después la otra persona (o tú desde el selector) seguía ofreciéndose, y
  // tocarlo sumaba cantidad a una fila que ya estaba. Se filtra también contra
  // la lista viva; `dismissed` cubre el instante entre el toque y el eco.
  const visibleSuggestions = useMemo(() => {
    const onList = new Set(onListProductIds);
    return suggestions.filter(
      (s) => !dismissed.has(s.productId) && !onList.has(s.productId),
    );
  }, [suggestions, dismissed, onListProductIds]);

  // Añadir una recomendación con su cantidad sugerida, de un toque.
  async function addSuggestion(s: Suggestion) {
    setDismissed((prev) => new Set(prev).add(s.productId));
    const ok = await addItem({
      kind: "product",
      productId: s.productId,
      name: s.name,
      quantity: s.suggestedQuantity,
      unit: s.unit,
    });
    if (!ok) {
      // Al fallar, vuelve a mostrarse para poder reintentar.
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(s.productId);
        return next;
      });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Bandas a todo el ancho (borde/fondo), con el contenido acotado a una
          columna centrada: en escritorio el modo compra deja de estirarse por
          todo el monitor. En móvil max-w-2xl es más ancho que la pantalla, así
          que no cambia nada.

          `pt-safe-3` y no `py-3 pt-safe`: las dos declaran padding-top, gana la
          del safe-area y en navegador sin notch vale 0, así que el título salía
          pegado al borde. */}
      <header className="border-b px-4 pb-3 pt-safe-3">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Modo compra</h1>
            <p className="text-xs text-muted-foreground">
              {totalPending > 0
                ? `Quedan ${totalPending} por coger`
                : "Todo en el carro"}
              {visible.length > 0 ? (
                <span className="tabular-nums">
                  {" · "}
                  {checkedCount} de {visible.length}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {/* En móvil el alta vive en el FAB de abajo a la derecha (patrón de
                la app, y al alcance del pulgar); aquí arriba solo en escritorio,
                donde no hay FAB y las acciones van en el header. */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Añadir a la lista"
              onClick={() => setAdding(true)}
              className="hidden md:inline-flex"
            >
              <Plus className="size-5" aria-hidden />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Salir del modo compra"
            >
              <Link href="/lista">
                <X className="size-5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
        {visible.length > 0 ? (
          <div
            className="mx-auto mt-2 h-1 w-full max-w-2xl overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={visible.length}
            aria-valuenow={checkedCount}
            aria-label="Progreso de la compra"
          >
            <div
              className="h-full rounded-full bg-success transition-[width] duration-300"
              style={{ width: `${(checkedCount / visible.length) * 100}%` }}
            />
          </div>
        ) : null}
      </header>

      {showCost ? (
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="mx-auto flex w-full max-w-2xl items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {formatEuro(total)}
              </p>
              <p className="text-xs text-muted-foreground">
                estimado sobre {costs.size} de {visible.length} ítems
              </p>
            </div>
            {remaining > 0 && remaining !== total ? (
              <p className="text-right text-sm text-muted-foreground">
                Queda por coger
                <br />
                <span className="font-medium text-foreground tabular-nums">
                  ≈ {formatEuro(remaining)}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showStorePicker ? (
        <div className="border-b px-4 py-2">
          <div
            className="mx-auto flex w-full max-w-2xl gap-2 overflow-x-auto"
            role="group"
            aria-label="Tienda de esta compra"
          >
            <ChainChip
              label="Todas"
              active={effectiveChain === null}
              onClick={() => setStoredChain(null)}
            />
            {storeOptions.map((chain) => (
              <ChainChip
                key={chain}
                label={chainLabel(chain)}
                active={effectiveChain === chain}
                onClick={() => setStoredChain(chain)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* `pb-fab-flush` reserva el hueco del FAB al final del scroll: sin él, el
          botón flotante tapa el «+» del stepper de la última fila. */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-fab-flush">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              La lista está vacía.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => {
                const uncheckedItems = g.items.filter((i) => !i.isChecked);
                const checkedItems = g.items.filter((i) => i.isChecked);
                const isExpanded = expanded.has(g.key);
                return (
                  <section
                    key={g.key}
                    aria-label={g.name ?? "Artículos de la lista"}
                  >
                    {g.name ? (
                      <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                        <ProductIcon categoryIcon={g.icon} size={18} />
                        {g.name}
                      </h2>
                    ) : null}
                    <ul className="flex flex-col gap-1">
                      {uncheckedItems.map((item) => (
                        <ShoppingModeRowItem
                          key={item.id}
                          item={item}
                          cost={costs.get(item.id) ?? null}
                          onToggle={toggle}
                          onRemove={removeItem}
                          onQuantityChange={setQuantity}
                          onQuantityBusy={setQuantityBusy}
                          activeChain={effectiveChain}
                          showCost={showCost}
                        />
                      ))}
                    </ul>

                    {/* L13 — Cogidos de la sección, contraídos a una línea. */}
                    {checkedItems.length > 0 ? (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(g.key)}
                          aria-expanded={isExpanded}
                          className="flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                        >
                          <Check className="size-4 text-success" aria-hidden />
                          {checkedItems.length} cogido
                          {checkedItems.length === 1 ? "" : "s"}
                          <ChevronDown
                            aria-hidden
                            className={cn(
                              "ml-auto size-4 transition-transform",
                              isExpanded && "rotate-180",
                            )}
                          />
                        </button>
                        {isExpanded ? (
                          <ul className="flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                            {checkedItems.map((item) => (
                              <ShoppingModeRowItem
                                key={item.id}
                                item={item}
                                cost={costs.get(item.id) ?? null}
                                onToggle={toggle}
                                onRemove={removeItem}
                                onQuantityChange={setQuantity}
                                onQuantityBusy={setQuantityBusy}
                                showCost={showCost}
                              />
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}

              {/* El orden de pasillos solo se descubre cuando estorba, y solo
                  estorba con varios pasillos por delante. Con uno, no aparece —y
                  sin agrupar tampoco: ahí no hay pasillos en pantalla a los que
                  el orden pueda aplicarse. Con tienda elegida se nombra: lo que
                  se edita es SU orden. */}
              {grouped && groups.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => setOrdering(true)}
                  className="flex min-h-11 items-center gap-1.5 self-start rounded-lg px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                >
                  <ListOrdered className="size-4 shrink-0" aria-hidden />
                  {effectiveChain
                    ? `¿No es el orden de ${chainLabel(effectiveChain)}? Ordena sus pasillos`
                    : "¿No es el orden de tu tienda? Ordena los pasillos"}
                </button>
              ) : null}
            </div>
          )}

          {/* L15 — Ítems de otras tiendas cuando hay una cadena filtrada:
              contraídos por defecto (la preferencia es orientativa, no oculta). */}
          {effectiveChain && otherGroups.length > 0 ? (
            <section aria-label="Para otras tiendas">
              <button
                type="button"
                onClick={() => setShowOther((v) => !v)}
                aria-expanded={showOther}
                className="flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                <Store className="size-4" aria-hidden />
                Para otras tiendas
                {otherPending > 0 ? (
                  <span className="tabular-nums">({otherPending})</span>
                ) : null}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "ml-auto size-4 transition-transform",
                    showOther && "rotate-180",
                  )}
                />
              </button>
              {showOther ? (
                <div className="mt-1 flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  {otherGroups.map((cg) => (
                    <div key={cg.chain}>
                      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                        <Store className="size-4" aria-hidden />
                        {chainLabel(cg.chain)}
                      </h3>
                      <ul className="flex flex-col gap-1">
                        {cg.items.map((item) => (
                          <ShoppingModeRowItem
                            key={item.id}
                            item={item}
                            cost={costs.get(item.id) ?? null}
                            onToggle={toggle}
                            onRemove={removeItem}
                            onQuantityChange={setQuantity}
                            onQuantityBusy={setQuantityBusy}
                            activeChain={effectiveChain}
                            showCost={showCost}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {visibleSuggestions.length > 0 ? (
            <RecommendedSection
              suggestions={visibleSuggestions}
              onAdd={addSuggestion}
            />
          ) : null}
        </div>
      </div>

      {checkedCount > 0 ? (
        <footer className="border-t bg-background px-4 pt-3 pb-safe-3">
          <div className="mx-auto w-full max-w-2xl">
            <Button
              size="lg"
              className="w-full shadow-lg"
              disabled={checkingOut}
              onClick={checkout}
            >
              <ShoppingCart aria-hidden />
              {checkingOut
                ? "Guardando…"
                : `Finalizar compra (${checkedCount}) → inventario`}
            </Button>
          </div>
        </footer>
      ) : null}

      {/* Alta en móvil: FAB abajo a la derecha, como en inventario y recetas.
          Aquí no hay bottom nav debajo (el modo compra es un overlay a pantalla
          completa), así que se apoya en el borde inferior y sube por encima de la
          banda de «Finalizar compra» en cuanto aparece. `max-w-2xl` para caer en
          la misma columna que el contenido. */}
      <Fab
        className="max-w-2xl md:hidden"
        bottomClass={checkedCount > 0 ? "bottom-fab-stacked" : "bottom-fab-flush"}
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

      {/* L12/L17 — Alta desde el modo compra: el MISMO selector que `/lista`, que
          aquí sirve para las dos cosas que pasan en el pasillo —lo que se te
          olvidó apuntar (buscar y crear) y lo que ves y decides llevarte (marcar
          varios)—. El modo compra es un overlay a pantalla completa (z-[60]); el
          modal debe elevarse por encima (overlay y contenido) para no quedar
          oculto detrás. */}
      <ResponsiveModal open={adding} onOpenChange={setAdding}>
        <ResponsiveModalContent className="z-[70]" overlayClassName="z-[70]">
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>Añadir a la lista</ResponsiveModalTitle>
            <ResponsiveModalDescription>
              Marca todo lo que necesites y entra de una vez.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <AddItemsPicker
            catalog={catalog}
            suggestions={visibleSuggestions}
            onListProductIds={onListProductIds}
            onDone={() => {
              setAdding(false);
              // Las filas nuevas llegan por Realtime; esto les pone el pasillo y
              // el precio, que el evento no trae (y sin precio no cuentan al total).
              list.heal(0);
            }}
          />
        </ResponsiveModalContent>
      </ResponsiveModal>

      {/* Orden de pasillos sin salir de la compra: al guardar, el servidor
          revalida esta ruta y los grupos de detrás se reordenan solos. `noDrag`
          porque las filas se arrastran (si no, arrastrarlas cerraría el sheet).

          Sin conmutador de tienda: la de esta compra ya está elegida arriba, y
          es la que se edita (o el orden general si no hay ninguna elegida). */}
      <ResponsiveModal open={ordering} onOpenChange={setOrdering}>
        <ResponsiveModalContent
          className="z-[70]"
          overlayClassName="z-[70]"
          noDrag
        >
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>Orden de los pasillos</ResponsiveModalTitle>
            <ResponsiveModalDescription>
              Colócalos como los recorres en la tienda. Se guarda al mover y la
              lista de detrás se reordena.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <div className="px-4">
            <AisleOrderPanel
              categories={categories}
              orders={aisleOrders}
              chain={effectiveChain}
            />
          </div>
          <ResponsiveModalFooter>
            <Button variant="outline" onClick={() => setOrdering(false)}>
              Seguir comprando
            </Button>
          </ResponsiveModalFooter>
        </ResponsiveModalContent>
      </ResponsiveModal>
    </div>
  );
}

/**
 * Fila de un ítem en el modo compra (checkbox + nombre + coste + cantidad).
 *
 * El stepper vive FUERA del `<label>` a propósito: dentro, cada pulsación de
 * «+»/«−» activaría también el checkbox asociado al label y marcaría el
 * artículo sin querer.
 */
function ShoppingModeRowItem({
  item,
  cost,
  onToggle,
  onRemove,
  onQuantityChange,
  onQuantityBusy,
  activeChain = null,
  showCost = false,
}: {
  item: ShoppingModeItem;
  /** Coste estimado de la línea ya calculado con la cantidad actual; null = no se sabe. */
  cost: number | null;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (item: ShoppingModeItem) => void;
  onQuantityChange: (id: string, quantity: number | null) => void;
  /** El stepper tiene toques sin asentar: no aplicar lo del servidor. */
  onQuantityBusy: (id: string, busy: boolean) => void;
  /** Hay algún precio conocido en la compra; si no, no hay columna de coste. */
  showCost?: boolean;
  /** Cadena filtrada; el badge de tienda se oculta si coincide (redundante). */
  activeChain?: string | null;
}) {
  const cbId = `shop-${item.id}`;
  const showChain = item.preferredChain && item.preferredChain !== activeChain;
  const total = listTotalLabel(
    item.quantity,
    item.unit,
    item.content,
    item.packSize,
  );
  const { swipeProps, actionProps } = useSwipeAction(() => onRemove(item));

  return (
    <li
      className="group relative overflow-hidden rounded-lg"
      // Safari no recorta al border-radius del padre cuando un hijo usa
      // transform (bleed de las esquinas del fondo rojo al deslizar); esta
      // máscara fuerza el clip correcto sin afectar a otros navegadores.
      style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
    >
      {/* Lo que hay detrás de la fila NO es un fondo decorativo: es el botón que
          destapa el deslizamiento, y quitar es tocarlo. Deslizar no borra —en el
          pasillo no miras la pantalla, y un borrado al soltar se perdía con el
          aviso de «Deshacer» (ver `useSwipeAction`). */}
      <button
        {...actionProps}
        aria-label={`Quitar ${item.name}`}
        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 bg-destructive text-sm font-medium text-destructive-foreground"
      >
        <Trash className="size-4" aria-hidden />
        Quitar
      </button>
      <div
        className="relative flex items-center gap-1 rounded-lg bg-background transition-colors hover:bg-muted"
        {...swipeProps}
      >
        <label
          htmlFor={cbId}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 pl-2"
        >
          <Checkbox
            id={cbId}
            checked={item.isChecked}
            onCheckedChange={(v) => onToggle(item.id, v === true)}
            className="size-6"
          />
          <ProductIcon
            slug={item.productIcon}
            name={item.name}
            categoryIcon={item.categoryIcon}
            size={22}
            className={cn(item.isChecked && "opacity-50")}
          />
          <span
            // `break-words`: el `min-w-0` deja encoger la caja, pero un nombre
            // sin espacios no tiene por dónde partirse y desbordaba pintándose
            // encima del precio y del stepper.
            className={cn(
              "min-w-0 flex-1 break-words text-base",
              item.isChecked && "text-muted-foreground line-through",
            )}
          >
            {item.name}
            {/* A qué equivale de verdad lo que cogerás del estante: las unidades
                que repone el pack y, si el envase lo declara, cuánto llevas. Sin
                `nowrap` la etiqueta se parte por dentro y deja huérfana la unidad
                ("= 6 ud · 6" / "l"); así salta entera a la línea siguiente.
                `inline-block` no es decorativo: entre el nombre y esto NO hay
                espacio en el texto —el hueco lo pone `ml-2`—, así que en línea no
                existía punto de corte y con el nombre justo de ancho la etiqueta
                desbordaba por encima del botón «−». Una caja atómica sí se puede
                bajar de línea. */}
            {total ? (
              <span className="ml-2 inline-block whitespace-nowrap text-sm text-muted-foreground">
                {total}
              </span>
            ) : null}
            {showChain ? (
              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">
                <Store className="size-3" aria-hidden />
                {chainLabel(item.preferredChain as string)}
              </span>
            ) : null}
          </span>
        </label>
        {/* El precio va ANTES del stepper: así los «− 1 +» quedan pegados al borde
            y caen en la misma vertical en todas las filas. Con el precio al final
            era su ancho el que decidía dónde empezaba el stepper, y «3,20 €»,
            «13,10 €» y un precio desconocido lo dejaban a tres alturas distintas.
            Vacío cuando no se conoce —el guion, pegado al «+», se leía como un
            segundo botón de restar, y que no se sepan todos ya lo dice la banda de
            arriba— y sin columna ninguna si en toda la compra no hay precios. */}
        {showCost ? (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {cost != null ? formatEuro(cost) : null}
          </span>
        ) : null}
        {/* Ajustable en el pasillo con cualquier unidad: apuntaste 3 cajas y solo
            quedaban 2, o la bolsa pesó 0,75 kg en vez de 1. El «+» del último
            botón se queda a 14 px del borde por su propio relleno, así que la fila
            no necesita padding derecho (igual que la papelera en `/lista`). */}
        <QuantityStepper
          itemId={item.id}
          name={item.name}
          quantity={item.quantity}
          unit={item.unit}
          onQuantityChange={(quantity) => onQuantityChange(item.id, quantity)}
          onBusy={(busy) => onQuantityBusy(item.id, busy)}
        />
        {/* Quitar: en táctil se destapa deslizando (el pulgar ya está ahí, y la
            fila no puede crecer más: checkbox, nombre, pack, precio y stepper ya
            se reparten 360 px). En escritorio no hay deslizamiento, así que esta
            papelera aparece al pasar por encima o al recibir el foco —que es
            además el camino de teclado—. Con lector de pantalla en móvil el
            borrado sigue estando en `/lista`, con su papelera siempre visible. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Quitar ${item.name}`}
          onClick={() => onRemove(item)}
          className="hidden transition-opacity md:inline-flex md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:focus-visible:pointer-events-auto md:focus-visible:opacity-100"
        >
          <Trash aria-hidden className="text-muted-foreground" />
        </Button>
      </div>
    </li>
  );
}

/**
 * Recomendaciones durante la compra (M5): productos que sueles reponer o que
 * están por debajo del mínimo, con una cantidad sugerida. Un toque los añade a
 * la lista con esa cantidad.
 */
function RecommendedSection({
  suggestions,
  onAdd,
}: {
  suggestions: Suggestion[];
  onAdd: (s: Suggestion) => void;
}) {
  // Plegable y RECORDADO (por dispositivo, como «Agrupar»): con una despensa
  // grande son media pantalla de cosas que no vas a coger hoy, justo debajo de lo
  // que sí. Quien las tiene por medio las cierra una vez y siguen cerradas la
  // próxima compra; el número se queda a la vista para que plegarlas no sea
  // esconderlas.
  const [collapsed, setCollapsed] = usePersistedFlag(
    "compra:recomendados-plegados",
  );

  return (
    <section
      className="rounded-xl border border-dashed p-3"
      aria-label="Recomendados"
    >
      <h2>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          className="flex min-h-11 w-full items-center gap-1.5 rounded-lg text-left text-sm font-medium transition-colors hover:bg-muted"
        >
          <Sparkles className="size-4 text-chart-3" aria-hidden />
          Recomendados
          <span className="tabular-nums text-muted-foreground">
            ({suggestions.length})
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "ml-auto size-4 text-muted-foreground transition-transform",
              !collapsed && "rotate-180",
            )}
          />
        </button>
      </h2>
      {collapsed ? null : (
        <ul className="mt-1 flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {suggestions.map((s) => {
            const reason = suggestionReasonLabel(s);
            // La cantidad sugerida viene contada en packs: se nombra como tal y se
            // dice a cuántas unidades equivale (ver `listTotalLabel`).
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
              <li key={s.productId}>
                <button
                  type="button"
                  onClick={() => onAdd(s)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-muted"
                  aria-label={`Añadir ${qtyLabel} de ${s.name}${total ? ` ${total}` : ""}`}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Plus className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {reason}
                    </span>
                  </span>
                  {/* En una línea (ver la sección gemela de `/lista`): apilado,
                      la fila con pack era más alta que sus vecinas. */}
                  <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-muted-foreground">
                    {total ? `${qtyLabel} ${total}` : qtyLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
