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

    // Las peticiones RSC necesitan `unauthenticatedUrl` explícito. `auth.protect()`
    // solo redirige por su cuenta cuando reconoce la petición como "de página":
    // `Sec-Fetch-Dest: document`, `Accept: text/html` o cabecera `Next-Url` (ver
    // `isPageRequest` en @clerk/nextjs/server/protect). Las RSC que NO llevan
    // `Next-Url` —los prefetch de <Link> y, sobre todo, el `router.refresh()` que
    // Clerk dispara al cerrar sesión— caen en su rama `notFound()` y reciben 404.
    // Con un 404 el router de Next no puede completar la transición, y como la
    // promesa del push de Clerk solo se resuelve al commitear, `signOut()` se
    // queda colgado para siempre: el botón se queda en "Cerrando sesión…" y la
    // sesión no se cierra hasta recargar (la cookie sí se borró en el servidor).
    //
    // Solo se pasa para RSC: en las navegaciones de documento se deja el
    // comportamiento propio de Clerk (`redirectToSignIn()`), que ya respeta
    // NEXT_PUBLIC_CLERK_SIGN_IN_URL y el handshake de las instancias dev.
    if (request.headers.get("RSC") === "1") {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("redirect_url", request.url);
      await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
      return;
    }

    await auth.protect();
  },
  authorizedParties?.length ? { authorizedParties } : undefined,
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
