// fix-font-size.js — repara los textos cuyo tamaño se enlazó con setBoundVariable
// encima de un estilo: tienen DOS variables en fontSize (la del estilo y la buena) y
// se pinta la del estilo. Aplica la buena con setRangeBoundVariable (ver `bind` en
// ds-lib.js) y, si es de la escala, su altura de línea.
// Solo toca textos que no están dentro de una instancia: al reparar el componente
// principal, sus instancias lo heredan. ARGS.dry = true solo informa; ARGS.limit
// reparte el trabajo en tandas (cada llamada al bridge corta a los 30 s).
await figma.loadAllPagesAsync();
const vars = await figma.variables.getLocalVariablesAsync();
const byId = Object.fromEntries(vars.map((v) => [v.id, v]));
const styles = Object.fromEntries((await figma.getLocalTextStylesAsync()).map((s) => [s.id, s]));
const inInstance = (n) => { for (let p = n.parent; p; p = p.parent) if (p.type === 'INSTANCE') return true; return false; };
let fixed = 0; const sample = [];
for (const page of figma.root.children) {
  if (page.name === 'Archivo') continue;
  for (const t of page.findAll((n) => n.type === 'TEXT')) {
    const fsb = t.boundVariables && t.boundVariables.fontSize;
    if (!Array.isArray(fsb) || fsb.length < 2 || inInstance(t)) continue;
    const st = typeof t.textStyleId === 'string' ? styles[t.textStyleId] : null;
    const styleVar = st && st.boundVariables && st.boundVariables.fontSize && st.boundVariables.fontSize.id;
    const good = fsb.map((a) => byId[a.id]).find((v) => v && v.id !== styleVar);
    if (!good) continue;
    sample.push(`${page.name} › ${t.characters.slice(0, 24)}: ${t.fontSize} → ${good.name}`);
    if (ARGS.dry || (ARGS.limit && fixed >= ARGS.limit)) continue;
    await Promise.all(t.getRangeAllFontNames(0, t.characters.length).map((f) => figma.loadFontAsync(f)));
    const lhPct = t.lineHeight && t.lineHeight.unit === 'PERCENT' ? t.lineHeight : null; // un leading-* puesto a mano se respeta
    t.setRangeBoundVariable(0, t.characters.length, 'fontSize', good);
    const lh = vars.find((v) => v.name === good.name.replace('font-size/', 'line-height/'));
    if (lh && good.name.startsWith('font-size/') && !lhPct) t.setRangeBoundVariable(0, t.characters.length, 'lineHeight', lh);
    fixed++;
  }
}
return { fixed: ARGS.dry ? 0 : fixed, found: sample.length, sample: sample.slice(0, 40) };
