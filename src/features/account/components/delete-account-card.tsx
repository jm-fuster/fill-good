"use client";

import { useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { deleteAccountAction } from "../actions";
import { signOutToSignIn } from "../sign-out";

const CONFIRM_WORD = "BORRAR";

export function DeleteAccountCard() {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  const matches = confirm.trim().toUpperCase() === CONFIRM_WORD;

  function remove() {
    if (!matches) return;
    startTransition(async () => {
      const result = await deleteAccountAction();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      // Cuenta y datos borrados: cerramos la sesión local y salimos.
      await signOutToSignIn(signOut);
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlert className="size-4" aria-hidden />
          Borrar cuenta
        </CardTitle>
        <CardDescription>
          Elimina tu cuenta y tus datos personales de forma permanente. Si eres
          el único miembro de tu hogar, también se borrará el hogar y todo su
          contenido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveModal open={open} onOpenChange={setOpen}>
          <Button
            variant="destructive"
            onClick={() => setOpen(true)}
            className="w-full justify-center sm:w-auto"
          >
            <Trash2 aria-hidden />
            Borrar mi cuenta
          </Button>
          <ResponsiveModalContent>
            <ResponsiveModalHeader>
              <ResponsiveModalTitle className="flex items-center gap-2">
                <TriangleAlert
                  className="size-5 text-destructive"
                  aria-hidden
                />
                ¿Borrar tu cuenta?
              </ResponsiveModalTitle>
              <ResponsiveModalDescription>
                Esta acción es <strong>irreversible</strong>. Se eliminarán tu
                cuenta de acceso, tus valoraciones, tus productos fijados y tus
                notificaciones. Si eres el único miembro de tu hogar, se borrará
                también todo su contenido. Si eres propietario con más miembros,
                antes debes transferir la propiedad.
              </ResponsiveModalDescription>
            </ResponsiveModalHeader>

            <div className="flex flex-col gap-2 px-4">
              <Label htmlFor="confirm-delete-account">
                Escribe «{CONFIRM_WORD}» para confirmar
              </Label>
              <Input
                id="confirm-delete-account"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder={CONFIRM_WORD}
              />
            </div>

            <ResponsiveModalFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={remove}
                disabled={!matches || pending}
              >
                <Trash2 aria-hidden />
                {pending ? "Borrando…" : "Borrar mi cuenta definitivamente"}
              </Button>
              <ResponsiveModalClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </ResponsiveModalClose>
            </ResponsiveModalFooter>
          </ResponsiveModalContent>
        </ResponsiveModal>
      </CardContent>
    </Card>
  );
}
