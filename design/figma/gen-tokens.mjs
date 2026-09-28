// Genera el payload de variables de Figma DESDE globals.css (nunca a mano).
// Salida: design/figma/data/tokens.json (no se versiona: se regenera).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const block = (sel) => css.match(new RegExp(`^${sel.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)^\\}`, "m"))[1];
const parse = (body) => {
  const out = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  return out;
};
const light = parse(block(":root"));
const dark = parse(block(".dark"));

function oklch(str) {
  const m = str.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%)?\s*\)/);
  const [L, C, H] = [+m[1], +m[2], +m[3]];
  const A = m[4] ? +m[4] / 100 : 1;
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, mm, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const clipped = lin.some((v) => v < -1e-4 || v > 1 + 1e-4);
  const [r, g, bl] = lin.map((v) => {
    const c = Math.min(1, Math.max(0, v));
    return +(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055).toFixed(5);
  });
  return { rgba: { r, g, b: bl, a: A }, src: str, clipped };
}

// Scopes sacados del recuento de uso por prefijo (bg/text/border/ring/fill/stroke).
const S = {
  surface: ["FRAME_FILL", "SHAPE_FILL"],
  surfaceRing: ["FRAME_FILL", "SHAPE_FILL", "STROKE_COLOR", "EFFECT_COLOR"],
  onColor: ["TEXT_FILL", "SHAPE_FILL", "STROKE_COLOR"],
  status: ["FRAME_FILL", "SHAPE_FILL", "TEXT_FILL", "STROKE_COLOR", "EFFECT_COLOR"],
  line: ["STROKE_COLOR", "FRAME_FILL", "SHAPE_FILL"],
  ring: ["STROKE_COLOR", "EFFECT_COLOR"],
  graphic: ["FRAME_FILL", "SHAPE_FILL", "STROKE_COLOR"],
  textOnly: ["TEXT_FILL"],
};
const scopes = {
  background: S.surfaceRing, card: S.surfaceRing, popover: S.surface, secondary: S.surface,
  muted: S.surface, accent: S.surface, sidebar: S.surface, "sidebar-accent": S.surface,
  foreground: ["TEXT_FILL", "SHAPE_FILL", "STROKE_COLOR", "FRAME_FILL", "EFFECT_COLOR"],
  "muted-foreground": ["TEXT_FILL", "SHAPE_FILL", "STROKE_COLOR", "FRAME_FILL"],
  primary: S.status, destructive: S.status, success: S.status, warning: S.status,
  "sidebar-primary": S.status,
  border: S.line, input: S.line, "sidebar-border": ["STROKE_COLOR", "FRAME_FILL", "SHAPE_FILL", "EFFECT_COLOR"],
  ring: S.ring, "sidebar-ring": S.ring,
  "chart-1": S.graphic, "chart-2": S.graphic, "chart-3": S.graphic, "chart-4": S.graphic, "chart-5": S.graphic,
  price: S.textOnly,
};
const notes = {
  "chart-3": "Acento cálido de precios para gráficas e iconos (3:1). Como TEXTO usa price: por eso no tiene scope de texto.",
  price: "El acento de precios cuando es TEXTO (AA). Solo scope de texto.",
  success: "ok / en stock. Va más oscuro que sus hermanos a propósito (contraste del badge success/15).",
  warning: "caduca pronto",
  destructive: "caducado / eliminar",
  "sidebar-primary": "Sin uso en ningún componente (herencia de shadcn). Candidato a retirar.",
  "sidebar-primary-foreground": "Sin uso en ningún componente (herencia de shadcn). Candidato a retirar.",
  input: "Borde de los campos y, en oscuro, su fondo (bg-input/30).",
  border: "Bordes y separadores (también como relleno).",
};

const order = Object.keys(light).filter((k) => light[k].startsWith("oklch"));
const colors = order.map((name) => {
  const L = oklch(light[name]), D = oklch(dark[name]);
  const sc = scopes[name] ?? (name.endsWith("foreground") ? S.onColor : null);
  if (!sc) throw new Error("sin scope: " + name);
  const gam = [L.clipped && "claro", D.clipped && "oscuro"].filter(Boolean);
  const desc = [
    notes[name],
    `Código: --${name}`,
    `Light ${L.src} · Dark ${D.src}`,
    gam.length ? `Fuera de sRGB en ${gam.join(" y ")}: valor recortado (ΔE OKLab < 0,02, imperceptible).` : null,
  ].filter(Boolean).join("\n");
  return { name, light: L.rgba, dark: D.rgba, scopes: sc, web: `var(--${name})`, desc };
});

// ai-fill: dos paradas por tema, del degradado de --ai-fill
const stops = (v) => [...v.matchAll(/oklch\([^)]*\)/g)].map((m) => oklch(m[0]));
const [lf, lt] = stops(light["ai-fill"]), [df, dt] = stops(dark["ai-fill"]);
colors.push(
  { name: "ai-fill/from", light: lf.rgba, dark: df.rgba, scopes: S.surface, web: "var(--ai-fill)", desc: `Parada inicial del degradado --ai-fill (115deg). Light ${lf.src} · Dark ${df.src}\nArranca en el verde exacto de --primary.` },
  { name: "ai-fill/to", light: lt.rgba, dark: dt.rgba, scopes: S.surface, web: "var(--ai-fill)", desc: `Parada final del degradado --ai-fill (115deg). Light ${lt.src} · Dark ${dt.src}\nValores propios, no chart-3: los dos conceptos se mueven por separado.` },
);

const radiusBase = parseFloat(light.radius) * 16; // 0.75rem → 12
const radius = [
  ["sm", 0.6], ["md", 0.8], ["lg", 1], ["xl", 1.4], ["2xl", 1.8], ["3xl", 2.2], ["4xl", 2.6],
].map(([k, f]) => ({ name: `radius/${k}`, value: +(radiusBase * f).toFixed(2), web: `var(--radius-${k})`, desc: `rounded-${k} = --radius × ${f}` }));
radius.unshift({ name: "radius/base", value: radiusBase, web: "var(--radius)", desc: "--radius: 0.75rem. Los demás se derivan de este en código; en Figma son números: se cambia en código y se regenera." });
radius.push({ name: "radius/full", value: 9999, web: "calc(infinity * 1px)", desc: "rounded-full" });

// Pasos de Tailwind con ≥5 usos en src/ (recuento del 2026-09-28)
const steps = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 40];
const spacing = steps.map((n) => ({
  name: `spacing/${String(n).replace(".", "_")}`,
  value: n * 4,
  web: n === 0 ? "0" : `calc(var(--spacing) * ${n})`,
  desc: `Tailwind ${n} = ${n * 4}px${n === 11 ? " · touch target mínimo (h-11)" : n === 12 ? " · bottom nav / Button lg (h-12)" : ""}`,
}));

const OUT = fileURLToPath(new URL("./data/", import.meta.url));
mkdirSync(OUT, { recursive: true });
writeFileSync(
  OUT + "tokens.json",
  JSON.stringify({ colors, radius, spacing }),
);
console.log(colors.length, "colores ·", radius.length, "radios ·", spacing.length, "espaciados");
console.log(colors.filter((c) => c.desc.includes("Fuera")).map((c) => c.name).join(", "));
