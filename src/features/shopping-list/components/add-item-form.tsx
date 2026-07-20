"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addListItemAction, addProductToListAction } from "../actions";
import type { CatalogProduct } from "../queries";
import { ProductAutocomplete } from "./product-autocomplete";

export function AddItemForm({ catalog }: { catalog: CatalogProduct[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Alta de texto libre (Enter o botón +): comportamiento clásico.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await addListItemAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      setName("");
      formRef.current?.reset();
      router.refresh();
    });
  }

  // Elegir una sugerencia del catálogo: alta ya vinculada al producto.
  function handleSelect(product: CatalogProduct) {
    setError(null);
    startTransition(async () => {
      const result = await addProductToListAction(product.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <div>
      <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2">
        <ProductAutocomplete
          products={catalog}
          value={name}
          onValueChange={setName}
          onSelect={handleSelect}
          disabled={pending}
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
        />
        <Button
          type="submit"
          size="icon"
          disabled={pending}
          aria-label="Añadir a la lista"
        >
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
