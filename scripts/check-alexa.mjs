/**
 * Ejecuta las comprobaciones de la conversación de Alexa
 * (`scripts/alexa-conversation.check.ts`).
 *
 * Hace falta este envoltorio porque las comprobaciones son TypeScript y tiran
 * del alias `@/`, así que Node no puede ejecutarlas tal cual: se empaquetan al
 * vuelo con esbuild, que ya es dependencia de desarrollo del repo.
 *
 * `server-only` se sustituye por un módulo vacío. Ese paquete existe para que
 * Next reviente el build si código de servidor acaba en el cliente; aquí solo
 * estorba, porque estamos ejecutando en Node a propósito.
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "node_modules", ".cache", "check-alexa", "bundle.mjs");

const stubServerOnly = {
  name: "stub-server-only",
  setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({
      path: "server-only",
      namespace: "stub-server-only",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub-server-only" }, () => ({
      contents: "export {};",
    }));
  },
};

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "alexa-conversation.check.ts")],
  outfile: salida,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  alias: { "@": join(raiz, "src") },
  plugins: [stubServerOnly],
  logLevel: "warning",
});

try {
  await import(pathToFileURL(salida).href);
} finally {
  await rm(dirname(salida), { recursive: true, force: true });
}
