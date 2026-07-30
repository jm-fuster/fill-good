"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProductIcon } from "@/components/product-icon";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/units";
import { useDragReorder } from "@/hooks/use-drag-reorder";
import type { ListItem } from "../queries";
import { groupByCategory } from "../grouping";

/**
 * Modo "Reordenar" de la lista (L14): filas simplificadas y arrastrables (asa +
 * botones subir/bajar), sin checkbox/stepper/swipe para no entrar en conflicto.
 * - Sin agrupar: se reordena toda la lista de pendientes.
 * - Agrupado: se reordena dentro de cada pasillo (categoría); al confirmar, el
 *   padre reconstruye el orden global concatenando los grupos por `sort_order`.
 */
export function ItemReorderList({
  items,
  grouped,
  chainOrder,
  onReorder,
}: {
  items: ListItem[];
  grouped: boolean;
  /**
   * Orden de pasillos de la tienda elegida, si tiene uno propio. Los pasillos se
   * ven aquí en el MISMO orden que en la lista de detrás: reordenar dentro de un
   * pasillo con los pasillos en otro orden que el de la pantalla anterior sería
   * pedirle al usuario que se reoriente a mitad de la tarea.
   */
  chainOrder?: Record<string, number>;
  onReorder: (globalIds: string[]) => void;
}) {
  const groups = useMemo(
    () => groupByCategory(items, chainOrder),
    [items, chainOrder],
  );

  if (!grouped) {
    return <SortableRows items={items} onReorder={onReorder} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name}>
          <h2 className="mt-1 mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ProductIcon categoryIcon={g.icon} size={16} />
            {g.name}
          </h2>
          <SortableRows
            items={g.items}
            onReorder={(groupIds) => {
              // Reconstruye el orden global: cada grupo en su orden de pasillo,
              // usando el nuevo orden solo para el grupo que cambió.
              const global: string[] = [];
              for (const gg of groups) {
                if (gg.name === g.name) global.push(...groupIds);
                else global.push(...gg.items.map((i) => i.id));
              }
              onReorder(global);
            }}
          />
        </section>
      ))}
    </div>
  );
}

function SortableRows({
  items,
  onReorder,
}: {
  items: ListItem[];
  onReorder: (orderedIds: string[]) => void;
}) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const { order, draggingId, registerItem, getHandleProps, move } =
    useDragReorder(ids, onReorder);

  return (
    <ul className="flex flex-col gap-1.5">
      {order.map((id, index) => {
        const item = byId.get(id);
        if (!item) return null;
        const isDragging = draggingId === id;
        const showQty =
          item.quantity != null && (item.unit == null || item.unit !== "ud")
            ? formatQuantity(item.quantity, item.unit ?? "ud")
            : item.quantity != null && item.quantity > 1
              ? `×${item.quantity}`
              : null;
        return (
          <li
            key={id}
            ref={registerItem(id)}
            className={cn(
              "flex items-center gap-1 rounded-xl border bg-card px-1.5 py-1 transition-shadow",
              isDragging && "border-primary shadow-lg",
            )}
          >
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
              <ProductIcon
                slug={item.productIcon}
                name={item.name}
                categoryIcon={item.categoryIcon}
                size={18}
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {item.name}
              {showQty ? (
                <span className="ml-1.5 text-muted-foreground">{showQty}</span>
              ) : null}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Subir ${item.name}`}
              disabled={index === 0}
              onClick={() => move(id, -1)}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Bajar ${item.name}`}
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
