"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Plus,
  ShoppingCart,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { ProductIcon } from "@/components/product-icon";
import { cn } from "@/lib/utils";
import { CHAIN_OPTIONS, chainLabel } from "@/features/prices/chains";
import { vibrateTick } from "@/lib/haptics";
import { formatQuantity } from "@/lib/units";
import { useRealtimeList } from "../use-realtime-list";
import { toggleItemAction } from "../actions";
import type { CatalogProduct, ShoppingModeItem, Suggestion } from "../queries";
import { AddItemForm } from "./add-item-form";
import { runAddAction, showAddResultToast, type AddInput } from "./add-item";
import { useCheckout } from "./use-checkout";

function euro(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

/** Ranking de cadenas conocidas para ordenar los chips (desconocidas al final). */
const CHAIN_RANK = new Map(CHAIN_OPTIONS.map((c, i) => [c.value, i]));

/** Ordena cadenas por el orden canónico de chains.ts; desconocidas alfabéticas. */
function orderChains(chains: string[]): string[] {
  return [...chains].sort(
    (a, b) =>
      (CHAIN_RANK.get(a) ?? Infinity) - (CHAIN_RANK.get(b) ?? Infinity) ||
      chainLabel(a).localeCompare(chainLabel(b), "es"),
  );
}

function signatureOf(items: ShoppingModeItem[]) {
  return items
    .map((i) => `${i.id}:${i.isChecked}:${i.quantity}:${i.name}:${i.lineCost}`)
    .join("|");
}

/** Sentinel mínimo del Screen Wake Lock API (evita depender del lib DOM). */
type WakeLockLike = { release: () => Promise<void> };

export function ShoppingMode({
  listId,
  initialItems,
  catalog,
  suggestions,
}: {
  listId: string;
  initialItems: ShoppingModeItem[];
  catalog: CatalogProduct[];
  suggestions: Suggestion[];
}) {
  useRealtimeList(listId);
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [sig, setSig] = useState(signatureOf(initialItems));
  const [adding, setAdding] = useState(false);
  // Recomendaciones ya añadidas en esta sesión: se ocultan al instante (el
  // refresh del servidor las excluirá después al recalcular las sugerencias).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // L13 — Secciones con los cogidos expandidos (por defecto contraídos).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpanded(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  // L15 — Filtro por tienda: cadena activa (null = "Todas") y sección "otras
  // tiendas" contraída por defecto.
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);

  // Resincroniza con el servidor cuando llegan cambios (Realtime / refresh).
  const currentSig = signatureOf(initialItems);
  if (currentSig !== sig) {
    setSig(currentSig);
    setItems(initialItems);
  }

  // Pantalla siempre encendida mientras dura la compra (feature-detect; degrada
  // en silencio donde no exista). Se re-solicita al volver de segundo plano
  // (el sistema libera el lock al ocultar la pestaña) y se libera al salir.
  const wakeRef = useRef<WakeLockLike | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
    };
    async function request() {
      try {
        if (nav.wakeLock)
          wakeRef.current = await nav.wakeLock.request("screen");
      } catch {
        // Denegado o no disponible: seguimos sin bloqueo.
      }
    }
    request();
    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    };
  }, []);

  function toggle(id: string, checked: boolean) {
    if (checked) vibrateTick();
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

  // Cadenas presentes en la lista (para los chips del filtro), en orden canónico.
  const chainsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.preferredChain) set.add(it.preferredChain);
    return orderChains([...set]);
  }, [items]);

  // El filtro solo aparece si aporta algo: ≥2 cadenas, o 1 cadena y algún ítem
  // sin asignar (que se mostraría junto a ella).
  const hasUnassigned = items.some((i) => !i.preferredChain);
  const showChainFilter =
    chainsPresent.length >= 2 ||
    (chainsPresent.length === 1 && hasUnassigned);

  // Cadena efectiva: si la activa dejó de existir (cambió la lista), volvemos a
  // "Todas" sin tocar estado en render.
  const effectiveChain =
    activeChain && chainsPresent.includes(activeChain) ? activeChain : null;

  // Vista principal (cadena activa + sin asignar) agrupada por pasillo, y los
  // ítems de otras tiendas agrupados por cadena para la sección secundaria.
  const { groups, otherGroups, otherPending } = useMemo(() => {
    const isMain = (it: ShoppingModeItem) =>
      effectiveChain === null ||
      it.preferredChain === effectiveChain ||
      !it.preferredChain;

    const byCat = new Map<
      string,
      {
        name: string;
        icon: string | null;
        sort: number;
        items: ShoppingModeItem[];
      }
    >();
    const byChain = new Map<string, ShoppingModeItem[]>();
    let otherPendingCount = 0;

    for (const it of items) {
      if (isMain(it)) {
        let g = byCat.get(it.categoryName);
        if (!g) {
          g = {
            name: it.categoryName,
            icon: it.categoryIcon,
            sort: it.categorySort,
            items: [],
          };
          byCat.set(it.categoryName, g);
        }
        g.items.push(it);
      } else {
        const chain = it.preferredChain as string;
        const arr = byChain.get(chain);
        if (arr) arr.push(it);
        else byChain.set(chain, [it]);
        if (!it.isChecked) otherPendingCount += 1;
      }
    }

    const groupsArr = [...byCat.values()].sort(
      (a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "es"),
    );
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
  }, [items, effectiveChain]);

  const priced = items.filter((i) => i.lineCost != null);
  const total = priced.reduce((s, i) => s + (i.lineCost ?? 0), 0);
  const remaining = items
    .filter((i) => !i.isChecked && i.lineCost != null)
    .reduce((s, i) => s + (i.lineCost ?? 0), 0);
  const totalPending = items.filter((i) => !i.isChecked).length;
  const checkedCount = items.filter((i) => i.isChecked).length;

  // L7 — Finalizar la compra desde aquí (al salir, el wake lock se libera en
  // el cleanup del efecto). Sin ids que revisar → vuelve a `/lista`.
  const { checkout, pending: checkingOut } = useCheckout("/lista");

  // L12 — Añadir desde el modo compra: el ítem aparece en su grupo vía el
  // refresh de Realtime (sin optimismo local aquí, aceptable en v1).
  async function addItem(input: AddInput): Promise<boolean> {
    const result = await runAddAction(input);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    showAddResultToast(result);
    router.refresh();
    return true;
  }

  // Recomendaciones aún no añadidas (el servidor ya excluye las que están en la
  // lista; `dismissed` cubre las recién añadidas hasta que llega el refresh).
  const visibleSuggestions = suggestions.filter(
    (s) => !dismissed.has(s.productId),
  );

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
          que no cambia nada. */}
      <header className="border-b px-4 py-3 pt-safe">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Modo compra</h1>
            <p className="text-xs text-muted-foreground">
              {totalPending > 0
                ? `Quedan ${totalPending} por coger`
                : "Todo en el carro"}
              {items.length > 0 ? (
                <span className="tabular-nums">
                  {" · "}
                  {checkedCount} de {items.length}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Añadir a la lista"
              onClick={() => setAdding(true)}
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
        {items.length > 0 ? (
          <div
            className="mx-auto mt-2 h-1 w-full max-w-2xl overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={checkedCount}
            aria-label="Progreso de la compra"
          >
            <div
              className="h-full rounded-full bg-success transition-[width] duration-300"
              style={{ width: `${(checkedCount / items.length) * 100}%` }}
            />
          </div>
        ) : null}
      </header>

      {priced.length > 0 ? (
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="mx-auto flex w-full max-w-2xl items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {euro(total)}
              </p>
              <p className="text-xs text-muted-foreground">
                estimado sobre {priced.length} de {items.length} ítems
              </p>
            </div>
            {remaining > 0 && remaining !== total ? (
              <p className="text-right text-sm text-muted-foreground">
                Queda por coger
                <br />
                <span className="font-medium text-foreground tabular-nums">
                  ≈ {euro(remaining)}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {showChainFilter ? (
        <div className="border-b px-4 py-2">
          <div
            className="mx-auto flex w-full max-w-2xl gap-2 overflow-x-auto"
            role="group"
            aria-label="Filtrar por tienda"
          >
            <ChainChip
              label="Todas"
              active={effectiveChain === null}
              onClick={() => setActiveChain(null)}
            />
            {chainsPresent.map((chain) => (
              <ChainChip
                key={chain}
                label={chainLabel(chain)}
                active={effectiveChain === chain}
                onClick={() => setActiveChain(chain)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-3 pb-safe">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              La lista está vacía.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => {
                const uncheckedItems = g.items.filter((i) => !i.isChecked);
                const checkedItems = g.items.filter((i) => i.isChecked);
                const isExpanded = expanded.has(g.name);
                return (
                  <section key={g.name} aria-label={g.name}>
                    <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                      <ProductIcon categoryIcon={g.icon} size={18} />
                      {g.name}
                    </h2>
                    <ul className="flex flex-col gap-1">
                      {uncheckedItems.map((item) => (
                        <ShoppingModeRowItem
                          key={item.id}
                          item={item}
                          onToggle={toggle}
                          activeChain={effectiveChain}
                        />
                      ))}
                    </ul>

                    {/* L13 — Cogidos de la sección, contraídos a una línea. */}
                    {checkedItems.length > 0 ? (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(g.name)}
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
                                onToggle={toggle}
                              />
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
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
                            onToggle={toggle}
                            activeChain={effectiveChain}
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
        <footer className="border-t bg-background px-4 py-3 pb-safe">
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

      {/* L12 — Alta desde el modo compra en un bottom sheet. El modo compra es un
          overlay a pantalla completa (z-[60]); el modal debe elevarse por encima
          (overlay y contenido) para no quedar oculto detrás. */}
      <ResponsiveModal open={adding} onOpenChange={setAdding}>
        <ResponsiveModalContent className="z-[70]" overlayClassName="z-[70]">
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>Añadir a la lista</ResponsiveModalTitle>
          </ResponsiveModalHeader>
          <div className="px-4 pb-2">
            <AddItemForm catalog={catalog} onAdd={addItem} />
          </div>
        </ResponsiveModalContent>
      </ResponsiveModal>
    </div>
  );
}

/** Fila de un ítem en el modo compra (checkbox + nombre + coste estimado). */
function ShoppingModeRowItem({
  item,
  onToggle,
  activeChain = null,
}: {
  item: ShoppingModeItem;
  onToggle: (id: string, checked: boolean) => void;
  /** Cadena filtrada; el badge de tienda se oculta si coincide (redundante). */
  activeChain?: string | null;
}) {
  const cbId = `shop-${item.id}`;
  const showChain = item.preferredChain && item.preferredChain !== activeChain;
  return (
    <li>
      <label
        htmlFor={cbId}
        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 transition-colors hover:bg-muted"
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
          className={cn(
            "flex-1 text-base",
            item.isChecked && "text-muted-foreground line-through",
          )}
        >
          {item.name}
          {item.quantity != null && item.unit ? (
            <span className="ml-2 text-sm text-muted-foreground">
              {formatQuantity(item.quantity, item.unit)}
            </span>
          ) : null}
          {showChain ? (
            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">
              <Store className="size-3" aria-hidden />
              {chainLabel(item.preferredChain as string)}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {item.lineCost != null ? euro(item.lineCost) : "—"}
        </span>
      </label>
    </li>
  );
}

/** Chip del filtro de tienda (L15). */
function ChainChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
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
  return (
    <section
      className="rounded-xl border border-dashed p-3"
      aria-label="Recomendados"
    >
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="size-4 text-chart-3" aria-hidden />
        Recomendados
      </h2>
      <ul className="flex flex-col gap-1">
        {suggestions.map((s) => {
          const reason =
            s.reason === "restock" && s.intervalDays
              ? `Sueles comprarlo cada ~${s.intervalDays} días`
              : "Quedan pocas";
          return (
            <li key={s.productId}>
              <button
                type="button"
                onClick={() => onAdd(s)}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-muted"
                aria-label={`Añadir ${formatQuantity(s.suggestedQuantity, s.unit)} de ${s.name}`}
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
                <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                  {formatQuantity(s.suggestedQuantity, s.unit)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
