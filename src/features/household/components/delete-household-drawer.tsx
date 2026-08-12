"use client";

import { useState, useTransition } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { safeAction } from "@/lib/action-error";

import { Button } from "@/components/ui/button";
import {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteHouseholdAction } from "../actions";

export function DeleteHouseholdDrawer({
  householdId,
  householdName,
}: {
  householdId: string;
  householdName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, startTransition] = useTransition();

  const matches =
    confirmName.trim().toLowerCase() === householdName.trim().toLowerCase();

  function confirm() {
    if (!matches) return;
    startTransition(async () => {
      // El id viaja con la petición porque lo que el usuario ha confirmado
      // escribiendo el nombre es ESTE hogar, no «el activo»: si mientras tanto
      // otra pestaña cambió de hogar, la acción lo rechaza en vez de borrar el
      // que no era.
      // Éxito: la acción redirige a /onboarding, no vuelve aquí.
      const result = await safeAction(
        deleteHouseholdAction(householdId),
        "No se pudo eliminar el hogar.",
      );
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        className="justify-start"
      >
        <Trash2 aria-hidden />
        Eliminar hogar
      </Button>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" aria-hidden />
            Eliminar «{householdName}»
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Esta acción es irreversible. Se borrarán el inventario, las listas de
            la compra, los tickets, las recetas y los menús de{" "}
            <strong>todos los miembros</strong>.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex flex-col gap-2 px-4">
          <Label htmlFor="confirm-household-name">
            Escribe «{householdName}» para confirmar
          </Label>
          <Input
            id="confirm-household-name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            placeholder={householdName}
          />
        </div>

        <ResponsiveModalFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={!matches}
            loading={pending}
          >
            <Trash2 aria-hidden />
            {pending ? "Eliminando…" : "Eliminar hogar definitivamente"}
          </Button>
          <ResponsiveModalClose asChild>
            <Button type="button" variant="ghost">
              Cancelar
            </Button>
          </ResponsiveModalClose>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
