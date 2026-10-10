import { getCurrentUser } from "@/lib/current-user";

import { AI_CONSENT_REQUIRED_ERROR, AI_CONSENT_VERSION } from "./version";

export type AiConsent = {
  /** ¿Ha consentido el usuario la versión vigente (o posterior)? */
  consented: boolean;
  /** Marca temporal ISO en que se otorgó, si existe. */
  at: string | null;
  /** Versión del consentimiento almacenada, si existe. */
  version: number | null;
  /**
   * No se ha podido AVERIGUAR si consintió (Clerk no contestó). Distinto de
   * `consented: false`, que significa «se sabe que no». Ver abajo por qué son
   * dos estados y no uno.
   */
  unavailable: boolean;
};

type StoredConsent = { at?: unknown; version?: unknown };

/** El mensaje cuando no se ha podido comprobar. Uno solo para las cuatro rutas. */
export const AI_CONSENT_UNAVAILABLE_ERROR =
  "No se ha podido comprobar tu permiso para usar la IA. Vuelve a intentarlo en un momento.";

/**
 * Lee el consentimiento de IA del usuario actual desde su publicMetadata de
 * Clerk. Se guarda en Clerk (no en Supabase) a propósito: es un dato per-usuario
 * global (no per-hogar), se elimina solo al borrar la cuenta de Clerk (sin dejar
 * huérfanos) y no requiere migración.
 *
 * **`currentUser()` es una llamada de RED a la API de Clerk**, y ahí está el
 * matiz que justifica el `try`: no es como `auth()`, que verifica el token en
 * local y no sale a ningún sitio. Sin protección, un mal momento de esa API —o
 * una clave secreta que no case con la publicable— no daba un aviso: tumbaba la
 * Server Action entera con un 500, y el `catch` del cliente lo traducía a un
 * «comprueba tu conexión» que además de inútil era mentira. Y como esta puerta
 * la cruzan las CUATRO rutas de IA (tickets, menú, hueco suelto y receta) y nada
 * más, el síntoma era desconcertante: la app entera funcionando y solo la IA
 * caída.
 *
 * Falla en CERRADO: sin respuesta no se presume el consentimiento, porque de eso
 * depende que se manden datos del hogar a Google. Pero se distingue de un «no»
 * de verdad con `unavailable`, y esa diferencia importa: un «no» tiene arreglo
 * (aceptar el aviso) y esto no, así que ofrecer el diálogo de consentimiento
 * aquí sería un callejón — aceptar también escribe en Clerk, o sea que también
 * fallaría.
 */
export async function getAiConsent(): Promise<AiConsent> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    console.error("getAiConsent: no se pudo leer el usuario de Clerk:", err);
    return { consented: false, at: null, version: null, unavailable: true };
  }
  const stored = (user?.publicMetadata?.aiConsent ?? null) as StoredConsent | null;

  const version = typeof stored?.version === "number" ? stored.version : null;
  const at = typeof stored?.at === "string" ? stored.at : null;

  return {
    consented: version !== null && version >= AI_CONSENT_VERSION,
    at,
    version,
    unavailable: false,
  };
}

/**
 * La puerta de IA resuelta en una sola función: devuelve el error con el que la
 * acción debe abortar, o `null` para seguir.
 *
 * Existe porque la cruzan SEIS acciones (ticket, semana, hueco suelto, «otra
 * idea», receta del formulario y pasos desde el menú) y hasta ahora cada una
 * repetía las mismas cuatro líneas. Ese es exactamente el patrón que más veces
 * ha fallado en esta app: una regla razonada en un sitio y ausente —o distinta—
 * en el de al lado. Con el estado nuevo (`unavailable`) el riesgo era inmediato:
 * seis oportunidades de olvidarse de la rama nueva, y olvidarla no rompe ningún
 * tipo, solo devuelve a un 500 mudo.
 *
 * `needsAiConsent` solo cuando el «no» es de verdad: es lo que hace que la
 * pantalla ofrezca el diálogo para aceptar. Cuando no se ha podido comprobar,
 * ofrecerlo sería un callejón, porque aceptar escribe en Clerk y fallaría igual.
 */
export function aiConsentError(
  consent: AiConsent,
): { error: string; needsAiConsent?: boolean } | null {
  if (consent.unavailable) return { error: AI_CONSENT_UNAVAILABLE_ERROR };
  if (!consent.consented) {
    return { error: AI_CONSENT_REQUIRED_ERROR, needsAiConsent: true };
  }
  return null;
}
