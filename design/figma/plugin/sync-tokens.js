// sync-tokens.js — lleva a Figma los valores de data/tokens.json (generado desde
// globals.css con `npm run figma:datos`). Actualiza por NOMBRE, no crea páginas
// ni toca componentes: los componentes están enlazados a estas variables y se
// actualizan solos. Recalcula también las alpha/* a partir de su token base.
// ARGS.dry = true informa de lo que cambiaría sin escribir.
const data = await (await fetch('http://localhost:9232/data/tokens.json?t=' + Date.now())).json();
const scale = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Scale');
const same = (a, b) => a && b && ['r', 'g', 'b', 'a'].every((k) => Math.abs((a[k] ?? 1) - (b[k] ?? 1)) < 0.5 / 255);
const changes = [];
async function upsertColor(t) {
  let v = __vars.find((x) => x.name === t.name && x.variableCollectionId === __colorCol.id);
  const isNew = !v;
  if (isNew && !ARGS.dry) { v = figma.variables.createVariable(t.name, __colorCol, 'COLOR'); __vars.push(v); }
  const dl = isNew || !same(v.valuesByMode['4:1'], t.light), dd = isNew || !same(v.valuesByMode['4:2'], t.dark);
  if (dl || dd) changes.push(`${isNew ? 'nueva' : 'cambia'} ${t.name}${dl ? ' (claro)' : ''}${dd ? ' (oscuro)' : ''}`);
  if (ARGS.dry) return;
  v.setValueForMode('4:1', t.light); v.setValueForMode('4:2', t.dark);
  v.scopes = t.scopes; v.setVariableCodeSyntax('WEB', t.web); v.description = t.desc;
}
for (const t of data.colors) await upsertColor(t);
for (const t of [...data.radius, ...data.spacing]) {
  let v = __vars.find((x) => x.name === t.name && x.variableCollectionId === scale.id);
  const cur = v && v.valuesByMode[scale.modes[0].modeId];
  if (!v || Math.abs(cur - t.value) > 0.001) changes.push(`${v ? 'cambia' : 'nueva'} ${t.name}: ${cur ?? '—'} → ${t.value}`);
  if (ARGS.dry) continue;
  if (!v) { v = figma.variables.createVariable(t.name, scale, 'FLOAT'); __vars.push(v); }
  v.setValueForMode(scale.modes[0].modeId, t.value); v.scopes = t.name.startsWith('radius/') ? ['CORNER_RADIUS'] : ['GAP', 'WIDTH_HEIGHT'];
  v.setVariableCodeSyntax('WEB', t.web); if (t.desc) v.description = t.desc;
}
// alpha/<token>/<n>: derivadas, se recalculan desde la base
for (const v of __vars.filter((x) => x.name.startsWith('alpha/'))) {
  const [, base, pct] = v.name.split('/');
  const b = __vars.find((x) => x.name === base); if (!b) { changes.push('HUÉRFANA ' + v.name); continue; }
  for (const m of ['4:1', '4:2']) {
    const bv = b.valuesByMode[m]; const want = { r: bv.r, g: bv.g, b: bv.b, a: (bv.a ?? 1) * (+pct / 100) };
    if (!same(v.valuesByMode[m], want)) { changes.push(`cambia ${v.name} (${m === '4:1' ? 'claro' : 'oscuro'})`); if (!ARGS.dry) v.setValueForMode(m, want); }
  }
}
return { dry: !!ARGS.dry, changes: changes.length, detail: changes.slice(0, 40) };
