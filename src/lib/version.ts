import "server-only";

import pkg from "../../package.json";

/**
 * Identidad del build que está sirviendo la app. Existe para responder «¿está ya
 * desplegado mi cambio?» sin abrir Vercel: en una PWA la pregunta es constante,
 * porque el service worker puede seguir ejecutando el build anterior hasta que la
 * app se cierra del todo, y entonces «no veo el cambio» y «no está desplegado» se
 * confunden. Con el commit a la vista se distinguen en un vistazo.
 */
export const appVersion: string = pkg.version;

/**
 * Commit del que salió este build, en corto, o null en local (y en cualquier
 * despliegue donde Vercel no exponga sus variables de sistema, que es una
 * casilla del proyecto). Se lee en servidor y no lleva prefijo `NEXT_PUBLIC_` a
 * propósito: el cliente no lo necesita, y ahí `process.env` daría `undefined` en
 * silencio, que es peor que no tenerlo.
 */
export const buildSha: string | null =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
