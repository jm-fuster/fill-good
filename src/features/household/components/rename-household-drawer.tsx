"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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

import { renameHouseholdAction } from "../actions";

/** Cambiar el nombre del hogar; solo se renderiza para el propietario. */
export function RenameHouseholdDrawer({
  householdId,
  currentName,
}: {
  householdId: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await renameHouseholdAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      toast.success("Nombre actualizado");
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
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="justify-start"
      >
        <Pencil aria-hidden />
        Cambiar nombre
      </Button>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Cambiar nombre del hogar</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Todos los miembros verán el nuevo nombre en la app.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <form onSubmit={save} className="flex flex-col">
          {/* El hogar que se renombra es el que está pintado aquí, no el que
              diga la cookie cuando llegue la petición (otra pestaña puede
              haberla cambiado). */}
          <input type="hidden" name="householdId" value={householdId} />
          <div className="flex flex-col gap-2 px-4">
            <Label htmlFor="household-name">Nombre del hogar</Label>
            <Input
              id="household-name"
              name="name"
              defaultValue={currentName}
              maxLength={80}
              required
              autoComplete="off"
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <ResponsiveModalFooter className="gap-2">
            <Button type="submit" loading={pending}>
              {pending ? "Guardando…" : "Guardar nombre"}
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
