"use client";

import { useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { Trash2, TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsButtonRow } from "@/features/settings/components/settings-list";
import { deleteAccountAction } from "../actions";
import { signOutToSignIn } from "../sign-out";

const CONFIRM_WORD = "BORRAR";

/**
 * Borrado de cuenta en el grupo "Cuenta" del índice. Fila discreta en color
 * destructivo (la confirmación fuerte vive en el modal): sigue siendo
 * descubrible, sin gritar en la pantalla raíz.
 */
export function DeleteAccountRow() {
  const clerk = useClerk();
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
      // Cuenta y datos borrados: mismo problema de navegación colgada que en
      // LogoutRow y mismo remedio DE VERDAD — signOutToSignIn purga la caché
      // local y sale con navegación dura en cuanto la sesión muere. (Antes el
      // comentario prometía el remedio pero llamaba al `signOut` a secas que
      // sign-out.ts documenta como colgado en producción.)
      await signOutToSignIn(clerk);
    });
  }

  return (
    <ResponsiveModal open={open} onOpenChange={setOpen}>
      <SettingsButtonRow
        icon={Trash2}
        label="Borrar cuenta"
        destructive
        onClick={() => setOpen(true)}
      />
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" aria-hidden />
            ¿Borrar tu cuenta?
          </ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Esta acción es <strong>irreversible</strong>. Se eliminarán tu cuenta
            de acceso, tus valoraciones, tus productos fijados y tus
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
            disabled={!matches}
            loading={pending}
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
  );
}
