// Capa 2 de vigilancia de rendimiento: presupuesto del bundle base.
//
// Mide el "First-Load JS compartido" — los chunks que TODA ruta descarga en la
// primera carga (rootMainFiles + polyfills del build-manifest de Turbopack) —
// y falla si supera el presupuesto. Es el número que más importa: cada usuario
// lo paga en cada página, así que una regresión aquí degrada toda la app.
//
// Por qué solo el baseline compartido y no "First-Load JS por ruta": el build
// de Turbopack (Next 16) no expone un mapa estable de chunks por ruta, y
// reconstruirlo dependería de internals no documentados y frágiles. El baseline
// sí está en un campo estable del manifest.
//
// Uso:
//   node scripts/check-bundle-budget.mjs            # falla si supera el presupuesto
//   node scripts/check-bundle-budget.mjs --update   # imprime y NO falla (para recalibrar)
//
// Requiere un build de producción previo (`next build`), que genera .next/.

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

// Presupuesto en KB (gzip) del bundle base compartido. Súbelo a conciencia
// cuando una dependencia nueva lo justifique; bájalo si logras adelgazarlo.
const BUDGET_KB = 185;

const NEXT_DIR = ".next";
const MANIFEST = join(NEXT_DIR, "build-manifest.json");

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch {
  fail(
    `No se encontró ${MANIFEST}. Ejecuta primero un build de producción:\n` +
      `  npm run build`,
  );
}

// rootMainFiles = bundle base del App Router; polyfillFiles = polyfills que
// también carga todo cliente. Juntos son el suelo de descarga de cada ruta.
const files = [
  ...(manifest.rootMainFiles ?? []),
  ...(manifest.polyfillFiles ?? []),
];

if (files.length === 0) {
  fail(
    "El manifest no contiene rootMainFiles/polyfillFiles. ¿Cambió el formato " +
      "del build de Next/Turbopack? Revisa .next/build-manifest.json.",
  );
}

const rows = [];
let totalGzip = 0;
for (const rel of files) {
  const abs = join(NEXT_DIR, rel);
  let raw;
  try {
    raw = readFileSync(abs);
  } catch {
    fail(`Chunk listado en el manifest pero ausente en disco: ${abs}`);
  }
  const gzip = gzipSync(raw, { level: 9 }).length;
  totalGzip += gzip;
  rows.push({ rel, raw: raw.length, gzip });
}

rows.sort((a, b) => b.gzip - a.gzip);
const kb = (n) => (n / 1024).toFixed(1).padStart(7);

console.log("\nBundle base compartido (First-Load JS de toda ruta)\n");
console.log("   raw KB   gzip KB  chunk");
for (const r of rows) {
  console.log(`  ${kb(r.raw)}  ${kb(r.gzip)}  ${r.rel}`);
}
const totalKb = totalGzip / 1024;
console.log("  " + "-".repeat(50));
console.log(`  ${" ".repeat(7)}  ${kb(totalGzip)}  TOTAL gzip`);
console.log(`\n  Presupuesto: ${BUDGET_KB.toFixed(1)} KB gzip\n`);

const isUpdate = process.argv.includes("--update");
if (isUpdate) {
  console.log(
    `Modo --update: no se aplica el gate. Sugerencia de presupuesto (+10%): ` +
      `${Math.ceil(totalKb * 1.1)} KB\n`,
  );
  process.exit(0);
}

if (totalKb > BUDGET_KB) {
  fail(
    `El bundle base (${totalKb.toFixed(1)} KB) supera el presupuesto ` +
      `(${BUDGET_KB} KB) en ${(totalKb - BUDGET_KB).toFixed(1)} KB.\n` +
      `Investiga qué dependencia creció, o sube BUDGET_KB a conciencia en ` +
      `scripts/check-bundle-budget.mjs si el aumento está justificado.`,
  );
}

console.log(
  `\x1b[32m✔ Bundle base dentro de presupuesto ` +
    `(${totalKb.toFixed(1)} / ${BUDGET_KB} KB gzip)\x1b[0m\n`,
);
