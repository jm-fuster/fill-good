import "server-only";

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * `currentUser()` de Clerk, una sola vez por request.
 *
 * No es como `auth()`, que lee el token en local: es una llamada de RED a la
 * API de Clerk, y Clerk no la memoiza. /ajustes la hacía dos veces en cada
 * render (la página para el nombre y el correo, y `getAiConsent` para el
 * permiso de IA). Fuera de un render —en una Server Action— `cache()` no
 * memoiza nada y esto es exactamente `currentUser()`.
 *
 * Para PINTAR una pantalla, antes mira `getSessionUserClaims()`: lo que ya
 * trae el token no hace falta pedirlo.
 */
export const getCurrentUser = cache(() => currentUser());

/** Lo que el token de sesión trae del usuario (ver `getSessionUserClaims`). */
export type SessionUserClaims = {
  firstName: string | null;
  /** Como `user.fullName` de Clerk: nombre y apellidos, o null si no hay. */
  fullName: string | null;
  /** null = el token no sabe si hay foto (ver abajo); entonces, pregunta a Clerk. */
  hasImage: boolean | null;
  imageUrl: string | null;
  /** Versión del consentimiento de IA guardada, o null si no hay. */
  aiConsentVersion: number | null;
};

const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

/**
 * Datos del usuario que viajan DENTRO del token de sesión de Clerk, o null si
 * el token aún no los lleva.
 *
 * Existen porque `currentUser()` es una llamada de red a la API de Clerk
 * (~150 ms de proceso en su lado, medido el 10-oct-2026), y /escanear —el botón
 * central de la app— y /perfil la pagaban en CADA carga, por delante de su
 * HTML. El token, en cambio, ya llega con cada petición y se verifica en local.
 *
 * Los añade la configuración de Clerk (Dashboard → Sessions → Customize
 * session token), no el código, y por eso todo lo que los usa tiene que seguir
 * funcionando SIN ellos: un token emitido antes de configurarlos, o un entorno
 * donde nadie los ha puesto, devuelve null aquí y la pantalla pregunta a Clerk
 * como antes. Los claims, con estos nombres:
 *
 *   "first_name": "{{user.first_name}}",
 *   "last_name": "{{user.last_name}}",
 *   "has_image": "{{user.has_image}}",
 *   "image_url": "{{user.image_url}}",
 *   "ai_consent_version": "{{user.public_metadata.aiConsent.version}}"
 *
 * Dos cuidados. (1) El token se renueva cada ~60 s, así que tras un cambio
 * puede ir un minuto por detrás: quien cambia uno de estos datos desde el
 * navegador fuerza la renovación (`useRefreshSessionClaims`), y donde un dato
 * viejo pudiera hacer daño se decide con Clerk (ver `getAiConsentHint`).
 * (2) `has_image` no sale en la documentación de Clerk; si no lo resuelve, el
 * claim llega a null y /perfil pide la foto a Clerk, sin dar nunca un avatar
 * equivocado. El correo NO va en el token a propósito: el token viaja también a
 * Supabase en cada consulta, y la única pantalla que lo enseña es /ajustes.
 */
export async function getSessionUserClaims(): Promise<SessionUserClaims | null> {
  const { sessionClaims } = await auth();
  if (!sessionClaims || !("first_name" in sessionClaims)) return null;

  const firstName = text(sessionClaims.first_name);
  const lastName = text(sessionClaims.last_name);
  const hasImage = sessionClaims.has_image;
  const version = sessionClaims.ai_consent_version;
  return {
    firstName,
    fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
    hasImage: typeof hasImage === "boolean" ? hasImage : null,
    imageUrl: text(sessionClaims.image_url),
    aiConsentVersion: typeof version === "number" ? version : null,
  };
}
