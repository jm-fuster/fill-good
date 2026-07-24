"use client";

import { useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Cierre de sesión de acceso rápido. El menú de <UserButton /> también lo ofrece,
 * pero este botón directo evita tener que abrir el desplegable.
 */
export function LogoutButton() {
  const { signOut } = useClerk();
  const [pending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      await signOut({ redirectUrl: "/sign-in" });
    });
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
