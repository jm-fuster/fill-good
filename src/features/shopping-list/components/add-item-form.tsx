"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addListItemAction } from "../actions";

export function AddItemForm({ productNames }: { productNames: string[] }) {
  const router = useRouter();
  const listId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    const result = await addListItemAction({}, formData);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.warning) toast.warning(result.warning);
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <div>
      <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2">
        <Input
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          list={listId}
          placeholder="Añadir a la lista…"
          className="flex-1"
          aria-label="Producto a añadir"
        />
        <datalist id={listId}>
          {productNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
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
