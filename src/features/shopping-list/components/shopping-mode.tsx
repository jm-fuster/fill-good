"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/units";
import { useRealtimeList } from "../use-realtime-list";
import { toggleItemAction } from "../actions";
import type { ShoppingModeItem } from "../queries";

function euro(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
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
}: {
  listId: string;
  initialItems: ShoppingModeItem[];
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
        if (nav.wakeLock) wakeRef.current = await nav.wakeLock.request("screen");
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

  const groups = useMemo(() => {
    const byCat = new Map<
      string,
      { name: string; icon: string | null; sort: number; items: ShoppingModeItem[] }
    >();
    for (const it of items) {
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
    }
    const arr = [...byCat.values()].sort(
      (a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "es"),
    );
    for (const g of arr) {
      g.items.sort((a, b) => Number(a.isChecked) - Number(b.isChecked));
    }
    return arr;
  }, [items]);

  const priced = items.filter((i) => i.lineCost != null);
  const total = priced.reduce((s, i) => s + (i.lineCost ?? 0), 0);
  const remaining = items
    .filter((i) => !i.isChecked && i.lineCost != null)
    .reduce((s, i) => s + (i.lineCost ?? 0), 0);
  const totalPending = items.filter((i) => !i.isChecked).length;

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
            </p>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Salir del modo compra">
            <Link href="/lista">
              <X className="size-5" aria-hidden />
            </Link>
          </Button>
        </div>
      </header>

      {priced.length > 0 ? (
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="mx-auto flex w-full max-w-2xl items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{euro(total)}</p>
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

      <div className="flex-1 overflow-y-auto px-4 py-3 pb-safe">
        {items.length === 0 ? (
          <p className="mx-auto w-full max-w-2xl rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            La lista está vacía.
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            {groups.map((g) => (
              <section key={g.name} aria-label={g.name}>
                <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                  {g.icon ? <span aria-hidden>{g.icon}</span> : null}
                  {g.name}
                </h2>
                <ul className="flex flex-col gap-1">
                  {g.items.map((item) => {
                    const cbId = `shop-${item.id}`;
                    return (
                      <li key={item.id}>
                        <label
                          htmlFor={cbId}
                          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 transition-colors hover:bg-muted"
                        >
                          <Checkbox
                            id={cbId}
                            checked={item.isChecked}
                            onCheckedChange={(v) => toggle(item.id, v === true)}
                            className="size-6"
                          />
                          <span
                            className={cn(
                              "flex-1 text-base",
                              item.isChecked &&
                                "text-muted-foreground line-through",
                            )}
                          >
                            {item.name}
                            {item.quantity != null && item.unit ? (
                              <span className="ml-2 text-sm text-muted-foreground">
                                {formatQuantity(item.quantity, item.unit)}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {item.lineCost != null ? euro(item.lineCost) : "—"}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
