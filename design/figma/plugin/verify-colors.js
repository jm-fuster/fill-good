// verify-colors.js — comprueba, sin escribir nada, que las variables de color de
// Figma coinciden con data/tokens.json (globals.css convertido a sRGB) y que cada
// alpha/<token>/<n> sigue siendo su base a ese porcentaje. Tolerancia: medio
// escalón de 8 bits. Es la condición de salida de cualquier cambio de tokens.
const data = await (await fetch('http://localhost:9232/data/tokens.json?t=' + Date.now())).json();
const d = (a, b) => Math.max(...['r', 'g', 'b', 'a'].map((k) => Math.abs((a?.[k] ?? 1) - (b?.[k] ?? 1))));
const tol = 0.5 / 255;
const bad = [], missing = [];
let ok = 0;
for (const t of data.colors) {
  const v = __vars.find((x) => x.name === t.name && x.variableCollectionId === __colorCol.id);
  if (!v) { missing.push(t.name); continue; }
  for (const [m, want] of [['4:1', t.light], ['4:2', t.dark]]) { const diff = d(v.valuesByMode[m], want); diff <= tol ? ok++ : bad.push(`${t.name} ${m === '4:1' ? 'claro' : 'oscuro'} Δ${diff.toFixed(4)}`); }
}
for (const v of __vars.filter((x) => x.name.startsWith('alpha/'))) {
  const [, base, pct] = v.name.split('/'); const b = __vars.find((x) => x.name === base);
  for (const m of ['4:1', '4:2']) { const bv = b.valuesByMode[m]; const diff = d(v.valuesByMode[m], { ...bv, a: (bv.a ?? 1) * (+pct / 100) }); diff <= tol ? ok++ : bad.push(`${v.name} ${m} Δ${diff.toFixed(4)}`); }
}
const extra = __vars.filter((x) => x.variableCollectionId === __colorCol.id && !data.colors.some((t) => t.name === x.name) && !/^(alpha|component|effect)\//.test(x.name) && x.name !== 'transparent').map((x) => x.name);
return { comparados: ok + bad.length, coinciden: ok, difieren: bad, faltanEnFigma: missing, sinOrigenEnCodigo: extra };
