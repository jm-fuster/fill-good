import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/units";
import type { InventoryEventKind } from "@/lib/supabase/types";
import type { InventoryEvent } from "../queries";

const TZ = "Europe/Madrid";

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
  consumed: {
    label: "Consumido",
    sign: "−",
    icon: ArrowDown,
    tone: "bg-muted text-muted-foreground",
  },
  discarded: {
    label: "Tirado",
    sign: "−",
    icon: Trash2,
    tone: "bg-destructive/15 text-destructive",
  },
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

export function InventoryHistory({
  events,
  nowMs,
}: {
  events: InventoryEvent[];
  nowMs: number;
}) {
  // Resumen de la semana (conteo simple de eventos por tipo).
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const week = { restocked: 0, consumed: 0, discarded: 0 };
  for (const e of events) {
    if (new Date(e.createdAt).getTime() >= weekAgo) week[e.kind] += 1;
  }

  // Agrupar por día conservando el orden (los eventos ya vienen desc por fecha).
  const todayKey = dayKey(new Date(nowMs).toISOString());
  const yesterdayKey = dayKey(new Date(nowMs - 86_400_000).toISOString());
  const groups: { key: string; label: string; items: InventoryEvent[] }[] = [];
  for (const e of events) {
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
      <p className="text-sm text-muted-foreground">
        Esta semana:{" "}
        <span className="font-medium text-success">
          +{week.restocked} repuesto{week.restocked === 1 ? "" : "s"}
        </span>{" "}
        ·{" "}
        <span className="font-medium text-foreground">
          −{week.consumed} consumido{week.consumed === 1 ? "" : "s"}
        </span>{" "}
        ·{" "}
        <span className="font-medium text-destructive">
          −{week.discarded} tirado{week.discarded === 1 ? "" : "s"}
        </span>
      </p>

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
