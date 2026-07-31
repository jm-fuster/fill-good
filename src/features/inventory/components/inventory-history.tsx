"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import { formatQuantity } from "@/lib/units";
import type { InventoryEventKind } from "@/lib/supabase/types";
import type { InventoryEvent } from "../queries";

const TZ = "Europe/Madrid";

const OUT = {
  label: "Consumido",
  sign: "−",
  icon: ArrowDown,
  tone: "bg-muted text-muted-foreground",
};

/**
 * La app ya no distingue si algo se consumió o se tiró, así que las bajas se
 * presentan todas igual. 'discarded' sigue apareciendo aquí porque hay eventos
 * antiguos y porque la skill de Alexa aún los escribe: se pintan como una baja
 * normal en vez de desaparecer del historial, que es lo que pasaría si esta
 * tabla dejara de cubrir ese valor.
 */
const KIND_META: Record<
  InventoryEventKind,
  { label: string; sign: string; icon: typeof ArrowUp; tone: string }
> = {
  restocked: {
    label: "Repuesto",
    sign: "+",
    icon: ArrowUp,
    tone: "bg-success/15 text-success",
  },
  consumed: OUT,
  discarded: OUT,
};

/** Clave de día (YYYY-MM-DD) en la zona horaria de la app. */
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayLabel(key: string, todayKey: string, yesterdayKey: string): string {
  if (key === todayKey) return "Hoy";
  if (key === yesterdayKey) return "Ayer";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${key}T12:00:00`));
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Historial de movimientos con buscador por producto. Filtra 100% en cliente
 * (los eventos ya vienen del servidor) y sincroniza la búsqueda en la URL con
 * `history.replaceState` (sin recarga de servidor), igual que el inventario.
 */
export function InventoryHistory({
  events,
  nowMs,
  initialQuery,
}: {
  events: InventoryEvent[];
  nowMs: number;
  initialQuery: string;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    const q = query.trim();
    window.history.replaceState(
      null,
      "",
      q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname,
    );
  }, [query, pathname]);

  // Filtro por nombre de producto: el resto de la vista (resumen incluido) se
  // calcula sobre lo buscado, así que al filtrar por un producto los números
  // de la semana son los de ese producto.
  const visible = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return events;
    return events.filter((e) => normalizeName(e.productName).includes(q));
  }, [events, query]);

  // Resumen de la semana: entradas y salidas. Las bajas se cuentan juntas, sin
  // separar lo tirado, igual que en la lista de abajo.
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const week = { restocked: 0, consumed: 0 };
  for (const e of visible) {
    if (new Date(e.createdAt).getTime() < weekAgo) continue;
    if (e.kind === "restocked") week.restocked += 1;
    else week.consumed += 1;
  }

  // Agrupar por día conservando el orden (los eventos ya vienen desc por fecha).
  const todayKey = dayKey(new Date(nowMs).toISOString());
  const yesterdayKey = dayKey(new Date(nowMs - 86_400_000).toISOString());
  const groups: { key: string; label: string; items: InventoryEvent[] }[] = [];
  for (const e of visible) {
    const key = dayKey(e.createdAt);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(key, todayKey, yesterdayKey), items: [] };
      groups.push(group);
    }
    group.items.push(e);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hist-search" className="sr-only">
          Buscar producto
        </Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="hist-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto"
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

      {groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground animate-in fade-in duration-150">
          Sin movimientos{query ? ` de «${query}»` : ""} en los últimos 30 días.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Esta semana:{" "}
          <span className="font-medium text-success">
            +{week.restocked} repuesto{week.restocked === 1 ? "" : "s"}
          </span>{" "}
          ·{" "}
          <span className="font-medium text-foreground">
            −{week.consumed} consumido{week.consumed === 1 ? "" : "s"}
          </span>
        </p>
      )}

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-muted-foreground capitalize">
            {group.label}
          </h2>
          <ul className="flex flex-col gap-2">
            {group.items.map((e) => {
              const meta = KIND_META[e.kind];
              const Icon = meta.icon;
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      meta.tone,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words line-clamp-2">
                      {e.productName}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {meta.label}
                      {e.authorName ? ` · ${e.authorName}` : ""} ·{" "}
                      {timeLabel(e.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {meta.sign}
                    {formatQuantity(e.quantity, e.unit)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
