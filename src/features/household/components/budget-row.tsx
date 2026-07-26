"use client";

import { useState, useTransition } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { SettingsButtonRow } from "@/features/settings/components/settings-list";

import { updateMonthlyBudgetAction } from "../actions";

/** Mismo formato de euros que el panel de gasto. */
function euros(n: number) {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

/**
 * Objetivo de gasto en el índice de Ajustes: una fila con el valor actual que
 * abre el formulario en un modal. Es un dato que se define una vez, así que no
 * merece un formulario permanente en la pantalla raíz.
 *
 * Llama a la action desde el submit (en vez de `useActionState`) porque hay que
 * cerrar el modal al guardar: con el estado del hook habría que hacerlo desde un
 * efecto, y eso son renders en cascada (regla react-hooks/set-state-in-effect).
 */
export function BudgetRow({ budget }: { budget: number | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateMonthlyBudgetAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      toast.success("Objetivo guardado");
    });
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <SettingsButtonRow
        icon={Target}
        label="Objetivo de gasto"
        hint="Al mes, para el panel de precios"
        value={budget === null ? "Sin definir" : euros(budget)}
        onClick={() => setOpen(true)}
      />
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="flex items-center gap-2">
            <Target className="size-5" aria-hidden />
            Objetivo de gasto mensual
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Opcional. Si lo defines, el panel de precios muestra tu progreso del
            mes. Déjalo vacío para quitarlo.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <form onSubmit={save} className="flex flex-col">
          <div className="flex flex-col gap-2 px-4">
            <Label htmlFor="budget">Importe mensual (€)</Label>
            <Input
              id="budget"
              name="budget"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={budget ?? ""}
              autoComplete="off"
              placeholder="p. ej. 400"
              className="max-w-40"
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <ResponsiveModalFooter className="gap-2">
            <Button type="submit" loading={pending}>
              {pending ? "Guardando…" : "Guardar objetivo"}
            </Button>
            <ResponsiveModalClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </ResponsiveModalClose>
          </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
