"use client";

import { useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

/**
 * Pide a Clerk un token de sesión nuevo en el acto, para que las siguientes
 * peticiones al servidor lleven ya el dato recién cambiado. El servidor lee del
 * token el nombre, la foto y el consentimiento de IA (`getSessionUserClaims`),
 * y por sí solo el token se renueva cada ~60 s: sin esto, durante ese minuto
 * las pantallas pintarían el dato viejo.
 *
 * Llámalo DESPUÉS de cualquier escritura que cambie uno de esos datos. No
 * falla nunca: si no se puede, el token se pone al día solo en un minuto.
 */
export function useRefreshSessionClaims() {
  const { getToken } = useAuth();
  return useCallback(async () => {
    try {
      await getToken({ skipCache: true });
    } catch {
      // Se renovará solo; nada que hacer.
    }
  }, [getToken]);
}
