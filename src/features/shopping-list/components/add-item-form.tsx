"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogProduct } from "../queries";
import type { AddInput } from "./shopping-list-view";
import { ProductAutocomplete } from "./product-autocomplete";

export function AddItemForm({
  catalog,
  onAdd,
}: {
  catalog: CatalogProduct[];
  onAdd: (input: AddInput) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);

  function parseQuantity(): number | null {
    const raw = quantity.trim();
    if (raw.length === 0) return null;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Devuelve el foco al input para poder encadenar altas sin cerrar el teclado.
  function refocus() {
    inputRef.current?.focus();
  }

  // Alta de texto libre (Enter o botón +): optimista, no espera al servidor.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setError(null);
    const qty = parseQuantity();
    // Limpiar de inmediato y mantener el foco: el ítem ya se ve en la lista.
    setName("");
    setQuantity("");
    refocus();
    void onAdd({ kind: "free", name: trimmed, quantity: qty, unit: null }).then(
      (ok) => {
        if (!ok) {
          // Restaurar el texto para reintentar (el ítem optimista ya se quitó).
          setName(trimmed);
          setQuantity(qty != null ? String(qty) : "");
          setError("No se pudo añadir. Inténtalo de nuevo.");
        }
      },
    );
  }

  // Elegir una sugerencia del catálogo: alta ya vinculada al producto, pero
  // respetando la cantidad escrita (si la hay) y la unidad por defecto.
  function handleSelect(product: CatalogProduct) {
    setError(null);
    const qty = parseQuantity();
    setName("");
    setQuantity("");
    refocus();
    void onAdd({
      kind: "product",
      productId: product.id,
      name: product.name,
      quantity: qty,
      unit: product.defaultUnit,
    });
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <ProductAutocomplete
          ref={inputRef}
          products={catalog}
          value={name}
          onValueChange={setName}
          onSelect={handleSelect}
        />
        <Input
          name="quantity"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          placeholder="Cant."
          className="w-20"
          aria-label="Cantidad"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Button type="submit" size="icon" aria-label="Añadir a la lista">
          <Plus aria-hidden />
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
