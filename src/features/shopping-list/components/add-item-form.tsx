"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatQuantity } from "@/lib/units";
import { parseQuantityFromText } from "@/lib/parse-quantity";
import type { CatalogProduct } from "../queries";
import type { AddInput } from "./shopping-list-view";
import {
  ProductAutocomplete,
  type AutocompleteOption,
} from "./product-autocomplete";

export function AddItemForm({
  catalog,
  onAdd,
  onListProductIds,
  defaultOptions,
}: {
  catalog: CatalogProduct[];
  onAdd: (input: AddInput) => Promise<boolean>;
  /** Ids de producto ya en la lista, para el badge "En la lista" (L3). */
  onListProductIds?: Set<string>;
  /** Opciones al enfocar el input vacío (L4). */
  defaultOptions?: AutocompleteOption[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // L8: parseo determinista de cantidad/unidad desde el texto libre.
  const parsed = useMemo(() => parseQuantityFromText(text), [text]);

  // Devuelve el foco al input para poder encadenar altas sin cerrar el teclado.
  function refocus() {
    inputRef.current?.focus();
  }

  // Alta de texto libre (Enter o botón +): optimista, no espera al servidor.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (parsed.name.length === 0) return;
    setError(null);
    const { name, quantity, unit } = parsed;
    // Limpiar de inmediato y mantener el foco: el ítem ya se ve en la lista.
    setText("");
    refocus();
    void onAdd({ kind: "free", name, quantity, unit }).then((ok) => {
      if (!ok) {
        // Restaurar el texto para reintentar (el ítem optimista ya se quitó).
        setText(text);
        setError("No se pudo añadir. Inténtalo de nuevo.");
      }
    });
  }

  // Elegir una sugerencia del catálogo: alta ya vinculada al producto,
  // respetando la cantidad parseada del texto (si la hay).
  function handleSelect(product: CatalogProduct) {
    setError(null);
    const quantity = parsed.quantity;
    setText("");
    refocus();
    void onAdd({
      kind: "product",
      productId: product.id,
      name: product.name,
      quantity,
      unit: product.defaultUnit,
    });
  }

  const showPreview = parsed.name.length > 0 && text.trim().length > 0;

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <ProductAutocomplete
          ref={inputRef}
          products={catalog}
          value={text}
          filterValue={parsed.name}
          onValueChange={setText}
          onSelect={handleSelect}
          onListProductIds={onListProductIds}
          defaultOptions={defaultOptions}
        />
        <Button type="submit" size="icon" aria-label="Añadir a la lista">
          <Plus aria-hidden />
        </Button>
      </form>
      {showPreview ? (
        <p className="mt-1.5 px-1 text-xs text-muted-foreground" aria-live="polite">
          Añadir: <span className="font-medium text-foreground">{parsed.name}</span>
          {parsed.quantity != null ? (
            <> · {formatQuantity(parsed.quantity, parsed.unit ?? "ud")}</>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
