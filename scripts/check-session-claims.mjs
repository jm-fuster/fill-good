/**
 * Ejecuta las comprobaciones de los datos de usuario del token de sesión
 * (`scripts/session-claims.check.ts`).
 *
 * Mismo envoltorio que `check-rotulos.mjs` (TypeScript con el alias `@/`,
 * empaquetado al vuelo con esbuild), con un cambio: `getSessionUserClaims` y
 * `getAiConsent` llaman a Clerk, así que `@clerk/nextjs/server` se sustituye
 * por un módulo falso que lee los claims y el usuario de `globalThis` y cuenta
 * las llamadas a `currentUser()` (que en la app real son llamadas de red).
 * `server-only` se queda vacío, como fuera de Next. Sin base ni credenciales.
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "node_modules", ".cache", "check-sesion", "bundle.mjs");

const clerkFalso = `
const clerk = (globalThis.__fakeClerk ??= {
  claims: null,
  user: null,
  currentUserCalls: 0,
});
export async function auth() {
  return { userId: "user_x", sessionClaims: clerk.claims };
}
export async function currentUser() {
  clerk.currentUserCalls += 1;
  return clerk.user;
}
`;

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "session-claims.check.ts")],
  outfile: salida,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  alias: { "@": join(raiz, "src") },
  logLevel: "warning",
  plugins: [
    {
      name: "clerk-falso",
      setup(b) {
        b.onResolve({ filter: /^(@clerk\/nextjs\/server|server-only)$/ }, (a) => ({
          path: a.path,
          namespace: "falso",
        }));
        b.onLoad({ filter: /.*/, namespace: "falso" }, (a) => ({
          contents: a.path === "server-only" ? "export {};" : clerkFalso,
          loader: "js",
        }));
      },
    },
  ],
});

try {
  await import(pathToFileURL(salida).href);
} finally {
  await rm(dirname(salida), { recursive: true, force: true });
}
