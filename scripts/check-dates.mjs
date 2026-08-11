/**
 * Ejecuta las comprobaciones del calendario (`scripts/dates.check.ts`).
 *
 * Mismo envoltorio que `check-cooking-flow.mjs` —las comprobaciones son
 * TypeScript y tiran del alias `@/`, así que se empaquetan al vuelo con
 * esbuild— con una diferencia que es el motivo de que este check exista: el
 * paquete se ejecuta VARIAS VECES, cada una con una zona horaria distinta en el
 * proceso.
 *
 * Esa es la comprobación de verdad. La regla que se defiende es «la app decide
 * con el calendario español se ejecute donde se ejecute», y su forma de
 * romperse es que alguien deje hablar al reloj del proceso (un `new Date()` en
 * lugar de las funciones de `lib/dates.ts`). Con una sola tanda eso no se ve:
 * en un portátil español todo pasa. Con tres, la de UTC —que es como corre
 * Vercel— y la de Nueva York dejan de coincidir con la de Madrid y el check
 * cae.
 *
 * `dates.ts` no importa nada (ni React, ni Supabase, ni credenciales), así que
 * el paquete no necesita entorno de ningún tipo.
 */
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "node_modules", ".cache", "check-dates", "bundle.mjs");

/**
 * Las tres zonas dicen cosas distintas a la vez: UTC es el servidor de Vercel,
 * Madrid es el móvil del hogar y Nueva York es el mismo hogar de viaje (y, de
 * paso, la única de las tres que va por DETRÁS de UTC, que es donde se esconden
 * los errores de signo).
 */
const ZONAS = ["UTC", "Europe/Madrid", "America/New_York"];

await mkdir(dirname(salida), { recursive: true });
await build({
  entryPoints: [join(raiz, "scripts", "dates.check.ts")],
  outfile: salida,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  alias: { "@": join(raiz, "src") },
  logLevel: "warning",
});

function ejecutar(tz) {
  return new Promise((resolveRun) => {
    const hijo = spawn(
      process.execPath,
      [pathToFileURL(salida).href.replace("file:///", "")],
      { env: { ...process.env, TZ: tz }, stdio: "inherit" },
    );
    hijo.on("close", (code) => resolveRun(code ?? 1));
  });
}

let fallos = 0;
try {
  for (const tz of ZONAS) {
    const code = await ejecutar(tz);
    if (code !== 0) fallos += 1;
  }
} finally {
  await rm(dirname(salida), { recursive: true, force: true });
}

if (fallos > 0) {
  console.log(
    `El calendario NO es el mismo en todas las zonas (${fallos} de ${ZONAS.length} tandas con fallos).`,
  );
  process.exit(1);
}
console.log(
  `El calendario es el mismo en las ${ZONAS.length} zonas probadas (${ZONAS.join(", ")}).\n`,
);
