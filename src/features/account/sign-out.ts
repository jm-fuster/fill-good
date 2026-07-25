"use client";

import type { useClerk } from "@clerk/nextjs";

type SignOut = ReturnType<typeof useClerk>["signOut"];

const SIGN_IN_URL = "/sign-in";

/**
 * Cierra la sesión y sale a /sign-in con **navegación dura**.
 *
 * Por qué no `signOut({ redirectUrl: "/sign-in" })`: con el App Router, Clerk
 * navega con el router de Next y espera a que la navegación commitee (push
 * "awaitable"), y además engancha un `router.refresh()` en
 * `__internal_onAfterSetActive`. Eso encadena dos roundtrips RSC —los dos por
 * el middleware— antes de que la promesa resuelva, con el botón congelado en
 * "Cerrando sesión…" y sin que el usuario vea nada.
 *
 * Con el callback de `signOut` tomamos nosotros el control: en cuanto la sesión
 * está destruida el navegador abandona lo que tuviera en vuelo y carga
 * /sign-in como documento nuevo. De paso se tira el árbol de React y la caché
 * del router, que es justo lo que quieres al cerrar sesión (si no, el Router
 * Cache puede conservar RSC de rutas protegidas renderizado con la sesión ya
 * cerrada).
 *
 * `replace` y no `assign`: la página protegida no debe quedar en el historial.
 */
export async function signOutToSignIn(signOut: SignOut) {
  const leave = () => window.location.replace(SIGN_IN_URL);
  await signOut(leave);
  // Red de seguridad: si el callback no llegara a ejecutarse, salimos igual.
  leave();
}
