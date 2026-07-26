"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import { toast } from "sonner";

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
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="justify-start"
      >
        <Crown aria-hidden />
        Transferir propiedad
      </Button>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Transferir propiedad</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            El nuevo propietario podrá gestionar y eliminar el hogar. Tú pasarás
            a ser un miembro más.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

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

        <ResponsiveModalFooter className="gap-2">
          <Button onClick={confirm} loading={pending}>
            {pending ? "Transfiriendo…" : "Transferir propiedad"}
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
