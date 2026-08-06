/**
 * Ejecuta las comprobaciones del modo cocinado (`scripts/cooking-flow.check.ts`).
 *
 * Mismo envoltorio que `check-recipe-draft.mjs`: las comprobaciones son
 * TypeScript y tiran del alias `@/`, así que Node no puede ejecutarlas tal cual
 * y se empaquetan al vuelo con esbuild (ya es dependencia de desarrollo).
 *
 * `cooking-flow.ts` no importa nada —ni React, ni Supabase, ni la hora del
 * sistema—, así que el paquete no arrastra credenciales ni necesita entorno.
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
  "check-cooking-flow",
  "bundle.mjs",
);

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "cooking-flow.check.ts")],
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
