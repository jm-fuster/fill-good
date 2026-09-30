"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import {
  effectivePackSize,
  LOCATION_ICONS,
  LOCATION_LABELS,
  UNIT_LABELS,
} from "@/lib/units";
import type { CatalogProduct } from "../queries";

const MAX_SUGGESTIONS = 6;

/** Opción del combobox: un producto del catálogo. */
type AutocompleteOption = { product: CatalogProduct };

/**
 * Combobox accesible para el nombre del producto. Sustituye al <datalist>
 * nativo: filtra el catálogo del hogar ignorando acentos/mayúsculas, ordena por
 * habitualidad y permite elegir un producto ya conocido (con su ubicación y
 * unidad) o seguir con texto libre (Enter → deja que el formulario se envíe).
 *
 * Con el input vacío no despliega nada: recorrer el catálogo entero es trabajo
 * del selector de la lista (`AddItemsPicker`), que lo enseña por pasillos y con
 * multiselección. Aquí solo se teclea un nombre.
 */
export function ProductAutocomplete({
  ref,
  id,
  products,
  value,
  filterValue,
  onValueChange,
  onSelect,
  disabled,
  inputName = "name",
  required = true,
  placeholder = "Añadir a la lista…",
  ariaLabel = "Producto a añadir",
}: {
  ref?: React.Ref<HTMLInputElement>;
  /**
   * Para asociarle una `<Label htmlFor>` visible. Con `id` el nombre accesible lo
   * pone esa etiqueta y el campo NO lleva `aria-label`: si lo llevara, taparía el
   * texto que se ve (el nombre accesible tiene que contener la etiqueta visible).
   */
  id?: string;
  products: CatalogProduct[];
  value: string;
  /** Texto por el que filtrar el catálogo si difiere de `value` (L8). */
  filterValue?: string;
  onValueChange: (v: string) => void;
  onSelect: (product: CatalogProduct) => void;
  disabled?: boolean;
  inputName?: string;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const options = useMemo<AutocompleteOption[]>(() => {
    const q = normalizeName(filterValue ?? value);
    if (q.length < 1) return [];
    return products
      .filter((p) => p.normalizedName.includes(q))
      .sort(
        (a, b) =>
          b.purchaseCount - a.purchaseCount ||
          a.name.localeCompare(b.name, "es"),
      )
      .slice(0, MAX_SUGGESTIONS)
      .map((product) => ({ product }));
  }, [products, value, filterValue]);

  const showList = open && options.length > 0;

  // Posición del desplegable en un portal a `document.body`, para que no lo
  // recorte el `overflow-y-auto` de un modal contenedor (Dialog/Drawer, L12):
  // dentro de un modal, "absolute" respecto al input queda clipado por ese
  // ancestro con overflow en vez de flotar libremente por encima.
  useEffect(() => {
    if (!showList) return;
    function updateRect() {
      const el = wrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    }
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [showList]);

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
    <div ref={wrapperRef} className="relative flex-1">
      <Input
        ref={ref}
        id={id}
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
        aria-label={id ? undefined : ariaLabel}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
      />
      {showList && rect
        ? createPortal(
            // Patrón WAI-ARIA combobox: el foco vive en el <input role="combobox">
            // y las opciones se anuncian con aria-activedescendant; ul/li con
            // role listbox/option es la asociación canónica. El teclado se
            // gestiona en el input, no por opción. jsx-a11y da falso positivo.
            <ul
              id={listboxId}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
              role="listbox"
              aria-label="Sugerencias de productos"
              className="fixed z-[80] overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md"
              style={{ top: rect.top + 4, left: rect.left, width: rect.width }}
            >
              {options.map(({ product }, index) => {
                const pack = effectivePackSize(
                  product.defaultUnit,
                  product.packSize,
                );
                return (
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li
                    key={product.id}
                    id={`${listboxId}-opt-${index}`}
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
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
                      <Badge variant="secondary">
                        {LOCATION_ICONS[product.defaultLocation]}{" "}
                        {LOCATION_LABELS[product.defaultLocation]}
                      </Badge>
                      {/* El pack sustituye a la unidad porque ES la unidad de
                          compra: elegir este producto apunta packs, no piezas, y
                          verlo aquí evita pedir diez veces más. */}
                      <span className="text-xs text-muted-foreground">
                        {pack
                          ? `pack de ${pack}`
                          : UNIT_LABELS[product.defaultUnit]}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
