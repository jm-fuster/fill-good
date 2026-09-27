"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { LEGAL_NOTICE_VERSION } from "./version";

/**
 * Anota que esta persona ha visto el aviso de cambios vigente. Va en el
 * publicMetadata de Clerk, como el consentimiento de IA: sin migración, sin
 * nada en el dispositivo y se borra con la cuenta.
 */
export async function ackLegalNoticeAction(): Promise<{ ok?: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        legalNotice: { version: LEGAL_NOTICE_VERSION, at: new Date().toISOString() },
      },
    });
  } catch {
    return { error: "No se pudo guardar. Inténtalo de nuevo." };
  }
  return { ok: true };
}
