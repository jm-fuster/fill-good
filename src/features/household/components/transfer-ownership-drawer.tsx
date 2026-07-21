"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HouseholdMember } from "../queries";
import { transferOwnershipAction } from "../actions";

export function TransferOwnershipDrawer({
  candidates,
}: {
  candidates: HouseholdMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!selected) {
      toast.error("Elige a quién le cedes la propiedad.");
      return;
    }
    startTransition(async () => {
      const result = await transferOwnershipAction(selected);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      const name =
        candidates.find((m) => m.userId === selected)?.displayName ?? "Miembro";
      toast.success(`${name} es ahora el propietario`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="justify-start"
      >
        <Crown aria-hidden />
        Transferir propiedad
      </Button>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-md flex-col">
          <DrawerHeader>
            <DrawerTitle>Transferir propiedad</DrawerTitle>
            <DrawerDescription>
              El nuevo propietario podrá gestionar y eliminar el hogar. Tú
              pasarás a ser un miembro más.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-2 px-4">
            <Label htmlFor="transfer-member">Nuevo propietario</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="transfer-member" className="w-full">
                <SelectValue placeholder="Elige un miembro" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.displayName ?? "Miembro"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DrawerFooter className="gap-2">
            <Button onClick={confirm} disabled={pending}>
              {pending ? "Transfiriendo…" : "Transferir propiedad"}
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
