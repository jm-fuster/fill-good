/**
 * Ejecuta las comprobaciones del repaso semanal de despensa
 * (`scripts/pantry-review.check.ts`).
 *
 * Mismo envoltorio que `check-suggestion-reason.mjs`: las comprobaciones son
 * TypeScript y tiran del alias `@/`, así que Node no puede ejecutarlas tal cual y
 * se empaquetan al vuelo con esbuild (ya es dependencia de desarrollo del repo).
 *
 * `pantry-review.ts` es puro y de sus dependencias solo importa TIPOS
 * (`LocationType`, `UnitType`): al ser `import type` se borran al compilar, así
 * que el paquete no arrastra el cliente de Supabase ni necesita credenciales.
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
  "check-pantry-review",
  "bundle.mjs",
);

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "pantry-review.check.ts")],
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
