/**
 * Borra los datos del hogar que la PWA deja en el dispositivo, para que no
 * sobrevivan al cierre de sesión ni al borrado de cuenta.
 *
 * Motivación (auditoría de privacidad jul-2026): el service worker (Serwist,
 * `defaultCache`) cachea con NetworkFirst las páginas RSC/HTML y las respuestas
 * de `/api/*` autenticadas (p. ej. la imagen del menú del hogar) hasta 24 h. Sin
 * esta purga, en un dispositivo compartido otra persona podía poner el navegador
 * offline tras el logout y ver el inventario, la lista, los tickets o el menú
 * del usuario anterior (arts. 5.1.f y 32 RGPD). La caché es técnica y exenta de
 * consentimiento; el problema era de confidencialidad, no de cookies.
 *
 * Se conserva el **precache** de Serwist (estáticos y páginas públicas
 * prerenderizadas): borrarlo dejaría la app sin poder servir `/offline` ni
 * arrancar sin red hasta el siguiente ciclo del SW, y no contiene datos
 * personales. Todo lo demás (páginas, RSC, api, cross-origin, fuentes) se
 * regenera con la primera navegación online del siguiente usuario.
 *
 * Best-effort: cualquier fallo se traga en silencio para no bloquear jamás el
 * cierre de sesión, que es lo prioritario.
 */

/** Subcadena que identifica la caché de precache de Serwist, que NO se borra. */
const PRESERVED_CACHE_SUBSTRING = "precache";

/**
 * Prefijos de claves de localStorage que guardan estado del hogar y deben
 * limpiarse. `theme` (next-themes) queda fuera a propósito: es una preferencia
 * del dispositivo, no un dato del hogar.
 */
const HOUSEHOLD_LOCALSTORAGE_PREFIXES = ["lista:"];

export async function clearLocalAppData(): Promise<void> {
  // Cache Storage del service worker (páginas, RSC, /api, cross-origin, fuentes).
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.includes(PRESERVED_CACHE_SUBSTRING))
          .map((key) => caches.delete(key)),
      );
    }
  } catch {
    // API de Cache no disponible o error transitorio: no bloqueamos el logout.
  }

  // localStorage con estado del hogar (deja intactas las preferencias de tema).
  try {
    if (typeof localStorage !== "undefined") {
      for (const key of Object.keys(localStorage)) {
        if (HOUSEHOLD_LOCALSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch {
    // Idem: best-effort.
  }
}
