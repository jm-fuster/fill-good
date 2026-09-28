// fix-alpha.js — ARGS.page. Sustituye opacidades a mano sobre pinturas enlazadas por
// variables alpha/* (las a mano se pierden al resolver el modo). También informa.
const page = await pageByName(ARGS.page);
const fixed = [], skipped = [];
for (const n of [page, ...page.findAll(() => true)]) {
  if (n.type === 'INSTANCE' || (n.parent && n.parent.type === 'INSTANCE')) continue; // se corrigen en su componente
  let inInstance = false; for (let a = n.parent; a; a = a.parent) if (a.type === 'INSTANCE') { inInstance = true; break; }
  if (inInstance) continue;
  for (const key of ['fills', 'strokes']) {
    const ps = n[key]; if (!Array.isArray(ps) || !ps.length) continue;
    let changed = false;
    const next = ps.map((p) => {
      if (p.type !== 'SOLID' || !p.boundVariables?.color) return p;
      const v = __vars.find((x) => x.id === p.boundVariables.color.id); if (!v) return p;
      // comparar con la alfa del modo EN QUE ESTÁ el nodo (dentro de una celda oscura la opacidad ya viene resuelta en oscuro)
      const mode = (n.resolvedVariableModes || {})[__colorCol.id] || '4:1';
      let lv = v.valuesByMode[mode]; if (lv && lv.type === 'VARIABLE_ALIAS') lv = __vars.find((x) => x.id === lv.id).valuesByMode[mode];
      const va = lv?.a ?? 1;
      if (Math.abs(p.opacity - va) < 0.005) return p;
      if (v.name.startsWith('alpha/') || v.name.startsWith('component/') || v.name.startsWith('effect/') || v.name === 'transparent') { skipped.push(n.name + ':' + v.name); return p; }
      const op = Math.round((p.opacity / va) * 100) / 100;
      changed = true; fixed.push(`${n.name}:${key}:${v.name}@${op}`);
      return solid(alphaVar(v.name, op));
    });
    if (changed) n[key] = next;
  }
}
return { page: ARGS.page, fixed: fixed.length, sample: fixed.slice(0, 8), skipped: skipped.slice(0, 5) };
