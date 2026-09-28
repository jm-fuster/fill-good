// Iconos que usa la app, resueltos contra lo INSTALADO (no contra un kit).
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, extname } from "node:path";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = fileURLToPath(new URL("./data/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const LR = join(ROOT, "node_modules/lucide-react");
const version = JSON.parse(readFileSync(join(LR, "package.json"), "utf8")).version;

// nombre exportado → fichero del icono
const index = readFileSync(join(LR, "dist/esm/lucide-react.mjs"), "utf8");
const exportToFile = {};
for (const m of index.matchAll(/export \{([^}]+)\} from '\.\/icons\/([\w-]+)\.mjs'/g))
  for (const part of m[1].split(",")) {
    const name = part.trim().replace(/^default as /, "");
    exportToFile[name] = m[2];
  }

// imports reales en src/
const walk = (d, a = []) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, a);
    else if ([".ts", ".tsx"].includes(extname(p))) a.push(p);
  }
  return a;
};
const used = new Map(); // fichero → { exports:Set, count }
const unresolved = new Set();
for (const f of walk(join(ROOT, "src"))) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g))
    for (const raw of m[1].split(",")) {
      const n = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (!n || !/^[A-Z]/.test(n) || n === "LucideIcon" || n.endsWith("Props")) continue;
      const file = exportToFile[n];
      if (!file) { unresolved.add(n); continue; }
      const e = used.get(file) ?? { exports: new Set(), count: 0 };
      e.exports.add(n); e.count++; used.set(file, e);
    }
}

// datos del icono → SVG (mismos atributos por defecto que createLucideIcon)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const lucide = [...used].sort((a, b) => a[0].localeCompare(b[0])).map(([file, e]) => {
  const mod = readFileSync(join(LR, "dist/esm/icons", file + ".mjs"), "utf8");
  const dataSrc = mod.match(/const __iconData = (\{[\s\S]*?\n\});/)[1];
  const node = Function("return " + dataSrc)().node;
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${esc(v)}"`).join(" ")}/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return { name: file, exports: [...e.exports].sort(), uses: e.count, svg };
});

// iconos de producto desde el registro generado
const reg = readFileSync(join(ROOT, "src/lib/product-icons/registry.ts"), "utf8");
const product = [];
for (const m of reg.matchAll(/^  '([a-z0-9-]+)': \{ vb: '([^']+)', body: '(.*)' \},?$/gm)) {
  const [, slug, vb, body] = m;
  const [, , w, h] = vb.split(/\s+/).map(Number);
  product.push({ slug, vb, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${body}</svg>` });
}

writeFileSync(join(OUT, "icons-lucide.json"), JSON.stringify(lucide));
writeFileSync(join(OUT, "icons-product.json"), JSON.stringify(product));
console.log({ version, lucideGlyphs: lucide.length, importedNames: [...used.values()].reduce((s, e) => s + e.exports.size, 0), aliasesMerged: lucide.filter((l) => l.exports.length > 1).map((l) => l.exports.join("=")), unresolved: [...unresolved], product: product.length, productBytes: JSON.stringify(product).length, lucideBytes: JSON.stringify(lucide).length });
