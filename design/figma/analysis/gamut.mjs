// ¿Cuánto se nota el recorte a sRGB de los valores fuera de gama? ΔE en OKLab
// (umbral de CSS Color 4 para el mapeo de gama: 0,02) y comprobación en Display P3.
const toks = {
  "primary / ring / sidebar-primary / sidebar-ring": [0.5, 0.13, 155],
  "warning": [0.5, 0.11, 70],
  "chart-1": [0.52, 0.13, 155],
  "chart-3": [0.6, 0.15, 55],
  "price": [0.53, 0.15, 55],
  "chart-5": [0.55, 0.11, 195],
  "ai-fill (parada verde, claro)": [0.5, 0.13, 155],
  "ai-fill (parada ámbar, claro)": [0.52, 0.12, 68],
  "ai-fill (parada verde, oscuro)": [0.72, 0.14, 155],
  "ai-fill (parada ámbar, oscuro)": [0.78, 0.14, 72],
};
const M1 = [[0.3963377774, 0.2158037573], [-0.1055613458, -0.0638541728], [-0.0894841775, -1.291485548]];
function oklabToLinSrgb(L, a, b) {
  const [l, m, s] = M1.map(([x, y]) => (L + x * a + y * b) ** 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function linSrgbToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const mul = (M, v) => M.map((row) => row.reduce((acc, x, i) => acc + x * v[i], 0));
const SRGB_TO_XYZ = [[0.4123907992659595, 0.357584339383878, 0.1804807884018343], [0.21263900587151036, 0.7151686787677559, 0.07219231536073371], [0.01933081871559185, 0.11919477979462599, 0.9505321522496606]];
const XYZ_TO_P3 = [[2.493496911941425, -0.9313836179191239, -0.40271078445071684], [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577], [0.03584583024378447, -0.07617238926804182, 0.9568845240076872]];
const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = (v) => "#" + v.map((c) => Math.round(enc(Math.min(1, Math.max(0, c))) * 255).toString(16).padStart(2, "0")).join("");
for (const [name, [L, C, H]] of Object.entries(toks)) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const lin = oklabToLinSrgb(L, a, b);
  const clipped = lin.map((c) => Math.min(1, Math.max(0, c)));
  const back = linSrgbToOklab(clipped);
  const dE = Math.hypot(back[0] - L, back[1] - a, back[2] - b);
  const p3 = mul(XYZ_TO_P3, mul(SRGB_TO_XYZ, lin));
  const inSrgb = lin.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
  const inP3 = p3.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
  console.log(`${name.padEnd(48)} sRGB ${hex(lin)} ${inSrgb ? "en gama " : "RECORTA "} ΔE ${dE.toFixed(4)} | P3 ${inP3 ? "en gama" : "FUERA"} (${p3.map((c) => enc(c).toFixed(3)).join(", ")})`);
}
