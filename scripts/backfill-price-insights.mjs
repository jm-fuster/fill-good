// Backfill de las señales de precio materializadas (L15 f2/f3).
//
// Puebla products.inferred_chain y products.savings_tip para TODO el catálogo
// con histórico, usando EXACTAMENTE la misma lógica que
// src/features/prices/materialize.ts. Para no duplicar reglas, este script
// transpila con esbuild (ya es dependencia) los módulos neutros de inferencia
// y los importa en caliente — la fuente de verdad sigue siendo el TS de la app.
//
// Se ejecuta UNA vez tras aplicar la migración 20260723150000 para que las
// columnas queden pobladas desde el primer despliegue. Si no se ejecuta, las
// columnas quedan null (= sin pista) y reaparecen al confirmar el próximo ticket.
//
// Requisitos de entorno (en .env.local o en el entorno):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (nunca commitear; solo servidor)
//
// Uso:
//   node --env-file=.env.local scripts/backfill-price-insights.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(
      `Falta la variable de entorno ${name}. Cárgala desde .env.local:\n` +
        `  node --env-file=.env.local scripts/backfill-price-insights.mjs`,
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

// Importa las funciones neutras de la app (source of truth) transpilando en
// caliente con esbuild, sin duplicar la lógica en este script.
async function loadComputeFns() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export { computeInferredChains } from "./src/features/prices/infer-chain.ts";
        export { computeChainSavings } from "./src/features/prices/chain-savings.ts";
      `,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const code = result.outputFiles[0].text;
  const mod = await import(
    "data:text/javascript," + encodeURIComponent(code)
  );
  return mod;
}

async function main() {
  loadEnvFile();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const { computeInferredChains, computeChainSavings } = await loadComputeFns();

  // Service role: sin RLS, así que iteramos hogar por hogar explícitamente.
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: households, error: hErr } = await supabase
    .from("households")
    .select("id");
  if (hErr) throw hErr;

  let totalUpdated = 0;
  for (const household of households ?? []) {
    const [{ data: rows, error: riErr }, { data: products, error: pErr }] =
      await Promise.all([
        supabase
          .from("receipt_items")
          .select("product_id, total_price, quantity, store_chain")
          .eq("household_id", household.id)
          .not("product_id", "is", null)
          .not("total_price", "is", null)
          .not("store_chain", "is", null),
        supabase
          .from("products")
          .select("id, preferred_chain")
          .eq("household_id", household.id),
      ]);
    if (riErr) throw riErr;
    if (pErr) throw pErr;

    const manual = new Map((products ?? []).map((p) => [p.id, p.preferred_chain]));
    const inferred = computeInferredChains(rows ?? []);

    const pointsByProduct = new Map();
    for (const r of rows ?? []) {
      if (!r.product_id || r.total_price === null || !r.store_chain) continue;
      const qty = Number(r.quantity) || 1;
      const point = {
        unitPrice: Number(r.total_price) / qty,
        storeChain: r.store_chain,
      };
      const arr = pointsByProduct.get(r.product_id);
      if (arr) arr.push(point);
      else pointsByProduct.set(r.product_id, [point]);
    }

    // Solo tocamos productos con histórico (los demás quedan null, que es su
    // estado por defecto correcto: sin señal).
    const withHistory = new Set(pointsByProduct.keys());
    for (const productId of withHistory) {
      const inferredChain = inferred.get(productId) ?? null;
      const effective = manual.get(productId) ?? inferredChain ?? null;
      let savingsTip = null;
      const points = pointsByProduct.get(productId);
      if (effective && points) savingsTip = computeChainSavings(points, effective);

      const { error: uErr } = await supabase
        .from("products")
        .update({ inferred_chain: inferredChain, savings_tip: savingsTip })
        .eq("id", productId);
      if (uErr) throw uErr;
      totalUpdated += 1;
    }
    console.log(
      `Hogar ${household.id}: ${withHistory.size} productos con histórico actualizados.`,
    );
  }

  console.log(`\nListo. ${totalUpdated} productos rematerializados.`);
}

main().catch((err) => {
  console.error("Backfill falló:", err);
  process.exit(1);
});
