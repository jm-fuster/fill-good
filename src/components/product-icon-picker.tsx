"use client";

import { useMemo, useState } from "react";
import { Check, Search, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { ProductIcon } from "@/components/product-icon";
import {
  ICON_KEYWORDS,
  ICON_LABELS,
  ICON_SECTIONS,
} from "@/lib/product-icons/catalog";
import { resolveProductIcon } from "@/lib/product-icons/guess";

/** Índice de búsqueda: slug → texto normalizado (etiqueta + sinónimos). */
const SEARCH_INDEX: Array<{ slug: string; haystack: string }> = ICON_SECTIONS.flatMap(
  (section) =>
    section.slugs.map((slug) => ({
      slug,
      haystack: normalizeName(
        `${ICON_LABELS[slug] ?? slug} ${ICON_KEYWORDS[slug] ?? ""}`,
      ),
    })),
);

/**
 * Selector de icono de producto (L16). Overlay adaptativo (bottom sheet / dialog)
 * con buscador, opción "Automático" (limpia el override manual) y rejilla por
 * secciones. `onSelect(null)` vuelve al icono automático; `onSelect(slug)` fija
 * uno. No persiste por sí mismo: el llamador guarda el valor (p. ej. la ficha de
 * edición lo envía en su formulario).
 */
export function ProductIconPicker({
  open,
  onOpenChange,
  value,
  name,
  categoryIcon,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override manual actual (slug) o null si está en automático. */
  value: string | null;
  /** Nombre del producto (para la vista previa del icono automático). */
  name?: string | null;
  /** Icono de la categoría (reserva del automático). */
  categoryIcon?: string | null;
  onSelect: (slug: string | null) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return null;
    const terms = q.split(" ").filter(Boolean);
    return SEARCH_INDEX.filter((e) =>
      terms.every((t) => e.haystack.includes(t)),
    ).map((e) => e.slug);
  }, [query]);

  // Vista previa del icono automático (adivinado del nombre o de la categoría).
  const autoResolved = resolveProductIcon({ icon: null, name, categoryIcon });

  function choose(slug: string | null) {
    onSelect(slug);
    setQuery("");
    onOpenChange(false);
  }

  function tile(slug: string) {
    const selected = value === slug;
    const label = ICON_LABELS[slug] ?? slug;
    return (
      <button
        key={slug}
        type="button"
        onClick={() => choose(slug)}
        aria-label={label}
        aria-pressed={selected}
        title={label}
        className={cn(
          "flex size-11 items-center justify-center rounded-lg border transition-colors",
          "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          // Sin text-*: el icono trae su propio color y no se tiñe. La selección se
          // marca solo con borde y fondo, que es lo que sí se ve.
          selected ? "border-primary bg-primary/10" : "border-transparent",
        )}
      >
        <ProductIcon slug={slug} size={26} />
      </button>
    );
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Elegir icono</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Busca por nombre o elige de la lista. El automático se ajusta al
            nombre del producto.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar icono…"
              aria-label="Buscar icono"
              autoComplete="off"
              className="pl-9"
            />
          </div>

          {/* Opción "Automático": limpia el override manual. */}
          <button
            type="button"
            onClick={() => choose(null)}
            aria-pressed={value === null}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
              "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              value === null ? "border-primary bg-primary/10" : "border-input",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <ProductIcon resolved={autoResolved} size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles aria-hidden className="size-4 text-muted-foreground" />
                Automático
              </span>
              <span className="block text-sm text-muted-foreground">
                Se elige solo según el nombre del producto
              </span>
            </span>
            {value === null ? (
              <Check aria-hidden className="size-5 shrink-0 text-primary" />
            ) : null}
          </button>

          {filtered ? (
            filtered.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {filtered.map((slug) => tile(slug))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ningún icono coincide con «{query}».
              </p>
            )
          ) : (
            <div className="flex flex-col gap-4">
              {ICON_SECTIONS.map((section) => (
                <section key={section.title} aria-label={section.title}>
                  <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    {section.title}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {section.slugs.map((slug) => tile(slug))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
