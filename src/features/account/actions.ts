"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type DeleteAccountState = { error?: string; ok?: boolean };

/**
 * Borrado de cuenta (RGPD). Dos pasos, en este orden:
 *  1. RPC delete_account(): borra los datos del usuario en Supabase con su propio
 *     JWT aún válido. Lanza 'owner_must_transfer' si es propietario de un hogar
 *     con más miembros (debe transferir antes).
 *  2. Backend API de Clerk: elimina la cuenta de acceso.
 * No redirige: el cliente cierra sesión (limpia el estado local de Clerk) y
 * navega a /sign-in al recibir { ok: true }.
 */
export async function deleteAccountAction(): Promise<DeleteAccountState> {
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_account");
  if (error) {
    if (error.message?.includes("owner_must_transfer")) {
      return {
        error:
          "Eres propietario de un hogar con más miembros: transfiere la propiedad a otro miembro antes de borrar tu cuenta.",
      };
    }
    return { error: "No se pudieron borrar tus datos. Inténtalo de nuevo." };
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch {
    // Los datos ya se borraron; si la cuenta de acceso no se pudo eliminar, el
    // usuario puede reintentar (el RPC es idempotente al no quedar ya datos).
    return {
      error:
        "Tus datos se borraron, pero no se pudo eliminar la cuenta de acceso. Inténtalo de nuevo.",
    };
  }

  return { ok: true };
}
