"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { AI_CONSENT_VERSION } from "./version";

export type AiConsentState = { ok?: boolean; error?: string };

/**
 * Registra el consentimiento de IA del usuario en su publicMetadata de Clerk,
 * con la marca temporal y la versión vigente (prueba del consentimiento,
 * art. 7.1 RGPD). `updateUserMetadata` hace merge de las claves de primer nivel,
 * así que no pisa otros metadatos que pudiera haber.
 */
export async function grantAiConsentAction(): Promise<AiConsentState> {
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };

  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        aiConsent: {
          at: new Date().toISOString(),
          version: AI_CONSENT_VERSION,
        },
      },
    });
  } catch {
    return { error: "No se pudo guardar tu preferencia. Inténtalo de nuevo." };
  }

  return { ok: true };
}

/**
 * Retira el consentimiento de IA (art. 7.3 RGPD: tan fácil como otorgarlo).
 * Deja `aiConsent` a null; a partir de ahí las acciones de IA volverán a pedirlo.
 */
export async function revokeAiConsentAction(): Promise<AiConsentState> {
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };

  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { aiConsent: null },
    });
  } catch {
    return { error: "No se pudo actualizar tu preferencia. Inténtalo de nuevo." };
  }

  return { ok: true };
}
