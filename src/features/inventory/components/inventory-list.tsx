"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, Star, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import { LOCATION_ICONS, LOCATION_LABELS, LOCATION_ORDER } from "@/lib/units";
import { InventoryItemCard } from "./inventory-item-card";
import { InventorySection, type SectionUrgency } from "./inventory-section";
import type { Category, InventoryEntry } from "../queries";
import {
  getInventoryStatus,
  STATUS_FILTERS,
  urgencyRank,
  type StatusFilter,
} from "../status";

/** Lo urgente de un grupo, para resumirlo en su cabecera aunque esté plegado. */
function countUrgency(items: InventoryEntry[]): SectionUrgency {
  let expired = 0;
  let soon = 0;
  for (const e of items) {
    const s = getInventoryStatus(e);
    // Caducado manda: un ítem cuenta una sola vez, en lo más grave que tenga.
    if (s.expired) expired += 1;
    else if (s.soon) soon += 1;
  }
  return { expired, soon };
}

/**
 * Listado del inventario con buscador y chips de estado (E4). Filtra 100% en
 * cliente (los datos ya vienen del servidor); conserva las cabeceras de
 * ubicación y el orden por urgencia, y sincroniza búsqueda/chip en la URL con
 * `history.replaceState` (sin recarga de servidor) para sobrevivir al back/forward.
 */
export function InventoryList({
  entries,
  categories,
  householdChains,
  onListProductIds,
  pinnedProductIds,
  initialQuery,
  initialFilter,
}: {
  entries: InventoryEntry[];
  categories: Category[];
  /** Tiendas habituales del hogar: ordenan el selector de tienda preferida. */
  householdChains: string[];
  onListProductIds: string[];
  pinnedProductIds: string[];
  initialQuery: string;
  initialFilter: StatusFilter | null;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<StatusFilter | null>(initialFilter);

  const onList = useMemo(() => new Set(onListProductIds), [onListProductIds]);
  const pinned = useMemo(
    () => new Set(pinnedProductIds),
    [pinnedProductIds],
  );

  // Sincroniza el estado con la URL sin navegación de servidor.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (filter) params.set("estado", filter);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [query, filter, pathname]);

  // Filtro por texto (nombre de producto o de categoría), sin tocar el estado.
  const searched = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return entries;
    return entries.filter(
      (e) =>
        normalizeName(e.productName).includes(q) ||
        (e.categoryName ? normalizeName(e.categoryName).includes(q) : false),
    );
  }, [entries, query]);

  // Contadores de cada chip sobre el conjunto ya buscado (antes del chip).
  const counts = useMemo(() => {
    const acc: Record<StatusFilter, number> = {
      soon: 0,
      expired: 0,
      out: 0,
      low: 0,
    };
    for (const e of searched) {
      const s = getInventoryStatus(e);
      if (s.soon) acc.soon += 1;
      if (s.expired) acc.expired += 1;
      if (s.out) acc.out += 1;
      if (s.low) acc.low += 1;
    }
    return acc;
  }, [searched]);

  const visible = useMemo(() => {
    if (!filter) return searched;
    return searched.filter((e) => getInventoryStatus(e)[filter]);
  }, [searched, filter]);

  const byUrgency = (a: InventoryEntry, b: InventoryEntry) =>
    urgencyRank(getInventoryStatus(a)) - urgencyRank(getInventoryStatus(b)) ||
    a.productName.localeCompare(b.productName, "es");

  // "Mis habituales": los anclados se promueven a una sección propia arriba y se
  // excluyen de sus ubicaciones (aparecen una sola vez, sin doble estado del
  // stepper). El resto se agrupa por ubicación como siempre.
  const pinnedItems = useMemo(
    () => visible.filter((e) => pinned.has(e.productId)).sort(byUrgency),
    [visible, pinned],
  );

  const groups = useMemo(
    () =>
      LOCATION_ORDER.map((location) => {
        const items = visible
          .filter((e) => e.location === location && !pinned.has(e.productId))
          .sort(byUrgency);
        return { location, items, urgency: countUrgency(items) };
      }).filter((g) => g.items.length > 0),
    [visible, pinned],
  );

  // Con búsqueda o chip activo las secciones se abren a la fuerza: si no, un
  // resultado dentro de una ubicación plegada sería invisible y darías por hecho
  // que no lo tienes. El resumen de urgencia se calla solo cuando el chip ya
  // filtra por ese mismo estado (repetiría el recuento de la cabecera).
  const locked = query.trim().length > 0 || filter !== null;
  const urgencyOf = (u: SectionUrgency) => (filter === null ? u : null);

  return (
    <div className="flex flex-col gap-4 pb-fab md:pb-0">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-search" className="sr-only">
            Buscar producto o categoría
          </Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="inv-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto o categoría"
              autoComplete="off"
              className="pl-9 pr-9"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Borrar búsqueda"
                className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
          role="group"
          aria-label="Filtrar por estado"
        >
          {STATUS_FILTERS.map(({ key, label }) => {
            const active = filter === key;
            const count = counts[key];
            const isExpired = key === "expired";
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                disabled={count === 0 && !active}
                onClick={() => setFilter(active ? null : key)}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[color,background-color,border-color,transform] active:scale-95 disabled:opacity-40",
                  active && isExpired && "border-transparent bg-destructive/15 text-destructive",
                  active && !isExpired && "border-transparent bg-warning/15 text-warning",
                  !active && "border-border text-foreground hover:bg-muted",
                )}
              >
                {label}
                <span
                  className={cn(
                    "tabular-nums",
                    !active && "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {pinnedItems.length === 0 && groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground animate-in fade-in duration-150">
          Sin resultados{query ? ` para «${query}»` : ""}.
        </p>
      ) : (
        /* La key remonta el bloque al cambiar el chip de estado: un solo
           cross-fade para toda la lista (una animación, no una por tarjeta).
           A propósito NO incluye `query`: remontar en cada tecla sí costaría. */
        <div
          key={filter ?? "all"}
          className="flex flex-col gap-6 animate-in fade-in duration-150"
        >
          {pinnedItems.length > 0 ? (
            <InventorySection
              icon={<Star className="size-4 fill-current text-warning" />}
              title="Mis habituales"
              count={pinnedItems.length}
              urgency={urgencyOf(countUrgency(pinnedItems))}
              storageKey="inventario:collapsed:habituales"
              locked={locked}
            >
              {pinnedItems.map((entry) => (
                <InventoryItemCard
                  key={entry.id}
                  entry={entry}
                  categories={categories}
                  householdChains={householdChains}
                  onList={onList.has(entry.productId)}
                  pinned
                />
              ))}
            </InventorySection>
          ) : null}

          {groups.map((group) => (
            <InventorySection
              key={group.location}
              icon={LOCATION_ICONS[group.location]}
              title={LOCATION_LABELS[group.location]}
              count={group.items.length}
              urgency={urgencyOf(group.urgency)}
              storageKey={`inventario:collapsed:${group.location}`}
              locked={locked}
            >
              {group.items.map((entry) => (
                <InventoryItemCard
                  key={entry.id}
                  entry={entry}
                  categories={categories}
                  householdChains={householdChains}
                  onList={onList.has(entry.productId)}
                />
              ))}
            </InventorySection>
          ))}
        </div>
      )}
    </div>
  );
}
