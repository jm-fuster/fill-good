"use client";

import { useState, useTransition } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteHouseholdAction } from "../actions";

export function DeleteHouseholdDrawer({
  householdName,
}: {
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
      // Éxito: la acción redirige a /onboarding, no vuelve aquí.
      const result = await deleteHouseholdAction();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        className="justify-start"
      >
        <Trash2 aria-hidden />
        Eliminar hogar
      </Button>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-md flex-col">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" aria-hidden />
              Eliminar «{householdName}»
            </DrawerTitle>
            <DrawerDescription>
              Esta acción es irreversible. Se borrarán el inventario, las listas
              de la compra, los tickets, las recetas y los menús de{" "}
              <strong>todos los miembros</strong>.
            </DrawerDescription>
          </DrawerHeader>

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

          <DrawerFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={confirm}
              disabled={!matches || pending}
            >
              <Trash2 aria-hidden />
              {pending ? "Eliminando…" : "Eliminar hogar definitivamente"}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
