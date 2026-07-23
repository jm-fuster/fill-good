"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ProductIcon } from "@/components/product-icon";
import { cn } from "@/lib/utils";
import type { StarterGroup } from "../queries";
import { addStarterItemsAction } from "../actions";

/**
 * Selector "¿Qué tienes ya en casa?" del empty state del inventario (E12). Chips
 * toggle multiselección agrupados por categoría; al confirmar crea los
 * `inventory_items` reales. Es un atajo opcional, no un paso de onboarding: el
 * alta manual (FAB) y el escaneo de ticket (nav) siguen accesibles.
 */
export function StarterPicker({ groups }: { groups: StarterGroup[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const count = selected.size;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    if (count === 0 || pending) return;
    const ids = [...selected];
    startTransition(async () => {
      const r = await addStarterItemsAction(ids);
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      const added = r.added ?? ids.length;
      toast.success(
        `${added} producto${added === 1 ? "" : "s"} añadido${
          added === 1 ? "" : "s"
        } al inventario`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div>
        <h2 className="text-base font-semibold">¿Qué tienes ya en casa?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Marca lo que haya ahora mismo; las cantidades las ajustas luego.
          También puedes escanear un ticket o añadir productos a mano.
        </p>
      </div>

      {groups.map((group) => (
        <section
          key={group.categoryId ?? "sin-categoria"}
          className="flex flex-col gap-2"
        >
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <ProductIcon categoryIcon={group.categoryIcon} size={16} />
            {group.categoryName}
          </h3>
          <div className="flex flex-wrap gap-2">
            {group.products.map((product) => {
              const isSelected = selected.has(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggle(product.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {isSelected ? (
                    <Check className="size-4 shrink-0" aria-hidden />
                  ) : null}
                  {product.name}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/*
        Barra de confirmación. Móvil: fija sobre la bottom nav, alineada con el
        FAB de alta manual (el hueco size-14 de la derecha reserva su sitio para
        que no se solapen). Escritorio (≥ md): en el flujo, sticky al fondo del
        contenido a todo el ancho, como el resto de barras de acción; el FAB no
        existe (es md:hidden), así que su hueco se oculta.
      */}
      <div className="fixed inset-x-0 bottom-fab z-40 mx-auto flex max-w-lg items-center gap-3 px-4 md:sticky md:inset-x-auto md:bottom-0 md:mx-0 md:max-w-none md:border-t md:bg-background/95 md:px-0 md:pt-3 md:pb-3 md:backdrop-blur-sm">
        <Button
          size="lg"
          className="h-14 flex-1 shadow-lg md:h-12"
          disabled={count === 0 || pending}
          onClick={confirm}
        >
          {pending
            ? "Añadiendo…"
            : count === 0
              ? "Añadir productos"
              : `Añadir ${count} producto${count === 1 ? "" : "s"}`}
        </Button>
        <div className="size-14 shrink-0 md:hidden" aria-hidden />
      </div>
    </div>
  );
}
