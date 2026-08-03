/**
 * Ejecuta las comprobaciones del contexto del menú (`scripts/menu-context.check.ts`).
 *
 * Mismo envoltorio que `check-cooked.mjs`: las comprobaciones son TypeScript y
 * tiran del alias `@/`, así que Node no puede ejecutarlas tal cual y se
 * empaquetan al vuelo con esbuild (ya es dependencia de desarrollo del repo).
 *
 * `prompt-context.ts` es puro (sin I/O ni cliente de Supabase), así que el
 * paquete no necesita base ni credenciales.
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "node_modules", ".cache", "check-menu", "bundle.mjs");

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "menu-context.check.ts")],
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
