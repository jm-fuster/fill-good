/**
 * Borra los datos del hogar que la PWA deja en el dispositivo, para que no
 * sobrevivan al cierre de sesión ni al borrado de cuenta. Incluye la
 * suscripción a notificaciones, que no es un dato guardado en el dispositivo
 * pero sí un canal abierto hacia él: mientras vive, sigue trayendo avisos del
 * hogar a una pantalla que ya es de otra persona.
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

import { deletePushSubscriptionAction } from "@/features/push/actions";

/** Subcadena que identifica la caché de precache de Serwist, que NO se borra. */
const PRESERVED_CACHE_SUBSTRING = "precache";

/**
 * Prefijos de claves de localStorage que guardan estado del hogar y deben
 * limpiarse. `theme` (next-themes) queda fuera a propósito: es una preferencia
 * del dispositivo, no un dato del hogar.
 */
const HOUSEHOLD_LOCALSTORAGE_PREFIXES = ["lista:"];

/**
 * Cancela la suscripción push de ESTE dispositivo: borra la fila del servidor y
 * suelta el endpoint en el navegador.
 *
 * Sin esto la suscripción sobrevive al cierre de sesión con su `household_id`
 * dentro, así que en un dispositivo compartido el cron nocturno le sigue
 * enseñando al SIGUIENTE usuario qué caduca en el hogar del anterior — la misma
 * fuga de confidencialidad que motivó la purga de cachés, por otra puerta.
 *
 * Y hay un segundo daño, menos visible: el endpoint lo emite el NAVEGADOR, no
 * la sesión. Si no se suelta, el `pushManager.subscribe()` del siguiente
 * usuario devuelve exactamente el mismo, y su upsert choca contra la fila del
 * anterior, que la RLS no le deja tocar: «No se pudo guardar la suscripción»
 * cada vez que lo intente, sin ninguna salida desde la interfaz.
 *
 * Se llama antes del signOut porque borrar la fila necesita la sesión que
 * estamos a punto de cerrar.
 */
async function clearPushSubscription(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    // `getRegistration()` y no `ready`: sin service worker registrado, `ready`
    // es una promesa que no resuelve nunca y dejaría el logout colgado.
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    // Los dos borrados van por separado a propósito: si el del servidor falla
    // (sin red), soltar el endpoint sigue siendo lo correcto — la fila que
    // queda apunta a un destino muerto y se limpia sola con el primer 410.
    try {
      await deletePushSubscriptionAction(subscription.endpoint);
    } catch {
      // Sin red: seguimos adelante con el del navegador.
    }
    await subscription.unsubscribe();
  } catch {
    // Sin permiso, sin PushManager o error transitorio: best-effort.
  }
}

export async function clearLocalAppData(): Promise<void> {
  // Suscripción push (fila en servidor + endpoint del navegador). Va primero
  // porque es lo único de aquí que necesita la sesión todavía abierta.
  await clearPushSubscription();

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
