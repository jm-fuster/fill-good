"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProductIcon } from "@/components/product-icon";
import { cn } from "@/lib/utils";
import { useDragReorder } from "@/hooks/use-drag-reorder";
import type { StoreCategory } from "../queries";
import { reorderCategoriesAction } from "../actions";

/**
 * Editor del "orden de la tienda": reordena las categorías (pasillos) a gusto
 * del hogar. Arrastrar desde el asa (puntero) o botones subir/bajar (teclado y
 * lectores). Al soltar/mover se persiste el nuevo orden; si falla, se revierte
 * resincronizando con el servidor.
 *
 * `categories` llega YA en el orden a editar (general o el propio de una
 * tienda); quien lo resuelve es `AisleOrderPanel`.
 */
export function StoreOrderEditor({
  categories,
  chain = null,
}: {
  categories: StoreCategory[];
  /** Tienda cuyo orden se edita; null = el orden general del hogar. */
  chain?: string | null;
}) {
  const router = useRouter();
  const ids = useMemo(() => categories.map((c) => c.id), [categories]);
  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const commit = useCallback(
    (orderedIds: string[]) => {
      reorderCategoriesAction(orderedIds, chain).then((r) => {
        if (r?.error) {
          toast.error(r.error);
          router.refresh();
        }
      });
    },
    [router, chain],
  );

  const { order, draggingId, registerItem, getHandleProps, move } =
    useDragReorder(ids, commit);

  if (categories.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aún no hay categorías en tu hogar.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {order.map((id, index) => {
        const cat = byId.get(id);
        if (!cat) return null;
        const isDragging = draggingId === id;
        return (
          <li
            key={id}
            ref={registerItem(id)}
            className={cn(
              "flex items-center gap-1 rounded-xl border bg-card px-1.5 py-1 transition-shadow",
              isDragging && "border-primary shadow-lg",
            )}
          >
            {/* Asa de arrastre (puntero). */}
            <span
              {...getHandleProps(id)}
              role="button"
              tabIndex={-1}
              aria-hidden
              className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-5" />
            </span>

            <span
              aria-hidden
              className="flex w-6 shrink-0 justify-center"
            >
              <ProductIcon categoryIcon={cat.icon} size={20} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {cat.name}
            </span>

            {/* Botones accesibles (teclado / lectores). */}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Subir ${cat.name}`}
              disabled={index === 0}
              onClick={() => move(id, -1)}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Bajar ${cat.name}`}
              disabled={index === order.length - 1}
              onClick={() => move(id, 1)}
            >
              <ChevronDown aria-hidden />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
