import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// /offline es la página de fallback del service worker: debe ser accesible
// sin sesión (aunque en el caso real de "sin red" el SW la sirve desde caché
// sin llegar siquiera al servidor).
const isPublicRoute = createRouteMatcher([
  // La raíz es la landing pública (Home bifurca: con sesión redirige a la app).
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/offline",
  // Textos legales: públicos por definición (enlazados desde la landing).
  "/privacidad",
  "/terminos",
  // El cron de caducidades lo llama Vercel Cron con `Authorization: Bearer
  // CRON_SECRET`, no con sesión de Clerk: sin esto, auth.protect() lo bloquearía
  // antes de su propia comprobación. La ruta valida el secreto por su cuenta.
  "/api/push/caducidades",
]);

// authorizedParties refuerza la validación del token de Clerk frente a reuso
// desde otros orígenes. Opt-in por env (orígenes separados por comas) para no
// romper nada si no está configurado; define tu dominio de producción.
const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export default clerkMiddleware(
  async (auth, request) => {
    // ⚠️ TEMPORAL — diagnóstico, se elimina en el commit siguiente.
    // Sirve para saber qué cabeceras ve el MIDDLEWARE (no el route handler) en
    // producción: la hipótesis a descartar es que no le llegue `RSC`. Solo
    // refleja las cabeceras de quien llama, y las sensibles se reportan por
    // longitud, nunca por valor.
    if (request.nextUrl.pathname === "/__fg-debug") {
      const headers: Record<string, string> = {};
      for (const [key, value] of request.headers.entries()) {
        headers[key] = /cookie|authorization/i.test(key)
          ? `[${value.length} chars]`
          : value;
      }
      return NextResponse.json({
        rscVisto: request.headers.get("RSC"),
        headers,
      });
    }

    if (isPublicRoute(request)) return;

    // `auth.protect()` solo redirige por su cuenta cuando reconoce la petición
    // como "de página": `Sec-Fetch-Dest: document`, `Accept: text/html` o
    // cabecera `Next-Url` (ver `isPageRequest` en @clerk/nextjs/server/protect).
    // Las peticiones RSC que NO llevan `Next-Url` caen en su rama `notFound()` y
    // reciben 404 — entre ellas el `router.refresh()` que Clerk dispara al
    // cerrar sesión. Con un 404 el router de Next no puede completar la
    // transición, y como la promesa del push de Clerk solo se resuelve al
    // commitear, `signOut()` no resuelve nunca: el botón se queda en "Cerrando
    // sesión…" y la sesión no se cierra hasta recargar la página.
    //
    // `unauthenticatedUrl` se pasa SIEMPRE, sin condicionarlo a la cabecera
    // `RSC`: en producción la versión condicionada no llegó a dispararse (la
    // petición seguía devolviendo 404 con el `notFound()` de Clerk), y no está
    // confirmado que el middleware vea esa cabecera. Sin condición no depende
    // de ello. Coste: las navegaciones de documento reciben un 307 plano a
    // /sign-in en vez de pasar por el `redirectToSignIn()` de Clerk.
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect_url", request.url);
    await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
  },
  authorizedParties?.length ? { authorizedParties } : undefined,
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
