import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /offline es la página de fallback del service worker: debe ser accesible
// sin sesión (aunque en el caso real de "sin red" el SW la sirve desde caché
// sin llegar siquiera al servidor).
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/offline",
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
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  },
  authorizedParties?.length ? { authorizedParties } : undefined,
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
