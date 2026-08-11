"use client";

import { useState, useTransition } from "react";
import { LogOut, TriangleAlert } from "lucide-react";
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
import { leaveHouseholdAction, transferOwnershipAction } from "../actions";

/**
 * Abandonar el hogar siendo propietario. Como no se pueden dejar hogares
 * huérfanos, primero se transfiere la propiedad al miembro elegido y, acto
 * seguido, se abandona (leaveHouseholdAction redirige a /onboarding).
 */
export function OwnerLeaveDrawer({
  householdId,
  candidates,
}: {
  householdId: string;
  candidates: HouseholdMember[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!selected) {
      toast.error("Elige a quién le cedes la propiedad.");
      return;
    }
    startTransition(async () => {
      const transfer = await transferOwnershipAction(householdId, selected);
      if (transfer?.error) {
        toast.error(transfer.error);
        return;
      }
      // Ya somos miembros: abandonar. Éxito → redirige a /onboarding.
      const left = await leaveHouseholdAction(householdId);
      if (left?.error) {
        toast.error(left.error);
      }
    });
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        className="justify-start"
      >
        <LogOut aria-hidden />
        Abandonar hogar
      </Button>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" aria-hidden />
            Abandonar el hogar
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Eres el propietario, así que primero cederás la propiedad al miembro
            que elijas y después abandonarás el hogar. Podrás volver a unirte con
            el código de invitación.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="flex flex-col gap-2 px-4">
          <Label htmlFor="owner-leave-member">Nuevo propietario</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="owner-leave-member" className="w-full">
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
          <Button variant="destructive" onClick={confirm} loading={pending}>
            <LogOut aria-hidden />
            {pending ? "Abandonando…" : "Transferir y abandonar"}
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
