import { currentUser } from "@clerk/nextjs/server";

import { AI_CONSENT_VERSION } from "./version";

export type AiConsent = {
  /** ¿Ha consentido el usuario la versión vigente (o posterior)? */
  consented: boolean;
  /** Marca temporal ISO en que se otorgó, si existe. */
  at: string | null;
  /** Versión del consentimiento almacenada, si existe. */
  version: number | null;
};

type StoredConsent = { at?: unknown; version?: unknown };

/**
 * Lee el consentimiento de IA del usuario actual desde su publicMetadata de
 * Clerk. Se guarda en Clerk (no en Supabase) a propósito: es un dato per-usuario
 * global (no per-hogar), se elimina solo al borrar la cuenta de Clerk (sin dejar
 * huérfanos) y no requiere migración.
 */
export async function getAiConsent(): Promise<AiConsent> {
  const user = await currentUser();
  const stored = (user?.publicMetadata?.aiConsent ?? null) as StoredConsent | null;

  const version = typeof stored?.version === "number" ? stored.version : null;
  const at = typeof stored?.at === "string" ? stored.at : null;

  return {
    consented: version !== null && version >= AI_CONSENT_VERSION,
    at,
    version,
  };
}
