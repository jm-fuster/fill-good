// Inventario de solo lectura para planificar el archivo de Figma.
// 1) Tokens de color de globals.css (:root y .dark) -> sRGB + comprobación de gama
// 2) Iconos de lucide-react realmente importados
// 3) Uso real de la escala tipográfica, pesos, sombras y radios
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, extname } from "node:path";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

function block(selector) {
  // primer bloque que empieza por el selector a principio de línea (no el de @media print)
  const re = new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)^\\}`, "m");
  const m = css.match(re);
  return m ? m[1] : "";
}

function parseTokens(body) {
  const out = {};
  const re = /--([\w-]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  return out;
}

function oklchToSrgb(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const eps = 1e-4;
  const inGamut = lin.every((v) => v >= -eps && v <= 1 + eps);
  const gam = lin.map((v) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  });
  return { lin: lin.map((v) => Math.min(1, Math.max(0, v))), rgb: gam, inGamut, rawLin: lin };
}

const hex = (rgb) =>
  "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");

function parseOklch(v) {
  const m = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%?)?\s*\)$/);
  if (!m) return null;
  return { L: +m[1], C: +m[2], H: +m[3], A: m[4] ? +m[4] / 100 : 1 };
}

function relLum(lin) {
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

const themes = { light: parseTokens(block(":root")), dark: parseTokens(block(".dark")) };
const report = { colors: {}, nonColor: {}, outOfGamut: [], counts: {} };
for (const [theme, toks] of Object.entries(themes)) {
  for (const [name, value] of Object.entries(toks)) {
    const ok = parseOklch(value);
    if (!ok) {
      report.nonColor[`${theme}:${name}`] = value;
      continue;
    }
    const c = oklchToSrgb(ok.L, ok.C, ok.H);
    report.colors[name] ??= {};
    report.colors[name][theme] = {
      oklch: value,
      hex: hex(c.rgb) + (ok.A < 1 ? Math.round(ok.A * 255).toString(16).padStart(2, "0") : ""),
      alpha: ok.A,
      inGamut: c.inGamut,
      lum: relLum(c.lin),
    };
    if (!c.inGamut) report.outOfGamut.push(`${theme}:${name} ${value} lin=${c.rawLin.map((x) => x.toFixed(4)).join(",")}`);
  }
}

// Valores repetidos (¿habría "primitivos" implícitos?)
const byValue = {};
for (const [name, t] of Object.entries(report.colors))
  for (const [theme, v] of Object.entries(t)) (byValue[`${theme}|${v.oklch}`] ??= []).push(name);
report.sharedValues = Object.fromEntries(Object.entries(byValue).filter(([, n]) => n.length > 1));
report.uniqueValues = {
  light: Object.keys(byValue).filter((k) => k.startsWith("light|")).length,
  dark: Object.keys(byValue).filter((k) => k.startsWith("dark|")).length,
};

// Contraste de pares clave con los valores sRGB (lo que verá Figma)
const contrast = (a, b) => {
  const [hi, lo] = [a, b].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const pairs = [
  ["primary-foreground", "primary"],
  ["foreground", "background"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["price", "background"],
  ["price", "card"],
  ["success", "card"],
  ["warning", "card"],
  ["destructive", "card"],
  ["destructive-foreground", "destructive"],
  ["warning-foreground", "warning"],
];
report.contrast = {};
for (const theme of ["light", "dark"])
  for (const [fg, bg] of pairs) {
    const f = report.colors[fg]?.[theme], b = report.colors[bg]?.[theme];
    if (f && b) report.contrast[`${theme}: ${fg} / ${bg}`] = +contrast(f.lum, b.lum).toFixed(2);
  }

// Recorrido de src/
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if ([".ts", ".tsx"].includes(extname(p))) acc.push(p);
  }
  return acc;
}
const files = walk(join(ROOT, "src"));
const lucide = new Map();
const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const textSizes = new Map(), weights = new Map(), shadows = new Map(), radii = new Map(), tracking = new Map(), leading = new Map();
for (const f of files) {
  if (f.includes("registry")) continue;
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g))
    for (const raw of m[1].split(",")) {
      const n = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (n && /^[A-Z]/.test(n) && !n.endsWith("Props") && n !== "LucideIcon") tally(lucide, n);
    }
  for (const m of src.matchAll(/(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+rem\]|\[[^\]]+px\])(?![\w-])/g)) tally(textSizes, m[1]);
  for (const m of src.matchAll(/(?<![\w-])font-(thin|light|normal|medium|semibold|bold|extrabold|black)(?![\w-])/g)) tally(weights, m[1]);
  for (const m of src.matchAll(/(?<![\w-:])shadow(-(?:2xs|xs|sm|md|lg|xl|2xl|none|inner))?(?![\w-])/g)) tally(shadows, m[0]);
  for (const m of src.matchAll(/(?<![\w-])rounded(-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|\[[^\]]+\]))?(?![\w-])/g)) tally(radii, m[0]);
  for (const m of src.matchAll(/(?<![\w-])tracking-(tighter|tight|normal|wide|wider|widest)(?![\w-])/g)) tally(tracking, m[1]);
  for (const m of src.matchAll(/(?<![\w-])leading-(none|tight|snug|normal|relaxed|loose|\d+)(?![\w-])/g)) tally(leading, m[1]);
}
const sorted = (m) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
report.counts = {
  tsFiles: files.length,
  lucideUnique: lucide.size,
  textSizes: sorted(textSizes),
  weights: sorted(weights),
  shadows: sorted(shadows),
  radii: sorted(radii),
  tracking: sorted(tracking),
  leading: sorted(leading),
};
report.lucideTop = Object.keys(sorted(lucide)).slice(0, 25);

console.log(JSON.stringify(report, null, 1));
