"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-6 pb-24">
      <div>
        <h2 className="text-base font-semibold">¿Qué tienes ya en casa?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Marca lo que haya ahora mismo; las cantidades las ajustas luego.
          También puedes escanear un ticket o añadir a mano con el botón{" "}
          <span aria-hidden>+</span>.
        </p>
      </div>

      {groups.map((group) => (
        <section
          key={group.categoryId ?? "sin-categoria"}
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-medium text-muted-foreground">
            {group.categoryIcon ? `${group.categoryIcon} ` : ""}
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
        Barra fija de confirmación, alineada con el FAB de alta manual: el hueco
        de la derecha (size-14) reserva el sitio del FAB para que no se solapen.
      */}
      <div className="fixed inset-x-0 bottom-fab z-40 mx-auto flex max-w-lg items-center gap-3 px-4">
        <Button
          size="lg"
          className="h-14 flex-1 shadow-lg"
          disabled={count === 0 || pending}
          onClick={confirm}
        >
          {pending
            ? "Añadiendo…"
            : count === 0
              ? "Añadir productos"
              : `Añadir ${count} producto${count === 1 ? "" : "s"}`}
        </Button>
        <div className="size-14 shrink-0" aria-hidden />
      </div>
    </div>
  );
}
