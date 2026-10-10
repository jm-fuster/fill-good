import "server-only";

import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";

/**
 * `currentUser()` de Clerk, una sola vez por request.
 *
 * No es como `auth()`, que lee el token en local: es una llamada de RED a la
 * API de Clerk, y Clerk no la memoiza. /ajustes la hacía dos veces en cada
 * render (la página para el nombre y el correo, y `getAiConsent` para el
 * permiso de IA). Fuera de un render —en una Server Action— `cache()` no
 * memoiza nada y esto es exactamente `currentUser()`.
 */
export const getCurrentUser = cache(() => currentUser());
