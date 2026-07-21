"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/normalize";
import { LOCATION_ICONS, LOCATION_LABELS } from "@/lib/units";
import type { LocationType } from "@/lib/supabase/types";

/** Forma mínima de producto que necesita el combobox para filtrar y mostrar. */
export type ComboboxProduct = {
  id: string;
  name: string;
  normalizedName: string;
  defaultLocation?: LocationType;
  purchaseCount?: number;
};

const MAX_SUGGESTIONS = 8;

/**
 * Combobox buscable de productos del catálogo (modelo de selección: el valor es
 * el id de un producto o null). Construido sobre Command + Popover de shadcn:
 * filtra ignorando acentos/mayúsculas con `normalizeName`, ordena por
 * habitualidad (`purchaseCount`) y ofrece opcionalmente "Crear producto nuevo".
 *
 * Complementa —no sustituye— a `ProductAutocomplete` de la lista de la compra,
 * que sigue un modelo distinto (texto libre con autocompletado). Este se usa
 * donde hay que ELEGIR un producto existente: revisión de tickets (E1), fusión
 * de duplicados (E9)…
 */
export function ProductCombobox({
  products,
  value,
  onChange,
  allowCreateNew = false,
  createNewLabel = "Crear producto nuevo",
  placeholder = "Buscar producto…",
  triggerLabel,
  ariaLabel = "Producto asociado",
  disabled,
  id,
  className,
}: {
  products: ComboboxProduct[];
  value: string | null;
  onChange: (productId: string | null) => void;
  allowCreateNew?: boolean;
  createNewLabel?: string;
  placeholder?: string;
  /** Texto del trigger cuando no hay selección y no se permite crear nuevo. */
  triggerLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = value ? products.find((p) => p.id === value) ?? null : null;

  const matches = useMemo(() => {
    const ranked = [...products].sort(
      (a, b) =>
        (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0) ||
        a.name.localeCompare(b.name, "es"),
    );
    const q = normalizeName(query);
    if (!q) return ranked.slice(0, MAX_SUGGESTIONS);
    return ranked
      .filter((p) => p.normalizedName.includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [products, query]);

  function choose(productId: string | null) {
    onChange(productId);
    setOpen(false);
    setQuery("");
  }

  const triggerText = selected
    ? selected.name
    : value === null && allowCreateNew
      ? createNewLabel
      : (triggerLabel ?? placeholder);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.defaultLocation ? (
              <span aria-hidden className="shrink-0">
                {LOCATION_ICONS[selected.defaultLocation]}
              </span>
            ) : null}
            <span className="truncate">{triggerText}</span>
          </span>
          <ChevronsUpDown
            aria-hidden
            className="ml-2 size-4 shrink-0 opacity-50"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={placeholder}
          />
          <CommandList>
            {matches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin coincidencias.
              </p>
            ) : (
              <CommandGroup>
                {matches.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => choose(p.id)}
                    data-checked={p.id === value ? "true" : "false"}
                    className="min-h-11"
                  >
                    <span className="truncate">{p.name}</span>
                    {p.defaultLocation ? (
                      <Badge variant="secondary" className="ml-auto shrink-0">
                        {LOCATION_ICONS[p.defaultLocation]}{" "}
                        {LOCATION_LABELS[p.defaultLocation]}
                      </Badge>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {allowCreateNew ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__create_new__"
                    onSelect={() => choose(null)}
                    data-checked={value === null ? "true" : "false"}
                    className="min-h-11"
                  >
                    <Plus aria-hidden />
                    {createNewLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
