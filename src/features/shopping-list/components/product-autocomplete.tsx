"use client";

import { useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import { LOCATION_ICONS, LOCATION_LABELS, UNIT_LABELS } from "@/lib/units";
import type { CatalogProduct } from "../queries";

const MAX_SUGGESTIONS = 6;

/** Opción del combobox: un producto del catálogo, con un motivo opcional. */
export type AutocompleteOption = { product: CatalogProduct; reason?: string };

/**
 * Combobox accesible para el nombre del producto. Sustituye al <datalist>
 * nativo: filtra el catálogo del hogar ignorando acentos/mayúsculas, ordena por
 * habitualidad y permite elegir un producto ya conocido (con su ubicación y
 * unidad) o seguir con texto libre (Enter → deja que el formulario se envíe).
 *
 * L4: al enfocar el input vacío muestra `defaultOptions` (sugerencias +
 * habituales al alcance del pulgar) con su motivo abreviado; al escribir vuelve
 * a filtrar el catálogo completo.
 */
export function ProductAutocomplete({
  ref,
  products,
  value,
  onValueChange,
  onSelect,
  disabled,
  onListProductIds,
  defaultOptions,
  inputName = "name",
  required = true,
  placeholder = "Añadir a la lista…",
  ariaLabel = "Producto a añadir",
}: {
  ref?: React.Ref<HTMLInputElement>;
  products: CatalogProduct[];
  value: string;
  onValueChange: (v: string) => void;
  onSelect: (product: CatalogProduct) => void;
  disabled?: boolean;
  /** Ids de producto ya en la lista, para el badge "En la lista" (L3). */
  onListProductIds?: Set<string>;
  /** Opciones al enfocar el input vacío (sugerencias/habituales) (L4). */
  defaultOptions?: AutocompleteOption[];
  inputName?: string;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = useMemo<AutocompleteOption[]>(() => {
    const q = normalizeName(value);
    if (q.length < 1) return (defaultOptions ?? []).slice(0, MAX_SUGGESTIONS);
    return products
      .filter((p) => p.normalizedName.includes(q))
      .sort(
        (a, b) =>
          b.purchaseCount - a.purchaseCount ||
          a.name.localeCompare(b.name, "es"),
      )
      .slice(0, MAX_SUGGESTIONS)
      .map((product) => ({ product }));
  }, [products, value, defaultOptions]);

  const showList = open && options.length > 0;

  function change(v: string) {
    onValueChange(v);
    setActive(-1);
    setOpen(true);
  }

  function choose(product: CatalogProduct) {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setOpen(false);
    setActive(-1);
    onSelect(product);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      // Solo interceptamos si hay una opción resaltada; si no, dejamos que el
      // formulario haga el alta de texto libre (comportamiento actual).
      if (showList && active >= 0 && options[active]) {
        event.preventDefault();
        choose(options[active].product);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  const activeId = active >= 0 ? `${listboxId}-opt-${active}` : undefined;

  return (
    <div className="relative flex-1">
      <Input
        ref={ref}
        name={inputName}
        value={value}
        onChange={(e) => change(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        required={required}
        maxLength={120}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
      />
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Sugerencias de productos"
          className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md"
        >
          {options.map(({ product, reason }, index) => (
            <li
              key={product.id}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(product)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
                index === active && "bg-muted",
              )}
            >
              <span className="truncate font-medium">{product.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {onListProductIds?.has(product.id) ? (
                  <Badge variant="secondary">En la lista</Badge>
                ) : reason ? (
                  <span className="text-xs text-muted-foreground">{reason}</span>
                ) : (
                  <>
                    <Badge variant="secondary">
                      {LOCATION_ICONS[product.defaultLocation]}{" "}
                      {LOCATION_LABELS[product.defaultLocation]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {UNIT_LABELS[product.defaultUnit]}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
