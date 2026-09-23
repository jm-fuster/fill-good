// Capa 2 de vigilancia de rendimiento: presupuesto del bundle base.
//
// Mide el "First-Load JS compartido" — los chunks que TODA ruta descarga en la
// primera carga (rootMainFiles + polyfills del build-manifest de Turbopack) —
// y falla si supera el presupuesto. Es el número que más importa: cada usuario
// lo paga en cada página, así que una regresión aquí degrada toda la app.
//
// Y además (sep-2026) los LAYOUTS: el JS de entrada de cada layout, que se
// carga en todas las rutas que cuelgan de él ENCIMA del baseline. El
// build-manifest no lo ve —el baseline son los chunks de Next y React, no los
// de la app—, y ahí es donde se colaba lo caro: el registro de iconos (~78 KB
// gz) llegó a todas las pantallas de la app a través de una tarjeta del shell
// y este check siguió en verde. Se lee de `entryJSFiles` en los
// `*_client-reference-manifest.js` de cada ruta, que Turbopack sí genera. No
// es un formato documentado, así que si cambia, el check FALLA diciéndolo en
// vez de medir cero y aprobar. Por ruta no se mide: los layouts son el suelo
// común de grupos enteros de pantallas, que es donde una regresión duele.
//
// Uso:
//   node scripts/check-bundle-budget.mjs            # falla si supera el presupuesto
//   node scripts/check-bundle-budget.mjs --update   # imprime y NO falla (para recalibrar)
//
// Requiere un build de producción previo (`next build`), que genera .next/.

import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

// Presupuesto en KB (gzip) del bundle base compartido. Súbelo a conciencia
// cuando una dependencia nueva lo justifique; bájalo si logras adelgazarlo.
const BUDGET_KB = 185;

// Presupuesto en KB (gzip) del JS de entrada de cada layout, ENCIMA del bundle
// base. Los layouts son acumulativos: el de `(app)` incluye los chunks del
// raíz, así que su cifra es lo que paga cualquier pantalla con sesión además
// del baseline. Mismo criterio que BUDGET_KB: se sube a conciencia.
const LAYOUT_BUDGETS_KB = {
  // Medido el 23-sep-2026 tras diferir los modales del shell: 69,1 / 214,5 /
  // 72,6 KB. Presupuesto = +10%, como el del baseline.
  "src/app/layout": 76,
  "src/app/(app)/layout": 236,
  "src/app/(legal)/layout": 80,
};

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

// ── Layouts ────────────────────────────────────────────────────────────────
function findManifests(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findManifests(abs));
    else if (entry.name.endsWith("_client-reference-manifest.js")) out.push(abs);
  }
  return out;
}

/** layout ("src/app/(app)/layout") → chunks de entrada, de todas las rutas. */
const layoutFiles = new Map();
for (const file of findManifests(join(NEXT_DIR, "server", "app"))) {
  const scope = {};
  try {
    new Function("globalThis", readFileSync(file, "utf8"))(scope);
  } catch {
    continue;
  }
  for (const entry of Object.values(scope.__RSC_MANIFEST ?? {})) {
    for (const [key, chunks] of Object.entries(entry?.entryJSFiles ?? {})) {
      const name = key.replace(/^\[project\]\//, "");
      if (!name.endsWith("/layout") || !Array.isArray(chunks)) continue;
      const set = layoutFiles.get(name) ?? new Set();
      for (const c of chunks) set.add(c.replace(/^\/?_next\//, ""));
      layoutFiles.set(name, set);
    }
  }
}

const baseFiles = new Set(files);
const layoutRows = [...layoutFiles].map(([name, chunks]) => {
  let gzip = 0;
  for (const rel of chunks) {
    if (baseFiles.has(rel)) continue; // ya contado en el baseline
    const abs = join(NEXT_DIR, rel);
    let raw;
    try {
      raw = readFileSync(abs);
    } catch {
      fail(`Chunk del layout ${name} ausente en disco: ${abs}`);
    }
    gzip += gzipSync(raw, { level: 9 }).length;
  }
  return { name, gzip, budget: LAYOUT_BUDGETS_KB[name] };
});
layoutRows.sort((a, b) => a.name.localeCompare(b.name));

console.log("JS de entrada de los layouts (encima del bundle base)\n");
console.log("  gzip KB  presup.  layout");
for (const r of layoutRows) {
  const budget =
    r.budget === undefined ? "      —" : r.budget.toFixed(1).padStart(7);
  console.log(`  ${kb(r.gzip)}  ${budget}  ${r.name}`);
}
console.log("");

const isUpdate = process.argv.includes("--update");
if (isUpdate) {
  console.log(
    `Modo --update: no se aplica el gate. Sugerencia de presupuesto (+10%): ` +
      `${Math.ceil(totalKb * 1.1)} KB`,
  );
  for (const r of layoutRows) {
    console.log(`  ${r.name}: ${Math.ceil((r.gzip / 1024) * 1.1)} KB`);
  }
  console.log("");
  process.exit(0);
}

// Un layout con presupuesto que no aparece es un formato que cambió, no un
// layout que pesa cero: se falla en vez de aprobar sin medir.
for (const name of Object.keys(LAYOUT_BUDGETS_KB)) {
  if (!layoutFiles.has(name)) {
    fail(
      `No se encontró el layout ${name} en los *_client-reference-manifest.js ` +
        `de .next/server/app. ¿Cambió el formato del build de Next/Turbopack, ` +
        `o se movió el layout? Ajusta LAYOUT_BUDGETS_KB.`,
    );
  }
}
const overLayouts = layoutRows.filter(
  (r) => r.budget !== undefined && r.gzip / 1024 > r.budget,
);
if (overLayouts.length > 0) {
  fail(
    overLayouts
      .map(
        (r) =>
          `El layout ${r.name} (${(r.gzip / 1024).toFixed(1)} KB) supera su ` +
          `presupuesto (${r.budget} KB).`,
      )
      .join("\n") +
      `\nMira qué importa un componente del layout (una tarjeta del shell, un ` +
      `modal): lo que solo hace falta al abrir algo va con next/dynamic.`,
  );
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
    `(${totalKb.toFixed(1)} / ${BUDGET_KB} KB gzip)\x1b[0m`,
);
console.log(
  `\x1b[32m✔ Layouts dentro de presupuesto (` +
    layoutRows
      .filter((r) => r.budget !== undefined)
      .map(
        (r) =>
          `${r.name.replace(/^src\/app\//, "")} ` +
          `${(r.gzip / 1024).toFixed(1)} / ${r.budget}`,
      )
      .join(", ") +
    ` KB gzip)\x1b[0m\n`,
);
