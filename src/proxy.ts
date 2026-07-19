import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /offline es la página de fallback del service worker: debe ser accesible
// sin sesión (aunque en el caso real de "sin red" el SW la sirve desde caché
// sin llegar siquiera al servidor).
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/offline",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
