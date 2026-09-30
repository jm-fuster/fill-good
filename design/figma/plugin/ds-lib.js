// ds-lib.js — ayudas compartidas por los constructores de componentes.
// Se concatena delante de cada build-*.js y corre en el sandbox del plugin
// (figma y ARGS vienen como parámetros). Reglas que encapsula, todas medidas:
//  - pintura enlazada con opacidad en DOS pasos (la 1.ª asignación la pone a 1)
//  - foco = capa focus-ring (Figma no proyecta sombras desde un frame sin relleno)
//  - nada de valores sueltos: color, radio, padding, gap y alto van a variables
const __vars = await figma.variables.getLocalVariablesAsync();
const V = (n) => { const v = __vars.find((x) => x.name === n); if (!v) throw new Error('Variable no encontrada: ' + n); return v; };
const __ts = await figma.getLocalTextStylesAsync();
const TS = (n) => { const s = __ts.find((x) => x.name === n); if (!s) throw new Error('Estilo no encontrado: ' + n); return s; };
for (const f of ['Geist', 'Geist Mono']) for (const s of ['Regular', 'Medium', 'SemiBold']) await figma.loadFontAsync({ family: f, style: s });

const solid = (name) => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V(name));
// MEDIDO (2026-09-28): con un color enlazado, Figma fija la opacidad de la pintura a
// la alfa de la variable CADA VEZ que resuelve el modo (instancias, modo explícito).
// Una opacidad puesta a mano se pierde. Por eso token/NN (bg-success/15) es una
// variable con la alfa incluida —lo mismo que emite Tailwind con color-mix— y
// border-transparent es la variable `transparent`.
const __colorCol = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Color');
function alphaVar(token, opacity) {
  if (opacity === 0) {
    let t = __vars.find((x) => x.name === 'transparent');
    if (!t) { t = figma.variables.createVariable('transparent', __colorCol, 'COLOR'); __vars.push(t); for (const m of ['4:1', '4:2']) t.setValueForMode(m, { r: 1, g: 1, b: 1, a: 0 }); t.scopes = ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR']; t.setVariableCodeSyntax('WEB', 'transparent'); t.description = 'transparent de Tailwind (border-transparent, bg-transparent). Existe porque en Figma una opacidad 0 a mano sobre otra variable se pierde al cambiar de modo.'; }
    return t.name;
  }
  const pct = Math.round(opacity * 100);
  const name = `alpha/${token}/${pct}`;
  if (!__vars.find((x) => x.name === name)) {
    const base = V(token);
    const v = figma.variables.createVariable(name, __colorCol, 'COLOR'); __vars.push(v);
    for (const m of ['4:1', '4:2']) { let val = base.valuesByMode[m]; if (val.type === 'VARIABLE_ALIAS') val = __vars.find((x) => x.id === val.id).valuesByMode[m]; v.setValueForMode(m, { r: val.r, g: val.g, b: val.b, a: (val.a ?? 1) * opacity }); }
    v.scopes = base.scopes; v.setVariableCodeSyntax('WEB', `color-mix(in oklab, var(--${token}) ${pct}%, transparent)`);
    v.description = `${token}/${pct} de Tailwind (p. ej. bg-${token}/${pct}). Variable propia porque en Figma la opacidad de una pintura enlazada la dicta la alfa de la variable al resolver el modo. Se regenera desde --${token}.`;
  }
  return name;
}
// list: [[token, opacidad?], ...] de abajo arriba
function setPaints(node, key, list) {
  node[key] = list.map(([n, o]) => solid(o != null && o !== 1 ? alphaVar(n, o) : n));
}
const bind = (node, field, name) => node.setBoundVariable(field, V(name));
const rad = (node, name) => { for (const k of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) bind(node, k, name); };
const padX = (node, name) => { bind(node, 'paddingLeft', name); bind(node, 'paddingRight', name); };
const padY = (node, name) => { bind(node, 'paddingTop', name); bind(node, 'paddingBottom', name); };

async function text(chars, style, color, parent, opts = {}) {
  const t = figma.createText();
  await t.setTextStyleIdAsync(TS(style).id);
  t.characters = chars;
  setPaints(t, 'fills', [[color, opts.opacity]]);
  if (opts.name) t.name = opts.name;
  if (parent) { parent.appendChild(t); if (opts.fill) { t.layoutSizingHorizontal = 'FILL'; t.textAutoResize = 'HEIGHT'; } }
  return t;
}
function stack(name, parent, gap = 0, dir = 'VERTICAL') {
  const f = figma.createFrame(); f.name = name; f.layoutMode = dir; f.itemSpacing = gap; f.fills = []; f.clipsContent = false;
  if (parent) { parent.appendChild(f); if (parent.layoutMode && parent.layoutMode !== 'NONE') { f.layoutSizingHorizontal = 'FILL'; f.layoutSizingVertical = 'HUG'; } }
  return f;
}

// Iconos: componentes lucide/<nombre> de la página de iconografía
const __iconPage = figma.root.children.find((p) => p.name === '06 · Iconografía');
await __iconPage.loadAsync();
const __icons = {};
function iconComp(name) {
  if (!__icons[name]) { const c = __iconPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'lucide/' + name); if (!c) throw new Error('Icono no encontrado: ' + name); __icons[name] = c; }
  return __icons[name];
}
// MEDIDO (2026-09-30): en un override DENTRO de una instancia, Figma pinta el
// color literal de la pintura aunque esté enlazada, y solid() lo deja en negro:
// el icono de un Button por defecto salía oscuro sobre el verde con la variable
// bien puesta. Se escribe el valor ya resuelto para ese nodo; al cambiar de modo
// Figma lo vuelve a resolver, porque sigue enlazado.
function solidFor(token, node) {
  const v = V(token); let color = { r: 0, g: 0, b: 0 };
  try { const r = v.resolveForConsumer(node); if (r && r.value && 'r' in r.value) color = { r: r.value.r, g: r.value.g, b: r.value.b }; } catch (e) {}
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color }, 'color', v);
}
function recolor(node, token) {
  for (const v of node.findAll((n) => n.type === 'VECTOR' || n.type === 'ELLIPSE' || n.type === 'RECTANGLE' || n.type === 'LINE')) {
    if (v.strokes && v.strokes.length) v.strokes = [solidFor(token, v)];
    if (Array.isArray(v.fills) && v.fills.length) v.fills = [solidFor(token, v)];
  }
}
function icon(name, size, token, nodeName) {
  const inst = iconComp(name).createInstance();
  inst.rescale(size / 24); // escala también el trazo: 16 px → 1,33, como el SVG
  if (token) recolor(inst, token);
  inst.name = nodeName || 'icon';
  return inst;
}
// MEDIDO: al cambiar el icono de una instancia (instance swap, también con
// setProperties), Figma lo devuelve al color por defecto del icono (foreground):
// se pierde el color que la variante le daba (text-primary en la nav activa, el
// rojo de destructive…). En código el icono hereda currentColor y esto no pasa.
// Esta función se lo devuelve: cada icono anidado de una instancia toma el color
// que tiene ese mismo icono en su componente principal.
// El swap además RENOMBRA la capa (icon → lucide/package), así que se empareja por
// posición entre los iconos Lucide de primer nivel de la instancia.
const colorOf = (node) => { const v = node.findOne((n) => (n.strokes && n.strokes.length) || (Array.isArray(n.fills) && n.fills.length && n.type !== 'FRAME')); return v && ((v.strokes && v.strokes[0]?.boundVariables?.color?.id) || (Array.isArray(v.fills) && v.fills[0]?.boundVariables?.color?.id)); };
async function lucideChildren(node) {
  // iconos lucide anidados, sin entrar en otras instancias que no sean iconos
  const out = [];
  const walk = async (n) => { for (const k of n.children || []) { if (k.type === 'INSTANCE') { const m = await k.getMainComponentAsync(); if (m && m.name.startsWith('lucide/')) out.push(k); continue; } await walk(k); } };
  await walk(node);
  return out;
}
async function fixIconColors(root) {
  let fixed = 0;
  const insts = root.type === 'INSTANCE' ? [root, ...root.findAll((n) => n.type === 'INSTANCE')] : root.findAll((n) => n.type === 'INSTANCE');
  for (const inst of insts) {
    const main = await inst.getMainComponentAsync(); if (!main || main.name.startsWith('lucide/')) continue;
    const src = await lucideChildren(main), dst = await lucideChildren(inst);
    // Solo se corrige lo que el swap resetea: el icono quedó en `foreground` (el
    // color por defecto de lucide/*). Otro color es un override a propósito (p. ej.
    // text-muted-foreground en los iconos del stepper) y se respeta.
    const fgId = __vars.find((v) => v.name === 'foreground').id;
    // MEDIDO (2026-09-30): cambiar a un icono con MÁS trazos que el anterior
    // conserva el override en los primeros y deja el resto en foreground (settings
    // → trash: 2 destructive + 3 foreground). Mirar solo el primer trazo no lo ve,
    // así que cuenta como reseteado cualquier trazo que haya vuelto a foreground.
    const paintIds = (n) => n.findAll((v) => v.type === 'VECTOR' || v.type === 'ELLIPSE' || v.type === 'RECTANGLE' || v.type === 'LINE').flatMap((v) => [...(v.strokes || []), ...(Array.isArray(v.fills) ? v.fills : [])].map((p) => p.boundVariables?.color?.id));
    for (let i = 0; i < Math.min(src.length, dst.length); i++) {
      const id = colorOf(src[i]);
      if (!id || id === fgId || !paintIds(dst[i]).includes(fgId)) continue;
      const want = __vars.find((v) => v.id === id); if (!want) continue;
      recolor(dst[i], want.name); fixed++;
    }
  }
  return fixed;
}
// Anillo de foco (ring-3): capa hija absoluta con trazo exterior de 3 px
function focusRing(parent, token, radiusName) {
  const r = figma.createFrame(); r.name = 'focus-ring'; r.fills = []; r.resize(1, 1);
  parent.appendChild(r); r.layoutPositioning = 'ABSOLUTE';
  // el frame nace con 100 px dentro del auto-layout y el padre se queda estirado: se vuelve a ajustar
  if (parent.layoutMode && parent.layoutMode !== 'NONE') for (const k of ['primaryAxisSizingMode', 'counterAxisSizingMode']) { const m = parent[k]; if (m === 'AUTO') { parent[k] = 'FIXED'; parent[k] = 'AUTO'; } }
  r.x = 0; r.y = 0; r.resize(Math.max(1, parent.width), Math.max(1, parent.height));
  r.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
  r.strokes = [solid(token)]; r.strokeWeight = 3; r.strokeAlign = 'OUTSIDE';
  if (radiusName) rad(r, radiusName);
  return r;
}

async function pageByName(name) { const p = figma.root.children.find((x) => x.name === name); if (!p) throw new Error('Página: ' + name); await figma.setCurrentPageAsync(p); return p; }
function staging(page, name) {
  let s = page.findOne((n) => n.name === name && n.parent === page);
  if (!s) { s = figma.createFrame(); s.name = name; s.fills = []; s.clipsContent = false; page.appendChild(s); s.x = 3000; s.y = 0; s.resize(10, 10); }
  return s;
}
// props del nombre de variante: "a=1, b=2" → {a:'1', b:'2'}
const variantProps = (name) => Object.fromEntries(name.split(', ').map((p) => p.split('=')));
// Rejilla: columnas por colAxis, filas por rowAxes (el último cambia más rápido)
function gridLayout(cs, axes, colAxis, rowAxes, gap = 24, padding = 40, minCol = 0) {
  const kids = cs.children.map((c) => ({ c, p: variantProps(c.name) }));
  const rowKey = (p) => rowAxes.map((a) => p[a]).join(' / ');
  const rows = []; const rec = (i, acc) => { if (i === rowAxes.length) return rows.push(acc.join(' / ')); for (const v of axes[rowAxes[i]]) rec(i + 1, [...acc, v]); }; rec(0, []);
  // colAxis null = una sola columna (componentes anchos, p. ej. Toast)
  const cols = colAxis ? axes[colAxis] : [''];
  const colOf = (p) => (colAxis ? p[colAxis] : '');
  const colW = cols.map((v) => Math.max(minCol, ...kids.filter((k) => colOf(k.p) === v).map((k) => k.c.width)));
  const rowH = rows.map((r) => Math.max(0, ...kids.filter((k) => rowKey(k.p) === r).map((k) => k.c.height)));
  const colX = cols.map((_, i) => padding + colW.slice(0, i).reduce((a, b) => a + b + gap, 0));
  const rowY = rows.map((_, i) => padding + rowH.slice(0, i).reduce((a, b) => a + b + gap, 0));
  for (const { c, p } of kids) { const ci = cols.indexOf(colOf(p)), ri = rows.indexOf(rowKey(p)); if (ci < 0 || ri < 0) continue; c.x = colX[ci]; c.y = rowY[ri] + (rowH[ri] - c.height) / 2; }
  const W = colX[cols.length - 1] + colW[cols.length - 1] + padding, H = rowY[rows.length - 1] + rowH[rows.length - 1] + padding;
  cs.resizeWithoutConstraints(W, H);
  return { rows, cols, colX, colW, rowY, rowH };
}
// Etiquetas de fila/columna y marco de presentación alrededor de un component set
async function board(parent, cs, grid, name) {
  let b = parent.findOne((n) => n.name === name);
  if (b) { for (const k of b.findAll((n) => n.type === 'COMPONENT_SET' && n !== cs)) figma.currentPage.appendChild(k); if (cs.parent === b) figma.currentPage.appendChild(cs); b.remove(); }
  b = figma.createFrame(); b.name = name; b.fills = []; b.clipsContent = false;
  parent.appendChild(b);
  if (parent.layoutMode && parent.layoutMode !== 'NONE') b.layoutSizingHorizontal = 'FIXED';
  const LEFT = 200, TOP = 36;
  b.appendChild(cs); cs.x = LEFT; cs.y = TOP;
  for (let i = 0; i < grid.cols.length; i++) { const t = await text(grid.cols[i], 'Caption/Medium', 'muted-foreground', b); t.x = LEFT + grid.colX[i]; t.y = 8; }
  for (let i = 0; i < grid.rows.length; i++) { const t = await text(grid.rows[i], 'Caption/Default', 'muted-foreground', b); t.x = 0; t.y = TOP + grid.rowY[i] + grid.rowH[i] / 2 - 8; }
  b.resize(LEFT + cs.width, TOP + cs.height);
  return b;
}
// Sección de documentación de un componente dentro del doc de la página
async function docSection(doc, title, paragraphs) {
  let s = doc.findOne((n) => n.name === title && n.parent === doc);
  const at = s ? doc.children.indexOf(s) : -1;
  if (s) {
    // los componentes viven dentro de las secciones: rescatarlos antes de borrar
    const pg = doc.parent;
    for (const k of s.findAll((n) => (n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent.type !== 'COMPONENT_SET')))) { pg.appendChild(k); k.x = 3000; k.y = 0; }
    s.remove();
  }
  s = stack(title, doc, 16);
  if (at >= 0) doc.insertChild(at, s);
  await text(title, 'Display/3xl', 'foreground', s, { fill: true });
  for (const p of paragraphs) { const t = await text(p, 'Body/Small', 'muted-foreground', s, { fill: true }); t.lineHeight = { value: 160, unit: 'PERCENT' }; }
  return s;
}
async function pageDoc(page, eyebrow, title, lead) {
  let doc = page.findOne((n) => n.name === page.name + ' · doc' && n.parent === page);
  if (doc) return doc;
  doc = figma.createFrame(); doc.name = page.name + ' · doc'; doc.layoutMode = 'VERTICAL'; doc.resize(1840, 100);
  doc.primaryAxisSizingMode = 'AUTO'; doc.counterAxisSizingMode = 'FIXED'; doc.itemSpacing = 64; doc.paddingLeft = doc.paddingRight = 96; doc.paddingTop = doc.paddingBottom = 96;
  doc.clipsContent = false; setPaints(doc, 'fills', [['background']]);
  page.appendChild(doc); doc.x = 0; doc.y = 0;
  const h = stack('Cabecera', doc, 12);
  await text(eyebrow, 'Caption/Medium', 'primary', h, { fill: true });
  await text(title, 'Display/4xl', 'foreground', h, { fill: true });
  await text(lead, 'Body/Base', 'muted-foreground', h, { fill: true });
  return doc;
}
// Combinar lo que hay en un staging, maquetar y describir. Devuelve el set.
async function combine(page, stageName, setName, axes, colAxis, rowAxes, description, dest) {
  const stage = page.findOne((n) => n.name === stageName && n.parent === page);
  const comps = stage.children.filter((n) => n.type === 'COMPONENT');
  const old = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === setName); if (old) old.remove();
  const cs = figma.combineAsVariants(comps, page);
  cs.name = setName; cs.description = description;
  setPaints(cs, 'fills', [['background']]); setPaints(cs, 'strokes', [['border']]); cs.dashPattern = [6, 4]; rad(cs, 'radius/xl'); cs.clipsContent = false;
  const grid = gridLayout(cs, axes, colAxis, rowAxes, 24, 32);
  stage.remove();
  return { cs, grid };
}
// Crea (o limpia) el staging y devuelve una función que añade componentes apilados
function stager(page, name) {
  const s = staging(page, name);
  for (const n of [...s.children]) n.remove();
  let y = 0;
  return (c) => { s.appendChild(c); c.x = 0; c.y = y; y += c.height + 8; return c; };
}
function comp(name, dir = 'HORIZONTAL') {
  const c = figma.createComponent(); c.name = name; c.layoutMode = dir; c.clipsContent = false; c.fills = [];
  c.primaryAxisAlignItems = 'CENTER'; c.counterAxisAlignItems = 'CENTER'; c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'AUTO';
  return c;
}
// border de 1 px siempre presente (border-box); transparente si no se ve
function border(c, token, opacity) { c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; c.strokesIncludedInLayout = true; setPaints(c, 'strokes', [[token || 'border', token ? opacity : 0]]); }
// Variable de componente (traducción del dark: de una clase)
async function compVar(name, light, dark, scopes, web, desc) {
  const col = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Color');
  let v = __vars.find((x) => x.name === name);
  if (!v) { v = figma.variables.createVariable(name, col, 'COLOR'); __vars.push(v); }
  v.setValueForMode('4:1', light); v.setValueForMode('4:2', dark); v.scopes = scopes; v.setVariableCodeSyntax('WEB', web);
  v.description = desc + ' NO EXISTE COMO TOKEN EN CÓDIGO: es el dark: de la clase. Se regenera desde los tokens base.';
  return v;
}
const aliasOf = (n) => ({ type: 'VARIABLE_ALIAS', id: V(n).id });
const tint = (n, mode, a) => ({ ...V(n).valuesByMode[mode], a: V(n).valuesByMode[mode].a * a });
// Auditoría: pinturas sólidas sin variable dentro de un nodo
function unboundPaints(root) {
  const out = [];
  for (const n of [root, ...root.findAll(() => true)]) for (const k of ['fills', 'strokes']) { const ps = n[k]; if (Array.isArray(ps)) for (const p of ps) if (p.type === 'SOLID' && p.visible !== false && !p.boundVariables?.color) out.push(n.name + ':' + k); }
  return out;
}
