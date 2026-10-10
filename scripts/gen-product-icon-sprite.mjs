// Deriva del registro de iconos de producto lo que necesita el NAVEGADOR:
//
//   src/lib/product-icons/sprite.svg  un <symbol> por icono, que se pinta con
//                                     <use href="sprite.svg#slug">
//   src/lib/product-icons/slugs.ts    qué slugs existen y su viewBox, para
//                                     validar y pintar sin cargar los dibujos
//
// El registro (`registry.ts`, generado por gen-product-icons.ps1) sigue siendo
// la ÚNICA fuente de verdad, y este script solo lo transcribe: no descarga
// nada ni toca un dibujo. Existe porque el registro entraba en el JS de cada
// pantalla que pinta un icono (~70 KB gz, la mitad del JS propio de /inventario
// y /lista), cuando los dibujos son datos estáticos que el navegador puede
// guardar como un archivo más. gen-product-icons.ps1 lo llama al terminar.
//
// Uso:
//   node scripts/gen-product-icon-sprite.mjs           # escribe los dos archivos
//   node scripts/gen-product-icon-sprite.mjs --check   # falla si no cuadran
//
// El registro se lee como TEXTO, con la misma expresión que usa
// design/figma/gen-icons.mjs: así no hace falta compilar TypeScript.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "src", "lib", "product-icons");
const REGISTRY = join(DIR, "registry.ts");
const SPRITE = join(DIR, "sprite.svg");
const SLUGS = join(DIR, "slugs.ts");

const check = process.argv.includes("--check");

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

// Saltos normalizados: gen-product-icons.ps1 escribe CRLF y git los guarda
// como LF, así que según dónde se mire el mismo registro trae unos u otros.
const lf = (text) => text.replace(/\r\n/g, "\n");
const source = lf(readFileSync(REGISTRY, "utf8"));
const entryLines = source.split("\n").filter((l) => l.startsWith("  '"));
const icons = [];
for (const m of source.matchAll(
  /^ {2}'([a-z0-9-]+)': \{ vb: '([^']+)', body: '(.*)' \},?$/gm,
)) {
  const [, slug, vb, body] = m;
  icons.push({ slug, vb, body: body.replace(/\\'/g, "'") });
}
// Una línea que no case con la expresión sería un icono que desaparece del
// sprite sin avisar: mejor fallar aquí que descubrirlo con un hueco en la lista.
if (icons.length === 0 || icons.length !== entryLines.length) {
  fail(
    `registry.ts tiene ${entryLines.length} entradas y solo se han leído ` +
      `${icons.length}. ¿Cambió el formato que escribe gen-product-icons.ps1?`,
  );
}

// Un <symbol> por línea: así un icono nuevo o retocado se ve en el diff como
// una línea, igual que en el registro. El tamaño de la raíz no pinta nada
// (`<use>` clona el símbolo), pero sin él Next no acepta el archivo como
// importación estática: «SVG source code does not contain width and height or
// viewBox attribute».
const sprite =
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">\n` +
  `<!-- GENERADO - no editar a mano. Sale de registry.ts con scripts/gen-product-icon-sprite.mjs. -->\n` +
  icons
    .map(({ slug, vb, body }) => `<symbol id="${slug}" viewBox="${vb}">${body}</symbol>`)
    .join("\n") +
  `\n</svg>\n`;

const slugs =
  `// GENERADO - no editar a mano. Sale de registry.ts con\n` +
  `// scripts/gen-product-icon-sprite.mjs.\n` +
  `\n` +
  `/**\n` +
  ` * Slugs con dibujo en el registro (y en el sprite), con su viewBox: lo que\n` +
  ` * el navegador necesita para validar un slug y pintar el <svg> igual que el\n` +
  ` * servidor, sin cargar los dibujos.\n` +
  ` */\n` +
  `export const ICON_VIEWBOXES: Readonly<Record<string, string>> = {\n` +
  icons.map(({ slug, vb }) => `  "${slug}": "${vb}",\n`).join("") +
  `};\n`;

if (check) {
  const stale = [
    [SPRITE, sprite],
    [SLUGS, slugs],
  ].filter(([path, expected]) => {
    try {
      return lf(readFileSync(path, "utf8")) !== expected;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    fail(
      `No cuadran con registry.ts: ${stale.map(([p]) => p.split(/[\\/]/).pop()).join(", ")}.\n` +
        `Regenera con: node scripts/gen-product-icon-sprite.mjs`,
    );
  }
  console.log(`Sprite y slugs de iconos al día (${icons.length} iconos).`);
} else {
  writeFileSync(SPRITE, sprite);
  writeFileSync(SLUGS, slugs);
  console.log(`Escritos sprite.svg y slugs.ts (${icons.length} iconos).`);
}
