"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { signOutToSignIn } from "../sign-out";

/**
 * Cierre de sesión de acceso rápido. El menú de <UserButton /> también lo ofrece,
 * pero este botón directo evita tener que abrir el desplegable.
 */
export function LogoutButton() {
  const { signOut } = useClerk();
  // useState y no useTransition: la salida es una navegación dura (ver
  // signOutToSignIn), así que el pending vive hasta que el navegador descarga
  // la página, no hasta que termine una transición de React.
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await signOutToSignIn(signOut);
    } catch {
      setPending(false);
      toast.error("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  }

  return (
    <Button
      variant="outline"
      onClick={logout}
      disabled={pending}
      className="w-full justify-center"
    >
      <LogOut aria-hidden />
      {pending ? "Cerrando sesión…" : "Cerrar sesión"}
    </Button>
  );
}
