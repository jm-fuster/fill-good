"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash, TriangleAlert } from "lucide-react";
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
import { deleteReceiptAction } from "../actions";

/**
 * Botón «Descartar ticket» con confirmación en `ResponsiveModal` (nunca
 * `window.confirm`). Reutilizable: como icono papelera en la tarjeta de
 * pendientes o como botón con etiqueta en la revisión / empty state.
 *
 * `redirectTo` navega tras descartar (revisión → /escanear); si se omite, solo
 * refresca (tarjeta de la lista, que ya está en /escanear).
 */
export function DeleteReceiptButton({
  receiptId,
  iconOnly = false,
  label = "Descartar ticket",
  variant = "ghost",
  className,
  redirectTo,
}: {
  receiptId: string;
  iconOnly?: boolean;
  label?: string;
  variant?: "ghost" | "destructive" | "outline";
  className?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await deleteReceiptAction(receiptId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Ticket descartado");
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch {
        toast.error("No se pudo descartar el ticket. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      {iconOnly ? (
        <Button
          variant={variant}
          size="icon"
          aria-label="Descartar ticket"
          className={className}
          onClick={() => setOpen(true)}
        >
          <Trash aria-hidden />
        </Button>
      ) : (
        <Button
          variant={variant}
          className={className}
          onClick={() => setOpen(true)}
        >
          <Trash aria-hidden />
          {label}
        </Button>
      )}
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" aria-hidden />
            ¿Descartar este ticket?
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Se perderá lo extraído por la IA.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <ResponsiveModalFooter className="gap-2">
          <Button variant="destructive" onClick={confirm} loading={pending}>
            <Trash aria-hidden />
            {pending ? "Descartando…" : "Descartar"}
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
