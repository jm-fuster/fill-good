/**
 * Ejecuta las comprobaciones de la mezcla de la receta generada con IA
 * (`scripts/recipe-draft.check.ts`).
 *
 * Mismo envoltorio que `check-suggestion-reason.mjs`: las comprobaciones son
 * TypeScript y tiran del alias `@/`, así que Node no puede ejecutarlas tal cual y
 * se empaquetan al vuelo con esbuild (ya es dependencia de desarrollo del repo).
 *
 * `ai-draft.ts` es puro: solo importa `normalizeName`, los topes de `schemas.ts`
 * (zod, sin base de datos) y un TIPO de `supabase/types.ts` —que al ser
 * `import type` se borra al compilar—, así que el paquete no arrastra el cliente
 * de Supabase ni necesita credenciales.
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
  "check-recipe-draft",
  "bundle.mjs",
);

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "recipe-draft.check.ts")],
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
