// Guardarraíl de cumplimiento: impide publicar sin identificar al responsable
// del tratamiento.
//
// Solo son OBLIGATORIOS `name` y `email` (art. 13.1.a RGPD: identidad del
// responsable + un medio de contacto). `taxId` y `address` son opcionales
// —la LSSI art. 10 solo los exige a servicios con actividad económica— y pueden
// quedar en "" (no se muestran); por eso este check NO los comprueba.
//
// Si `name` o `email` siguen siendo el placeholder de plantilla
// («[email de contacto]», etc.) o están vacíos, la web pública quedaría sin
// responsable identificado y sin buzón de derechos. Este check lo detecta.
//
// Comportamiento:
//   - En producción de Vercel (VERCEL_ENV=production) o con --strict: FALLA
//     (exit 1) → el despliegue público no sale con placeholders.
//   - En preview/local: solo advierte (exit 0) → no entorpece el desarrollo.
//
// Uso:
//   node scripts/check-legal-config.mjs            # avisa o falla según entorno
//   node scripts/check-legal-config.mjs --strict   # falla siempre si hay placeholders

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_PATH = join("src", "app", "(legal)", "legal-config.ts");
// Solo los campos obligatorios del art. 13.1.a RGPD; taxId/address son opcionales.
const REQUIRED_FIELDS = ["name", "email"];

const strict =
  process.argv.includes("--strict") || process.env.VERCEL_ENV === "production";

function red(msg) {
  return `\x1b[31m${msg}\x1b[0m`;
}
function yellow(msg) {
  return `\x1b[33m${msg}\x1b[0m`;
}
function green(msg) {
  return `\x1b[32m${msg}\x1b[0m`;
}

let source;
try {
  source = readFileSync(CONFIG_PATH, "utf8");
} catch {
  console.error(red(`✖ No se encontró ${CONFIG_PATH}.`));
  process.exit(1);
}

// Extrae los valores de cadena de cada campo requerido de LEGAL_OWNER. Un valor
// que empieza por "[" es un placeholder de plantilla sin rellenar.
const pending = [];
for (const field of REQUIRED_FIELDS) {
  const match = source.match(new RegExp(`${field}\\s*:\\s*"([^"]*)"`));
  if (!match) {
    pending.push(`${field} (no se pudo leer el valor)`);
    continue;
  }
  const value = match[1].trim();
  if (value.length === 0 || value.startsWith("[")) {
    pending.push(`${field} = "${match[1]}"`);
  }
}

if (pending.length === 0) {
  console.log(green("✔ Datos del responsable del tratamiento completos."));
  process.exit(0);
}

const header = `Datos del responsable (LEGAL_OWNER) sin rellenar en ${CONFIG_PATH}:`;
const list = pending.map((p) => `    - ${p}`).join("\n");
const hint =
  "  Rellena LEGAL_OWNER con los datos reales del titular antes de publicar\n" +
  "  (art. 13.1.a RGPD, art. 10 LSSI).";

if (strict) {
  console.error(red(`✖ ${header}`));
  console.error(red(list));
  console.error(red(hint));
  process.exit(1);
}

console.warn(yellow(`⚠ ${header}`));
console.warn(yellow(list));
console.warn(yellow(hint));
console.warn(
  yellow("  (Aviso en preview/local; en producción de Vercel este check falla.)"),
);
process.exit(0);
