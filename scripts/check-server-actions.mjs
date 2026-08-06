/**
 * Comprueba que ningún módulo `"use server"` REEXPORTA nada.
 *
 * Nació de un fallo de producción de agosto de 2026 que tumbó toda la IA de la
 * app durante horas, y que ninguna de las tres puertas de calidad vio:
 *
 *   ReferenceError: RecipeCooking is not defined
 *       at module evaluation (actions.ts)
 *       at module evaluation (actions.js (server actions loader))
 *
 * Lo había causado una sola línea, `export type { RecipeCooking };`, puesta en
 * un módulo de acciones para que el cliente pudiera importar el tipo sin tirar
 * de un módulo `server-only`. Parece inofensiva —un tipo se borra al compilar—
 * pero el CARGADOR de Server Actions de Next trata cada exportación como un
 * valor y genera una referencia a un binding que TypeScript ya había borrado.
 *
 * El daño no se queda en esa línea, y eso es lo que lo hace grave: al fallar la
 * EVALUACIÓN del módulo, mueren todas las acciones que la página tenga en su
 * cargador, no solo la vecina. Como `/menus` importa acciones de recetas, un
 * error en el fichero de recetas dejó sin funcionar también la generación del
 * menú, y el rastro que veía el usuario era un 500 con un `digest` — un hash
 * que no se puede revertir.
 *
 * **Por qué hace falta un script y no basta con lo que ya hay:**
 *  - `tsc` da el código por correcto: reexportar un tipo es legal en TypeScript.
 *  - el lint no mira la interacción con el cargador de Next.
 *  - `next build` compila sin quejarse, porque el módulo no se EVALÚA hasta que
 *    alguien invoca una acción. Un build verde con la app rota.
 *
 * **Qué se prohíbe exactamente, y por qué no todo.** Solo la reexportación SIN
 * `from`. La diferencia se midió en el JavaScript emitido, no se supuso:
 *
 *   · `export type { X };`            → `X` APARECE en `.next/server/chunks/…js`
 *   · `export type { X } from "./m";` → solo aparece en los `.map`
 *
 * Con `from`, el compilador sabe que la reexportación es de tipos y la borra
 * entera. Sin `from`, el nombre viene de un `import` que ya se ha borrado, y lo
 * que queda es una referencia a la nada. Por eso `receipts/actions.ts` lleva
 * años con un `export type { … } from "./schemas"` sin romper nada, y una sola
 * línea sin `from` tumbó la IA de toda la app.
 *
 * La regla práctica: en un fichero `"use server"`, cada exportación es una
 * acción. Los tipos se declaran donde vive el dato (`queries.ts`) y se importan
 * de allí con `import type`, que se borra al compilar y por eso vale también
 * desde el cliente aunque el módulo sea `server-only`. Declarar un tipo en el
 * propio fichero (`export type Estado = { … }`) SÍ vale: desaparece entero al
 * compilar y el cargador no llega a verlo.
 */
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `export { … }` o `export type { … }` SIN `from`. El grupo `[^}]*` cruza saltos
 * de línea, así que también pilla la forma repartida en varias líneas; el
 * lookahead deja pasar las que sí traen origen, que son inofensivas (ver arriba).
 */
const REEXPORTA_SIN_ORIGEN =
  /^[ \t]*export[ \t]+(?:type[ \t]+)?\{[^}]*\}[ \t]*(?!\s*from\b)/gm;

/** `"use server"` en la primera línea con contenido del fichero. */
function esModuloDeAcciones(texto) {
  for (const linea of texto.split("\n")) {
    const l = linea.trim();
    if (l === "" || l.startsWith("//") || l.startsWith("/*") || l.startsWith("*")) {
      continue;
    }
    return l === '"use server";' || l === "'use server';";
  }
  return false;
}

let fallos = 0;
let revisados = 0;

for await (const ruta of glob("src/**/*.ts", { cwd: raiz })) {
  const absoluta = resolve(raiz, ruta);
  const texto = await readFile(absoluta, "utf8");
  if (!esModuloDeAcciones(texto)) continue;
  revisados += 1;

  for (const m of texto.matchAll(REEXPORTA_SIN_ORIGEN)) {
    fallos += 1;
    const linea = texto.slice(0, m.index).split("\n").length;
    console.log(
      `  FALLO ${relative(raiz, absoluta).replace(/\\/g, "/")}:${linea}\n` +
        `        ${m[0].trim().replace(/\s+/g, " ")}\n` +
        `        Un módulo "use server" no puede reexportar sin \`from\`: el\n` +
        `        cargador de Server Actions genera una referencia al nombre, que\n` +
        `        ya se borró con su import, y la evaluación del módulo muere con\n` +
        `        ReferenceError — llevándose TODAS las acciones de las páginas\n` +
        `        que lo carguen, no solo la de al lado. Declara el tipo donde\n` +
        `        vive el dato e impórtalo de allí con \`import type\`.`,
    );
  }
}

console.log(
  fallos === 0
    ? `\nMódulos de acciones (${revisados}): ninguno reexporta. Correcto.\n`
    : `\nMódulos de acciones: ${fallos} reexportación(es) prohibida(s).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
