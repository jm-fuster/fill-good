import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
    // Se pasa SIN CONDICIÓN, y en concreto NO condicionado a la cabecera `RSC`:
    // Next se la queda antes de que corra el middleware, así que aquí siempre
    // vale null (medido en local y en producción: al middleware solo le llegan
    // accept, host, user-agent y las x-forwarded-*/x-vercel-*). Cualquier rama
    // que dependiera de ella sería código muerto.
    //
    // No hay regresión en las navegaciones de documento: el handshake de Clerk
    // ocurre antes de este handler y lo corta en seco cuando aplica, así que un
    // token caducado pero renovable sigue renovándose. `unauthenticatedUrl` solo
    // entra cuando Clerk ya ha concluido que no hay sesión.
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
