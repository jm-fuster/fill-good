"use client";

import type { useClerk } from "@clerk/nextjs";

import { clearLocalAppData } from "./clear-local-data";

type Clerk = ReturnType<typeof useClerk>;

const SIGN_IN_URL = "/sign-in";

/**
 * Cierra la sesión y sale a /sign-in **sin esperar a la navegación de Clerk**.
 *
 * `signOut({ redirectUrl })` a secas se cuelga en producción: el botón se queda
 * en "Cerrando sesión…" y la sesión no se cierra hasta recargar la página.
 * Traza de la app desplegada (ms desde el click):
 *
 *   10071  -> POST /ajustes                       Server Action de Clerk
 *   10342  <- 200
 *   10382  -> POST /v1/client/sessions ?_method=DELETE
 *   10581  <- 200                                 ← la sesión YA está destruida
 *   10587  -> GET /sign-in?_rsc=…                 el push "awaitable" de Clerk
 *   10754  <- 200                                 ← el payload YA está descargado
 *
 * Todo responde 200: el cierre de sesión funciona. Lo que no termina es la
 * navegación — hay un push a /sign-in y un `router.refresh()` de la ruta
 * protegida compitiendo (`__internal_onAfterSetActive`), más los prefetch de los
 * <Link> del sidebar redirigiendo a la vez. La transición de React nunca
 * commitea y, como la promesa del push solo se resuelve al commitear
 * (`useAwaitablePush` → `useInternalNavFun`), `signOut()` no resuelve ni rechaza.
 *
 * Así que no esperamos: en cuanto Clerk emite `session: null` —o sea, tras el
 * 200 del DELETE, ~600 ms— salimos con navegación dura y el navegador abandona
 * todo lo que hubiera en vuelo. De paso se tira el Router Cache, que es lo
 * deseable al cerrar sesión.
 *
 * Importante sobre lo que este código NO hace: no toca cómo Clerk cierra la
 * sesión. Se mantiene `signOut({ redirectUrl })`, la vía documentada. Si el
 * listener no llegara a dispararse, la navegación propia de Clerk sigue
 * ocurriendo: el peor caso es el comportamiento actual, nunca peor. (Un intento
 * anterior usaba el overload de callback de `signOut` y eso SÍ rompía el cierre
 * de sesión: `setActive` no completaba nunca. No volver por ahí.)
 *
 * `skipInitialEmit` es imprescindible: `addListener` invoca el callback de
 * inmediato con el estado actual, y sin esa opción saldríamos antes de cerrar.
 * Y `replace` en vez de `assign` para no dejar la página protegida en el
 * historial.
 */
export async function signOutToSignIn(clerk: Clerk) {
  // Purga la caché del SW, el estado del hogar en localStorage y la suscripción
  // a notificaciones ANTES de salir, para que ningún dato del hogar sobreviva al
  // logout en dispositivos compartidos (auditoría de privacidad jul-2026). Es
  // best-effort y se hace antes del signOut a propósito: cancelar el push
  // necesita la sesión viva, y si el cierre fallara y el usuario siguiera
  // dentro, lo perdido son la caché offline y unos avisos que se rehacen.
  await clearLocalAppData();

  const unsubscribe = clerk.addListener(
    ({ session }) => {
      if (!session) window.location.replace(SIGN_IN_URL);
    },
    { skipInitialEmit: true },
  );

  try {
    await clerk.signOut({ redirectUrl: SIGN_IN_URL });
  } catch (error) {
    unsubscribe();
    throw error;
  }
}
