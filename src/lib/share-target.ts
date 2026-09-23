/**
 * Dónde deja el service worker el ticket compartido desde otra app (Web Share
 * Target) para que lo recoja /escanear. Lo comparten `app/sw.ts` y
 * `ScanForm`, que no se pueden importar el uno al otro.
 */
export const SHARE_CACHE = "fg-share-target";
export const SHARE_KEY = "/__ticket-compartido";
/** Cookie con el error del route handler de reserva (sin service worker). */
export const SHARE_ERROR_COOKIE = "fg_share_error";
