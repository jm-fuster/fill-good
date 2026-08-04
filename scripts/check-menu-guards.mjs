/**
 * Ejecuta las comprobaciones de las guardas de las acciones del menú
 * (`scripts/menu-entry-guards.check.ts`).
 *
 * Mismo montaje que `check-alexa.mjs` —esbuild al vuelo porque el check es
 * TypeScript y tira del alias `@/`—, con una diferencia importante: aquí lo que
 * se ejecuta son Server Actions, no funciones puras, así que hay que sustituir
 * las cuatro puertas al mundo que abren al importarse. Cada sustituto es el
 * mínimo para que el código REAL de la action corra:
 *
 *   - `@/lib/supabase/server` → el cliente falso que monta el check, leído de un
 *     global para que cada caso pueda poner el suyo.
 *   - `@clerk/nextjs/server`  → un usuario fijo con el consentimiento de IA
 *     puesto, así `getCurrentHousehold` y `getAiConsent` corren de verdad contra
 *     el cliente falso en vez de quedar también sustituidas.
 *   - `next/cache` y `next/headers` → `revalidatePath` no tiene a quién avisar y
 *     no hay cookies de petición; sin hogar en la cookie, `getCurrentHousehold`
 *     coge el más antiguo, que es el único que hay.
 *
 * Los sustitutos van como módulos virtuales y no como ficheros en `scripts/`
 * para que se lean aquí, junto al porqué de cada uno.
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(
  raiz,
  "node_modules",
  ".cache",
  "check-menu-guards",
  "bundle.mjs",
);

/**
 * Módulos virtuales. `onResolve` de un plugin gana a la resolución de esbuild
 * (incluido el `alias` de `@/`), así que basta con filtrar el especificador tal
 * como está escrito en el import.
 */
const SUSTITUTOS = {
  "server-only": "export {};",
  "next/cache": "export function revalidatePath() {}\nexport function revalidateTag() {}",
  "next/headers":
    "export async function cookies() {\n  return { get: () => undefined };\n}",
  "@clerk/nextjs/server": `
    export async function auth() {
      return { userId: globalThis.__checkUserId ?? "u1" };
    }
    export async function currentUser() {
      // Versión alta a propósito: \`getAiConsent\` pide >= AI_CONSENT_VERSION, y
      // así subir la versión del aviso no rompe este check por sorpresa.
      return { publicMetadata: { aiConsent: { version: 9999, at: "2026-01-01T00:00:00Z" } } };
    }
  `,
  "@/lib/supabase/server": `
    export function createServerSupabaseClient() {
      if (!globalThis.__fakeSupabase) {
        throw new Error("El caso no ha puesto globalThis.__fakeSupabase");
      }
      return globalThis.__fakeSupabase;
    }
  `,
};

const stubs = {
  name: "stubs",
  setup(build) {
    // Solo las claves: el contenido lo busca `onLoad` por el especificador.
    for (const especificador of Object.keys(SUSTITUTOS)) {
      const filtro = new RegExp(
        `^${especificador.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}$`,
      );
      build.onResolve({ filter: filtro }, (args) => ({
        path: args.path,
        namespace: "stubs",
      }));
    }
    build.onLoad({ filter: /.*/, namespace: "stubs" }, (args) => ({
      contents: SUSTITUTOS[args.path],
      loader: "js",
    }));
  },
};

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "menu-entry-guards.check.ts")],
  outfile: salida,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  alias: { "@": join(raiz, "src") },
  plugins: [stubs],
  logLevel: "warning",
  /*
    Las actions del menú importan el SDK de IA (`generateObject`), y por ahí entra
    en el bundle alguna dependencia CommonJS que hace `require("path")` al
    cargarse. En un bundle ESM eso revienta («Dynamic require of "path" is not
    supported») antes de ejecutar una sola comprobación, así que se le da un
    `require` de verdad. No hace falta en `check:alexa`: ese no toca la IA.
  */
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
});

try {
  await import(pathToFileURL(salida).href);
} finally {
  await rm(dirname(salida), { recursive: true, force: true });
}
