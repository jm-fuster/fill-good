/**
 * Ejecuta la comparación de modelos del generador de menús
 * (`scripts/menu-models.compare.ts`). Lo lanza `npm run compare:menu`.
 *
 * Mismo envoltorio que `check-menu.mjs`: la comparación es TypeScript y tira del
 * alias `@/`, así que se empaqueta al vuelo con esbuild. Dos diferencias con los
 * `check:*`:
 *
 *   · Necesita `GOOGLE_GENERATIVE_AI_API_KEY` en `.env.local` y GASTA cuota del
 *     free tier: son RUNS × modelos llamadas de verdad. No lo metas en CI ni en
 *     `build:check`.
 *   · Escribe informe, prompt y respuestas en `node_modules/.cache/compare-menu`,
 *     fuera del árbol versionado, y la ruta se imprime al acabar.
 *
 * Uso:
 *   npm run compare:menu                       # 3 generaciones por modelo
 *   RUNS=1 npm run compare:menu                # una pasada rápida
 *   DRY=1 npm run compare:menu                 # solo el contexto, sin llamadas
 *   SKIP_RULE=1 npm run compare:menu           # con regla de hueco cerrado
 *   COMPARE_MODELS=gemini-3.5-flash,gemini-3.6-flash npm run compare:menu
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(raiz, "node_modules", ".cache");
const salida = join(cache, "compare-menu-bundle", "bundle.mjs");
const informes = join(cache, "compare-menu");

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "menu-models.compare.ts")],
  outfile: salida,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  alias: {
    "@": join(raiz, "src"),
    // El pack de recetas abre con `import "server-only"`, que revienta fuera de
    // Next: aquí solo se lee, así que se apunta a un módulo vacío.
    "server-only": join(raiz, "scripts", "server-only.shim.js"),
  },
  // El SDK de IA y zod se dejan fuera del paquete: el bundle vive dentro de
  // node_modules, así que Node los resuelve, y así no hay dos copias de zod
  // (`generateObject` valida el schema por identidad de instancia).
  external: ["ai", "@ai-sdk/google", "zod"],
  logLevel: "warning",
});

process.env.COMPARE_ROOT = raiz;
process.env.COMPARE_OUT = process.env.COMPARE_OUT ?? informes;

try {
  await import(pathToFileURL(salida).href);
} finally {
  await rm(dirname(salida), { recursive: true, force: true });
}
