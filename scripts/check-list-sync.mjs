/**
 * Ejecuta las comprobaciones de la sincronización de la lista de la compra
 * (`scripts/list-sync.check.ts`).
 *
 * Mismo envoltorio que `check-alexa.mjs`: las comprobaciones son TypeScript y
 * tiran del alias `@/`, así que Node no puede ejecutarlas tal cual y se
 * empaquetan al vuelo con esbuild (ya es dependencia de desarrollo del repo).
 *
 * `list-sync.ts` lleva la directiva "use client" y importa hooks de React para
 * el envoltorio del agrupador de curas. Aquí solo se llaman las funciones puras,
 * así que React se empaqueta y no se toca: no hace falta ningún renderer.
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
  "check-list-sync",
  "bundle.mjs",
);

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "list-sync.check.ts")],
  outfile: salida,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  alias: { "@": join(raiz, "src") },
  logLevel: "warning",
});

try {
  await import(pathToFileURL(salida).href);
} finally {
  await rm(dirname(salida), { recursive: true, force: true });
}
