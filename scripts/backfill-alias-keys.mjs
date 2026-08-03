// Backfill de los nombres aprendidos: recorta el peso y el importe que se
// colaron dentro de `product_aliases`.
//
// El PROBLEMA que arregla: hasta ahora se aprendía como nombre del producto la
// línea impresa TAL CUAL ("CHULETA AGUJA DUROC ELPOZO A 2,93 €"), y el importe
// forma parte de la clave de unicidad (`alias_normalized`). Medido sobre los
// datos reales antes de este arreglo: 119 de 125 nombres aprendidos llevaban un
// número dentro, así que no podían volver a coincidir nunca —la vía rápida de
// `matchLineExact` quedaba muerta— y 107 de 123 compras repetidas disparaban el
// aviso de «en este supermercado ya lo llamabas de otra forma» proponiendo
// BORRAR el nombre bueno.
//
// Qué hace, hogar por hogar:
//   1. Recalcula el rótulo y la clave de cada nombre con `cleanReceiptLabel` /
//      `aliasKeyFor` de src/lib/receipt-label.ts (la MISMA función que usa la
//      app: aquí se importa transpilando en caliente, no se reimplementa).
//   2. Los nombres que colapsan en la misma clave se funden en uno: sobrevive el
//      avistamiento más reciente (misma regla que el upsert de la app, donde la
//      última confirmación manda) y hereda la fecha más nueva y el silencio del
//      aviso si alguno lo tenía.
//   3. Borra los perdidos y actualiza los supervivientes.
//
// Por qué NO es una migración SQL: la clave se calcula en TypeScript
// (`normalizeName` + el recorte) y reimplementar eso en SQL abriría una
// divergencia silenciosa en la unicidad de aliases — el mismo motivo por el que
// la migración 20260728180000 repuntó las cadenas por igualdad literal en vez de
// normalizar en SQL. Si la clave que escribe el backfill no es EXACTAMENTE la que
// calcula la app, el nombre guardado no es el que se busca.
//
// Es idempotente: pasarlo dos veces no cambia nada la segunda vez.
//
// Requisitos de entorno (en .env.local o en el entorno):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (nunca commitear; solo servidor)
//
// Uso:
//   node scripts/backfill-alias-keys.mjs            → solo informa (nada se toca)
//   node scripts/backfill-alias-keys.mjs --apply    → escribe
//
// Con `--apply` guarda ANTES un volcado de las filas tal como estaban (fuera del
// repo, ruta impresa al final) para poder deshacerlo: recortar es reversible,
// fundir dos filas en una no lo es sin ese volcado.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import * as esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(
      `Falta la variable de entorno ${name}. Cárgala desde .env.local:\n` +
        `  node --env-file=.env.local scripts/backfill-alias-keys.mjs`,
    );
    process.exit(1);
  }
  return v;
}

// Fallback manual de .env.local por si node no soporta --env-file en esta versión.
function loadEnvFile() {
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Sin .env.local: se usan las variables ya presentes en el entorno.
  }
}

// Importa el recorte de la app (source of truth) transpilando en caliente con
// esbuild, sin duplicar las reglas en este script.
async function loadLabelFns() {
  const result = await esbuild.build({
    stdin: {
      contents: `export { cleanReceiptLabel, aliasKeyFor } from "./src/lib/receipt-label.ts";`,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    alias: { "@": join(ROOT, "src") },
  });
  return import(
    "data:text/javascript," + encodeURIComponent(result.outputFiles[0].text)
  );
}

/** El avistamiento más reciente gana: nulos al final, y a igualdad, el más nuevo. */
function masReciente(a, b) {
  const fa = a.last_seen_at ?? a.created_at ?? "";
  const fb = b.last_seen_at ?? b.created_at ?? "";
  if (fa !== fb) return fa > fb ? a : b;
  return (a.created_at ?? "") >= (b.created_at ?? "") ? a : b;
}

async function main() {
  loadEnvFile();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const { cleanReceiptLabel, aliasKeyFor } = await loadLabelFns();

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  console.log(
    APPLY
      ? "Modo ESCRITURA (--apply): se van a modificar y borrar filas.\n"
      : "Modo informe (sin --apply): nada se toca.\n",
  );

  // Service role: sin RLS, así que iteramos hogar por hogar explícitamente (la
  // unicidad de aliases es POR hogar y las fusiones no deben cruzarse).
  const { data: households, error: hErr } = await supabase
    .from("households")
    .select("id, name");
  if (hErr) throw hErr;

  let totYaLimpios = 0;
  let totActualizados = 0;
  let totBorrados = 0;
  let totConflictos = 0;
  let rutaVolcado = null;

  // Volcado previo: lo que se funde no se puede reconstruir a partir del
  // resultado, así que se guarda el estado completo antes de tocar nada.
  if (APPLY) {
    const { data: todos, error: dumpErr } = await supabase
      .from("product_aliases")
      .select("*");
    if (dumpErr) throw dumpErr;
    rutaVolcado = join(tmpdir(), `fillgood-aliases-antes-${Date.now()}.json`);
    writeFileSync(rutaVolcado, JSON.stringify(todos ?? [], null, 2), "utf8");
    console.log(`Volcado previo (${(todos ?? []).length} filas): ${rutaVolcado}\n`);
  }

  for (const household of households ?? []) {
    const [{ data: aliases, error: aErr }, { data: productos }] = await Promise.all([
      supabase
        .from("product_aliases")
        .select(
          "id, product_id, alias, alias_normalized, store_chain, last_seen_at, rename_dismissed_at, created_at",
        )
        .eq("household_id", household.id),
      // Solo para que el informe de conflictos diga nombres y no uuids.
      supabase.from("products").select("id, name").eq("household_id", household.id),
    ]);
    if (aErr) throw aErr;
    if (!aliases || aliases.length === 0) continue;
    const nombreProducto = new Map((productos ?? []).map((p) => [p.id, p.name]));

    // Agrupar por la clave NUEVA. Las filas sin texto no se tocan: no hay nada
    // que recortar y borrarlas no arregla nada.
    const grupos = new Map();
    for (const row of aliases) {
      if (!row.alias || !row.alias.trim()) continue;
      const clave = aliasKeyFor(row.alias);
      if (!clave) continue;
      const g = grupos.get(clave);
      if (g) g.push(row);
      else grupos.set(clave, [row]);
    }

    const aBorrar = [];
    const aActualizar = [];
    let yaLimpios = 0;

    for (const [clave, filas] of grupos) {
      const ganador = filas.reduce(masReciente);
      const rotulo = cleanReceiptLabel(ganador.alias);

      // Herencias del grupo: la fecha más nueva y el silencio del aviso si
      // alguna de las filas fundidas lo tenía (decir "este nombre es legítimo"
      // no debería deshacerse porque se hayan fundido dos filas).
      const ultimaFecha = filas
        .map((f) => f.last_seen_at)
        .filter(Boolean)
        .sort()
        .at(-1);
      const silenciado = filas
        .map((f) => f.rename_dismissed_at)
        .filter(Boolean)
        .sort()
        .at(-1);

      const perdedores = filas.filter((f) => f.id !== ganador.id);
      for (const p of perdedores) aBorrar.push(p);

      // Fundir nombres de PRODUCTOS distintos es el único caso en que esto
      // cambia a qué producto resuelve un nombre: se avisa siempre.
      const productosDelGrupo = new Set(filas.map((f) => f.product_id));
      if (productosDelGrupo.size > 1) {
        totConflictos += 1;
        console.log(
          `  ⚠ «${clave}» lo reclaman ${productosDelGrupo.size} productos distintos ` +
            `(catálogo duplicado): el nombre se queda con «${nombreProducto.get(ganador.product_id) ?? ganador.product_id}», ` +
            `el más reciente. Fundir los productos es aparte, desde la app.`,
        );
        for (const f of filas) {
          console.log(
            `      ${nombreProducto.get(f.product_id) ?? f.product_id}  ←  ${JSON.stringify(f.alias)}`,
          );
        }
      }

      const cambia =
        ganador.alias_normalized !== clave ||
        ganador.alias !== rotulo ||
        (ultimaFecha ?? null) !== (ganador.last_seen_at ?? null) ||
        (silenciado ?? null) !== (ganador.rename_dismissed_at ?? null);
      if (cambia) {
        aActualizar.push({
          id: ganador.id,
          alias: rotulo,
          alias_normalized: clave,
          last_seen_at: ultimaFecha ?? null,
          rename_dismissed_at: silenciado ?? null,
          antes: ganador.alias,
        });
      } else {
        yaLimpios += 1;
      }
    }

    console.log(
      `Hogar ${household.name ?? household.id}: ${aliases.length} nombres · ` +
        `${aActualizar.length} a recortar · ${aBorrar.length} a fundir · ${yaLimpios} ya limpios`,
    );
    // En el informe solo interesa lo que cambia de TEXTO; los que solo heredan
    // la fecha del grupo fundido no dicen nada al leerlos.
    const conRecorte = aActualizar.filter((u) => u.antes !== u.alias);
    for (const u of conRecorte.slice(0, APPLY ? 0 : 12)) {
      console.log(`    ${JSON.stringify(u.antes)}\n      → ${JSON.stringify(u.alias)}`);
    }
    if (!APPLY && conRecorte.length > 12) {
      console.log(`    … y ${conRecorte.length - 12} más`);
    }

    if (APPLY) {
      // Primero los borrados: si no, la clave nueva de un superviviente puede
      // chocar con la clave VIEJA de un perdedor y el update fallaría por la
      // restricción unique(household_id, alias_normalized).
      for (const b of aBorrar) {
        const { error } = await supabase
          .from("product_aliases")
          .delete()
          .eq("id", b.id)
          .eq("household_id", household.id);
        if (error) throw error;
      }
      for (const u of aActualizar) {
        const { error } = await supabase
          .from("product_aliases")
          .update({
            alias: u.alias,
            alias_normalized: u.alias_normalized,
            last_seen_at: u.last_seen_at,
            rename_dismissed_at: u.rename_dismissed_at,
          })
          .eq("id", u.id)
          .eq("household_id", household.id);
        if (error) throw error;
      }
    }

    totYaLimpios += yaLimpios;
    totActualizados += aActualizar.length;
    totBorrados += aBorrar.length;
  }

  console.log(
    `\n${APPLY ? "Hecho" : "Informe"}: ${totActualizados} nombres recortados, ` +
      `${totBorrados} fundidos, ${totYaLimpios} ya estaban limpios` +
      (totConflictos ? `, ${totConflictos} con conflicto entre productos` : "") +
      ".",
  );
  if (!APPLY) {
    console.log("Nada se ha escrito. Repite con --apply para aplicarlo.");
  } else if (rutaVolcado) {
    console.log(`Estado anterior guardado en ${rutaVolcado}`);
  }
}

main().catch((err) => {
  console.error("Backfill falló:", err);
  process.exit(1);
});
