"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { SettingsButtonRow } from "@/features/settings/components/settings-list";
import { signOutToSignIn } from "../sign-out";

/**
 * Cierre de sesión desde el índice de Ajustes. El menú de <UserButton /> también
 * lo ofrece, pero esta fila directa evita tener que abrir el desplegable.
 */
export function LogoutRow() {
  const clerk = useClerk();
  // useState y no useTransition: la salida es una navegación dura (ver
  // signOutToSignIn), así que el pending vive hasta que el navegador descarga la
  // página, no hasta que termine una transición de React.
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await signOutToSignIn(clerk);
    } catch {
      setPending(false);
      toast.error("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  }

  return (
    <SettingsButtonRow
      icon={LogOut}
      label={pending ? "Cerrando sesión…" : "Cerrar sesión"}
      onClick={logout}
      disabled={pending}
    />
  );
}
