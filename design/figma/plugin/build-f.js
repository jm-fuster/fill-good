// build-f.js — P4.f. ARGS.part: logo | menubutton | appsidebar | chart | doc-nav | doc-datos
const ES = async (n) => (await figma.getLocalEffectStylesAsync()).find((s) => s.name === n).id;
const NAV = [['Inventario', 'package'], ['Lista', 'shopping-cart'], ['Añadir ticket', 'scan-line'], ['Menús', 'calendar-days'], ['Perfil', 'circle-user']];

if (ARGS.part === 'logo') {
  const page = await pageByName('06 · Iconografía');
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === 'brand/logo')) n.remove();
  const svg = '<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="512" height="512" rx="115" ry="115" fill="#127A4E"/><path d="M255,180 C260.5,126.7 289.8,103 344,108 C319.6,138 290.3,161.7 255,180 Z" fill="#FFFFFF"/><rect x="246" y="168" width="18" height="62" rx="9" ry="9" fill="#FFFFFF"/><circle cx="255.5" cy="314.5" r="100.5" fill="#F5C518"/></svg>';
  const c = figma.createComponentFromNode(figma.createNodeFromSvg(svg)); c.name = 'brand/logo'; c.fills = [];
  for (const n of c.findAll((n) => n.type !== 'GROUP' && 'constraints' in n)) n.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
  c.rescale(28 / 512);
  c.description = 'Logo de Fill Good (public/brand/fillgood-logo.svg). Colores de MARCA escritos en el SVG (#127A4E, #F5C518), no tokens: es un activo, como los iconos de producto. En la app se pinta a 28 px (size-7) con rounded-md.';
  const doc = page.findOne((n) => n.name === '06 · Iconografía · doc');
  let card = doc.findOne((n) => n.name === 'Marca');
  if (card) { for (const k of card.findAll((n) => n.type === 'COMPONENT')) page.appendChild(k); card.remove(); }
  card = stack('Marca', doc, 12); setPaints(card, 'fills', [['card']]); setPaints(card, 'strokes', [['border']]); rad(card, 'radius/xl'); card.paddingLeft = card.paddingRight = 32; card.paddingTop = card.paddingBottom = 24;
  await text('Marca', 'Title/Section', 'foreground', card, { fill: true });
  await text(c.description, 'Body/Small', 'muted-foreground', card, { fill: true });
  card.appendChild(c);
  doc.insertChild(doc.children.indexOf(card) - 0, card);
  return { logo: c.id, unboundOk: 'colores de marca intrínsecos' };
}

if (ARGS.part === 'menubutton') {
  const page = await pageByName('03 · Navegación');
  const add = stager(page, 'staging · Sidebar menu button');
  for (const collapsed of ['false', 'true']) for (const st of ['default', 'hover', 'active', 'focus', 'disabled']) {
    const col = collapsed === 'true';
    const c = comp(`collapsed=${collapsed}, state=${st}`); c.primaryAxisAlignItems = col ? 'CENTER' : 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED';
    c.resize(col ? 32 : 240, 32); bind(c, 'height', 'spacing/8'); if (col) bind(c, 'width', 'spacing/8');
    padX(c, 'spacing/2'); padY(c, 'spacing/2'); bind(c, 'itemSpacing', 'spacing/2'); rad(c, 'radius/md');
    const on = st === 'active' || st === 'hover';
    setPaints(c, 'fills', on ? [['sidebar-accent']] : []);
    if (st === 'disabled') c.opacity = 0.5;
    add(c);
    const fg = on ? 'sidebar-accent-foreground' : 'sidebar-foreground';
    c.appendChild(icon('package', 16, fg, 'icon'));
    if (!col) {
      const t = await text('Inventario', st === 'active' ? 'Body/Small Medium' : 'Body/Small', fg, c, { name: 'label' }); t.layoutSizingHorizontal = 'FILL';
      const b = stack('badge', c, 0, 'HORIZONTAL'); b.layoutSizingHorizontal = 'HUG'; b.primaryAxisAlignItems = 'CENTER'; b.counterAxisAlignItems = 'CENTER';
      b.layoutPositioning = 'ABSOLUTE'; b.resize(20, 20); b.primaryAxisSizingMode = 'AUTO'; b.counterAxisSizingMode = 'FIXED'; bind(b, 'minWidth', 'spacing/5'); padX(b, 'spacing/1'); rad(b, 'radius/md');
      await text('3', 'Caption/Medium', fg, b, { name: 'count' });
      b.x = 240 - 4 - b.width; b.y = 6; b.constraints = { horizontal: 'MAX', vertical: 'MIN' }; b.visible = false;
    }
    if (st === 'focus') { const r = focusRing(c, 'sidebar-ring', 'radius/md'); r.strokeWeight = 2; }
  }
  const { cs } = await combine(page, 'staging · Sidebar menu button', 'Sidebar · MenuButton', { collapsed: ['false', 'true'], state: ['default', 'hover', 'active', 'focus', 'disabled'] }, 'state', ['collapsed'], 'SidebarMenuButton (src/components/ui/sidebar.tsx), variante y tamaño por defecto (los únicos que usa AppSidebar): h-8, p-2, gap-2, rounded-md, text-sm, icono de 16 px. hover y activo = bg-sidebar-accent; el activo, además, font-medium. Foco = ring-2 de sidebar-ring (2 px, no 3). Colapsado (modo icono) = size-8 solo con el icono; en código el label pasa a tooltip. El contador (SidebarMenuBadge) va a la derecha en text-xs tabular-nums y se oculta en modo icono. El resaltado sigue a la navegación OPTIMISTA: se activa al tocar, sin esperar al servidor.');
  const kl = cs.addComponentProperty('label', 'TEXT', 'Inventario'), ki = cs.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('package').id), kb = cs.addComponentProperty('badge', 'BOOLEAN', false), kc = cs.addComponentProperty('count', 'TEXT', '3');
  for (const c of cs.children) { c.findOne((n) => n.name === 'icon').componentPropertyReferences = { mainComponent: ki }; const l = c.findOne((n) => n.name === 'label'); if (l) l.componentPropertyReferences = { characters: kl }; const b = c.findOne((n) => n.name === 'badge'); if (b) b.componentPropertyReferences = { visible: kb }; const t = c.findOne((n) => n.name === 'count'); if (t) t.componentPropertyReferences = { characters: kc }; }
  return { set: cs.id, n: cs.children.length, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'appsidebar') {
  const page = await pageByName('03 · Navegación');
  const mb = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Sidebar · MenuButton');
  const MP = (p) => Object.keys(mb.componentPropertyDefinitions).find((k) => k.startsWith(p));
  const acc = figma.root.children.find((p) => p.name === '01 · Acciones'); await acc.loadAsync();
  const ib = acc.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Button · Icon');
  const logoPage = figma.root.children.find((p) => p.name === '06 · Iconografía'); await logoPage.loadAsync();
  const logo = logoPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'brand/logo');
  const add = stager(page, 'staging · AppSidebar');
  for (const state of ['expanded', 'collapsed']) {
    const col = state === 'collapsed';
    const c = figma.createComponent(); c.name = 'state=' + state; c.layoutMode = 'VERTICAL'; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED'; c.resize(col ? 48 : 256, 720); c.clipsContent = true; c.itemSpacing = 0;
    setPaints(c, 'fills', [['sidebar']]); c.strokes = [solid('sidebar-border')]; c.strokeRightWeight = 1; c.strokeLeftWeight = 0; c.strokeTopWeight = 0; c.strokeBottomWeight = 0; c.strokeAlign = 'INSIDE';
    add(c);
    const head = stack('header', c, 8); padX(head, 'spacing/2'); padY(head, 'spacing/2');
    const row = stack('row', head, 4, col ? 'VERTICAL' : 'HORIZONTAL'); row.counterAxisAlignItems = 'CENTER';
    const link = stack('brand', row, 8, 'HORIZONTAL'); link.counterAxisAlignItems = 'CENTER'; if (!col) link.layoutSizingHorizontal = 'FILL'; else link.layoutSizingHorizontal = 'HUG'; padX(link, col ? 'spacing/0' : 'spacing/1_5'); padY(link, 'spacing/1'); rad(link, 'radius/lg');
    link.appendChild(logo.createInstance());
    if (!col) { const t = await text('Fill Good', 'Title/Section', 'sidebar-foreground', link, { name: 'name' }); t.letterSpacing = { value: -2.5, unit: 'PERCENT' }; bind(t, 'fontFamily', 'font-family/heading'); }
    const trig = ib.children.find((ch) => ch.name === 'variant=ghost, size=icon-sm, state=default').createInstance(); trig.name = 'SidebarTrigger';
    trig.setProperties({ [Object.keys(ib.componentPropertyDefinitions).find((k) => k.startsWith('icon'))]: iconComp('panel-left').id }); row.appendChild(trig);
    const group = stack('group', c, 0); padX(group, 'spacing/2'); padY(group, 'spacing/2'); if (col) group.counterAxisAlignItems = 'CENTER';
    const menu = stack('menu', group, 4); if (col) { menu.counterAxisAlignItems = 'CENTER'; }
    NAV.forEach(([label, ic], i) => {
      const v = mb.children.find((ch) => ch.name === `collapsed=${col}, state=${i === 0 ? 'active' : 'default'}`);
      const inst = v.createInstance(); menu.appendChild(inst); if (!col) inst.layoutSizingHorizontal = 'FILL';
      const props = { [MP('icon')]: iconComp(ic).id }; if (!col) { props[MP('label')] = label; if (label === 'Lista') props[MP('badge')] = true; }
      inst.setProperties(props);
    });
  }
  const { cs } = await combine(page, 'staging · AppSidebar', 'AppSidebar', { state: ['expanded', 'collapsed'] }, 'state', [], 'AppSidebar (src/components/layout/app-sidebar.tsx): la navegación principal DESDE md; por debajo, la bottom nav (se alternan solo con CSS). collapsible="icon": 256 px expandida (--sidebar-width 16rem) o 48 px en modo icono (3rem), con Ctrl/Cmd+B o el SidebarTrigger (ghost icon-sm con PanelLeft) que va junto al logo, y que en modo icono se apila debajo. Los 5 destinos de nav-items.ts, los mismos que la bottom nav; en escritorio todos se ven igual («Añadir ticket» no lleva el énfasis de CTA, que es solo de la bottom nav). Lista lleva el contador de pendientes (99+ como máximo).');
  return { set: cs.id, unbound: unboundPaints(cs).filter((x) => !x.startsWith('Rectangle') && !x.includes('Vector') && !x.includes('Ellipse')).length };
}

if (ARGS.part === 'chart') {
  const page = await pageByName('06 · Datos');
  // Tooltip
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && (n.name === 'Chart · Tooltip' || n.name === 'Chart · Legend' || n.name === 'Chart · Muestra'))) n.remove();
  const t = figma.createComponent(); t.name = 'Chart · Tooltip'; t.layoutMode = 'VERTICAL'; t.primaryAxisSizingMode = 'AUTO'; t.counterAxisSizingMode = 'AUTO'; t.itemSpacing = 6; t.clipsContent = false;
  bind(t, 'minWidth', 'spacing/32'); padX(t, 'spacing/2_5'); padY(t, 'spacing/1_5'); rad(t, 'radius/lg'); setPaints(t, 'fills', [['background']]); setPaints(t, 'strokes', [['border', 0.5]]); t.strokeWeight = 1; t.strokeAlign = 'INSIDE';
  await t.setEffectStyleIdAsync(await ES('Shadow/xl'));
  page.appendChild(t); t.x = 3000; t.y = 0;
  await text('Semana del 14 sep', 'Caption/Medium', 'foreground', t, { name: 'label' });
  for (const [name, val, ch] of [['Mercadona', '1,29 €', 'chart-1'], ['Alipende', '1,19 €', 'chart-2'], ['Lidl', '1,35 €', 'chart-3']]) {
    const r = stack(name, t, 8, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER';
    const dot = figma.createRectangle(); dot.name = 'indicator'; dot.resize(10, 10); dot.cornerRadius = 2; setPaints(dot, 'fills', [[ch]]); r.appendChild(dot);
    const n = await text(name, 'Caption/Default', 'muted-foreground', r); n.layoutGrow = 1;
    const v = await text(val, 'Caption/Medium', 'foreground', r); bind(v, 'fontFamily', 'font-family/mono');
  }
  // ancho de trabajo: min-w-32 en código crece con el contenido; aquí 176 y las filas lo reparten
  t.counterAxisSizingMode = 'FIXED'; t.resize(176, t.height); t.primaryAxisSizingMode = 'AUTO';
  for (const r of t.children.filter((c) => c.type === 'FRAME')) { r.layoutSizingHorizontal = 'FILL'; const nm = r.children[1]; nm.textAutoResize = 'HEIGHT'; nm.layoutGrow = 1; }
  t.description = 'ChartTooltipContent (src/components/ui/chart.tsx, sobre Recharts): min-w-32, gap-1.5, rounded-lg, border-border/50, bg-background, px-2.5 py-1.5, text-xs, shadow-xl. Indicador de 10 px con rounded-[2px] en el color de la serie; valor en font-mono font-medium tabular-nums.';
  // Leyenda
  const l = figma.createComponent(); l.name = 'Chart · Legend'; l.layoutMode = 'HORIZONTAL'; l.primaryAxisSizingMode = 'AUTO'; l.counterAxisSizingMode = 'AUTO'; bind(l, 'itemSpacing', 'spacing/4'); l.fills = []; l.clipsContent = false;
  page.appendChild(l); l.x = 3000; l.y = 200;
  for (const [name, ch] of [['Mercadona', 'chart-1'], ['Alipende', 'chart-2'], ['Lidl', 'chart-3'], ['Carrefour', 'chart-4'], ['Otros', 'chart-5']]) { const it = stack(name, l, 6, 'HORIZONTAL'); it.layoutSizingHorizontal = 'HUG'; it.counterAxisAlignItems = 'CENTER'; const d = figma.createRectangle(); d.resize(8, 8); d.cornerRadius = 2; setPaints(d, 'fills', [[ch]]); it.appendChild(d); await text(name, 'Caption/Default', 'foreground', it); }
  l.description = 'ChartLegendContent: gap-4, cuadrado de 8 px (rounded-[2px]) en el color de la serie y text-xs. Series: chart-1…5 en este orden; chart-3 es el acento cálido de precios.';
  // Muestra: evolución de precio con las tres primeras series
  const m = figma.createComponent(); m.name = 'Chart · Muestra'; m.resize(560, 280); m.fills = []; m.clipsContent = false;
  page.appendChild(m); m.x = 3000; m.y = 300;
  for (let i = 0; i < 5; i++) { const g = figma.createRectangle(); g.name = 'grid'; g.resize(520, 1); g.x = 40; g.y = 20 + i * 55; setPaints(g, 'fills', [['border', 0.5]]); m.appendChild(g); }
  const Y = ['1,40', '1,30', '1,20', '1,10', '1,00'];
  for (let i = 0; i < 5; i++) { const tt = await text(Y[i], 'Caption/Default', 'muted-foreground', m); tt.x = 0; tt.y = 12 + i * 55; }
  const X = ['jun', 'jul', 'ago', 'sep'];
  for (let i = 0; i < 4; i++) { const tt = await text(X[i], 'Caption/Default', 'muted-foreground', m); tt.x = 40 + i * 170; tt.y = 252; }
  const SERIES = [['chart-1', [60, 70, 55, 72, 66, 80, 75]], ['chart-2', [120, 110, 118, 100, 106, 98, 102]], ['chart-3', [30, 45, 40, 38, 50, 42, 35]]];
  for (const [ch, pts] of SERIES) {
    const path = pts.map((y, i) => `${i ? 'L' : 'M'} ${40 + i * 85} ${20 + y}`).join(' ');
    const v = figma.createVector(); v.name = ch; v.vectorPaths = [{ windingRule: 'NONE', data: path }]; v.strokeWeight = 2; v.strokeCap = 'ROUND'; v.strokeJoin = 'ROUND'; setPaints(v, 'strokes', [[ch]]); v.fills = []; m.appendChild(v);
  }
  m.description = 'Muestra de gráfica de líneas (PriceChart, Recharts) para ver las series juntas: rejilla en border/50 y ejes en text-xs muted-foreground, líneas de 2 px. Es una ilustración estática, no un componente de datos: la gráfica real la dibuja Recharts.';
  return { tooltip: t.id, legend: l.id, sample: m.id, unbound: unboundPaints(t).length + unboundPaints(l).length + unboundPaints(m).length };
}

async function docAppend(pageName, eyebrow, title, lead, names) {
  const page = await pageByName(pageName);
  const doc = await pageDoc(page, eyebrow, title, lead);
  for (const [name, axes, colAxis, rowAxes] of names) {
    const node = page.findOne((n) => (n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent.type !== 'COMPONENT_SET')) && n.name === name);
    const s = await docSection(doc, name, [node.description]);
    if (node.type === 'COMPONENT_SET') { const g = gridLayout(node, axes, colAxis, rowAxes, 24, 32, 72); await board(s, node, rowAxes.length ? g : { ...g, rows: [name] }, name + ' · variantes'); } else s.appendChild(node);
  }
  return { doc: doc.id, order: doc.children.map((c) => c.name), unbound: unboundPaints(doc).length };
}
if (ARGS.part === 'doc-nav') return await docAppend('03 · Navegación', 'COMPONENTES · 03', 'Navegación', '', [
  ['Sidebar · MenuButton', { collapsed: ['false', 'true'], state: ['default', 'hover', 'active', 'focus', 'disabled'] }, 'state', ['collapsed']],
  ['AppSidebar', { state: ['expanded', 'collapsed'] }, 'state', []]]);
if (ARGS.part === 'doc-datos') return await docAppend('06 · Datos', 'COMPONENTES · 06', 'Datos', 'Gráficas con Recharts envuelto en ui/chart.tsx. Las series usan chart-1…5 y necesitan 3:1; el acento de precios como texto va con price. Los componentes de aquí son la piel (tooltip, leyenda) y una muestra estática.', [
  ['Chart · Tooltip'], ['Chart · Legend'], ['Chart · Muestra']]);
