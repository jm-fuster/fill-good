// build-screens.js — Fase 6: pantallas clave en «◆ PANTALLAS», montadas SOLO con
// instancias de la librería y de los patrones. Son frames (no componentes): una
// pantalla no se reutiliza, se revisa. ARGS.screen:
//   inventario-movil | inventario-escritorio | lista-movil | lista-escritorio | menus-movil | inventario-movil-oscuro | indice
async function setOf(pageName, name) { const p = figma.root.children.find((x) => x.name === pageName); await p.loadAsync(); const n = p.findOne((k) => (k.type === 'COMPONENT_SET' || (k.type === 'COMPONENT' && k.parent.type !== 'COMPONENT_SET')) && k.name === name); if (!n) throw new Error('Falta ' + name); return n; }
const P = (cs, p) => Object.keys(cs.componentPropertyDefinitions).find((k) => k.startsWith(p));
const variant = (cs, name) => { const v = cs.children.find((c) => c.name === name); if (!v) throw new Error('Variante ' + name + ' en ' + cs.name); return v; };
const inst = (node, v) => (node.type === 'COMPONENT_SET' ? variant(node, v) : node).createInstance();
const iconsPage = figma.root.children.find((p) => p.name === '06 · Iconografía'); await iconsPage.loadAsync();
const prod = (slug) => { const c = iconsPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'product/' + slug); if (!c) throw new Error('producto ' + slug); return c.id; };
function product(slug, size) { const c = iconsPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'product/' + slug); const i = c.createInstance(); i.rescale(size / c.width); return i; }
const page = await pageByName('◆ PANTALLAS');
const colorCol = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Color');
const bpCol = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Breakpoint');
const L = {
  btn: await setOf('01 · Acciones', 'Button'), ib: await setOf('01 · Acciones', 'Button · Icon'), fab: await setOf('01 · Acciones', 'FAB'),
  bar: await setOf('03 · Navegación', 'BottomNav'), side: await setOf('03 · Navegación', 'AppSidebar'), header: await setOf('03 · Navegación', 'AppHeader'), ph: await setOf('03 · Navegación', 'PageHeader'),
  card: await setOf('◆ PATRONES', 'Tarjeta de inventario'), sec: await setOf('◆ PATRONES', 'Cabecera de sección'), chip: await setOf('◆ PATRONES', 'Chip de filtro'), search: await setOf('◆ PATRONES', 'Buscador'),
  row: await setOf('◆ PATRONES', 'Fila de la lista'), sug: await setOf('◆ PATRONES', 'Te puede faltar'), ai: await setOf('◆ PATRONES', 'Botón de IA'), dia: await setOf('◆ PATRONES', 'Día del menú'),
};
const IB = (v, size, ic, st = 'default') => { const i = inst(L.ib, `variant=${v}, size=${size}, state=${st}`); i.setProperties({ [P(L.ib, 'icon')]: iconComp(ic).id }); return i; };
const BTN = (v, size, label, ic) => { const i = inst(L.btn, `variant=${v}, size=${size}, state=default`); const pr = { [P(L.btn, 'label')]: label }; if (ic) { pr[P(L.btn, 'icon inline-start#')] = true; pr[P(L.btn, 'icon inline-start ↳')] = iconComp(ic).id; } i.setProperties(pr); return i; };
function header(title, actions, description) {
  const h = L.ph.createInstance(); const pr = { [P(L.ph, 'title')]: title, [P(L.ph, 'show description')]: !!description };
  if (description) pr[P(L.ph, 'description')] = description;
  h.setProperties(pr);
  // las acciones del header se montan al lado del título (la del componente es una sola)
  if (actions && actions.length) { const row = h.findOne((n) => n.name === 'row'); const box = figma.createFrame(); box.name = 'acciones'; box.layoutMode = 'HORIZONTAL'; box.itemSpacing = 8; box.fills = []; box.primaryAxisSizingMode = 'AUTO'; box.counterAxisSizingMode = 'AUTO'; for (const a of actions) box.appendChild(a); return { h, box }; }
  return { h, box: null };
}
// Destino activo de la navegación (0 Inventario, 1 Lista, 2 Añadir ticket, 3 Menús, 4 Perfil):
// los componentes vienen con Inventario activo; cada pantalla marca el suyo.
async function activate(root, idx) {
  const item = await setOf('03 · Navegación', 'BottomNav · Item');
  const mb = await setOf('03 · Navegación', 'Sidebar · MenuButton');
  const bar = root.findOne((n) => n.type === 'INSTANCE' && n.name === 'BottomNav');
  if (bar) { const kids = bar.findOne((n) => n.name === 'items').children; kids.forEach((k, i) => { if (i === 2) return; k.swapComponent(variant(item, i === idx ? 'state=active' : 'state=default')); }); }
  const side = root.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('AppSidebar'));
  if (side) { const kids = side.findOne((n) => n.name === 'menu').children; kids.forEach((k, i) => k.swapComponent(variant(mb, `collapsed=false, state=${i === idx ? 'active' : 'default'}`))); }
}
function screen(name, w, mode) {
  const old = page.findOne((n) => n.name === name && n.parent === page); if (old) old.remove();
  const s = figma.createFrame(); s.name = name; s.resize(w, 844); s.clipsContent = true; setPaints(s, 'fills', [['background']]);
  page.appendChild(s);
  s.setExplicitVariableModeForCollection(bpCol, bpCol.modes[mode === 'desktop' ? 1 : 0].modeId);
  return s;
}
function col(parent, name, gap) { const f = stack(name, parent, gap); return f; }
function mobileContent(s) { const c = stack('contenido', null, 16); s.appendChild(c); c.x = 0; c.y = 0; c.resize(390, 10); c.layoutSizingVertical = 'HUG'; padX(c, 'spacing/4'); bind(c, 'paddingTop', 'spacing/4'); c.paddingBottom = 112 + 82; return c; } // pb-28 del shell + pb-fab de la lista (safe 34 + 48): el FAB nunca tapa la última tarjeta
function finishMobile(s, content, { checkout } = {}) {
  const H = Math.max(844, Math.ceil(content.height)); s.resize(390, H);
  const b = L.bar.createInstance(); s.appendChild(b); b.x = 0; b.y = H - b.height;
  if (checkout) { const wrap = stack('CheckoutBar', null, 0); s.appendChild(wrap); wrap.resize(390, 10); wrap.layoutSizingVertical = 'HUG'; padX(wrap, 'spacing/4'); const bt = BTN('default', 'lg', checkout, 'shopping-cart'); wrap.appendChild(bt); bt.layoutSizingHorizontal = 'FILL'; bt.effects = []; wrap.x = 0; wrap.y = H - 64 - 34 - wrap.height; }
  const f = L.fab.createInstance(); s.appendChild(f); f.x = 390 - 16 - 56; f.y = H - 34 - (checkout ? 112 : 64) - 16 - 56;
}
function desktop(s, H = 900) {
  s.resize(1280, H);
  const side = inst(L.side, 'state=expanded'); s.appendChild(side); side.x = 0; side.y = 0; side.resize(256, H);
  const hd = L.header.createInstance(); s.appendChild(hd); hd.x = 256; hd.y = 0; hd.resize(1024, 56);
  const c = stack('contenido', null, 16); s.appendChild(c); c.x = 256; c.y = 56; c.resize(1024, 10); c.layoutSizingVertical = 'HUG'; padX(c, 'spacing/8'); bind(c, 'paddingTop', 'spacing/4'); bind(c, 'paddingBottom', 'spacing/8');
  return c;
}
function withActions(parent, title, actions, description) { const { h, box } = header(title, actions, description); parent.appendChild(h); h.layoutSizingHorizontal = 'FILL'; if (box) { const wrap = stack('cabecera', null, 16, 'HORIZONTAL'); parent.insertChild(parent.children.indexOf(h), wrap); wrap.layoutSizingHorizontal = 'FILL'; wrap.layoutSizingVertical = 'HUG'; wrap.counterAxisAlignItems = 'MIN'; wrap.appendChild(h); h.layoutSizingHorizontal = 'FILL'; wrap.appendChild(box); } return h; }
async function chips(parent, list, wrap) { const r = stack('chips', parent, 8, 'HORIZONTAL'); if (wrap) { r.layoutWrap = 'WRAP'; r.counterAxisSpacing = 8; } else r.clipsContent = true; for (const [label, count, st] of list) { const c = inst(L.chip, 'estado=' + st); r.appendChild(c); c.setProperties({ [P(L.chip, 'label')]: label, [P(L.chip, 'count')]: String(count) }); } return r; }
function card(parent, estado, name, slug, qty, enLista) { const c = inst(L.card, 'estado=' + estado); parent.appendChild(c); c.layoutSizingHorizontal = 'FILL'; const pr = { [P(L.card, 'name')]: name, [P(L.card, 'producto')]: prod(slug) }; if (qty) pr[P(L.card, 'qty')] = qty; if (enLista) pr[P(L.card, 'en la lista')] = true; c.setProperties(pr); return c; }
async function section(parent, emoji, title, count, urg, cards, cols) {
  const s = stack(title, parent, 8);
  const h = L.sec.createInstance(); s.appendChild(h); h.layoutSizingHorizontal = 'FILL';
  h.findOne((n) => n.name === 'emoji').characters = emoji; h.findOne((n) => n.name === 'title').characters = title; h.findOne((n) => n.name === 'count').characters = `(${count})`;
  const badges = h.findAll((n) => n.type === 'INSTANCE' && n.name.startsWith('Badge')); if (!urg) for (const b of badges) b.visible = false;
  const grid = stack('tarjetas', s, cols > 1 ? 12 : 8, cols > 1 ? 'HORIZONTAL' : 'VERTICAL'); if (cols > 1) { grid.layoutWrap = 'WRAP'; grid.counterAxisSpacing = 12; }
  for (const args of cards) { const c = card(grid, ...args); if (cols > 1) { c.layoutSizingHorizontal = 'FIXED'; c.resize((grid.width - 12 * (cols - 1)) / cols, c.height); } }
  return s;
}
const NEVERA = [['caduca-pronto', 'Yogur natural', 'yogur', '4 ud · 500 g'], ['en-stock', 'Leche entera', 'leche', '2 ud · 2 l', true], ['caducado', 'Pechuga de pollo', 'pollo', '1 ud · 400 g'], ['agotado', 'Huevos', 'huevo']];
const DESPENSA = [['quedan-pocas', 'Arroz', 'arroz', '1 ud · 1 kg'], ['en-stock', 'Espaguetis', 'pasta', '3 ud · 500 g'], ['en-stock', 'Aceite de oliva', 'aceite', '1 ud · 1 l']];

if (ARGS.screen === 'inventario-movil' || ARGS.screen === 'inventario-movil-oscuro') {
  const dark = ARGS.screen.endsWith('oscuro');
  const s = screen(dark ? 'Inventario · móvil · oscuro' : 'Inventario · móvil', 390, 'mobile');
  if (dark) s.setExplicitVariableModeForCollection(colorCol, '4:2');
  const c = mobileContent(s);
  withActions(c, 'Inventario', [IB('outline', 'icon', 'rotate-ccw-clock')]);
  const se = inst(L.search, 'filled=false'); c.appendChild(se); se.layoutSizingHorizontal = 'FILL';
  await chips(c, [['Caducan pronto', 1, 'inactivo'], ['Caducados', 1, 'inactivo'], ['Agotados', 1, 'inactivo'], ['Quedan pocas', 1, 'inactivo']], false);
  const secs = stack('secciones', c, 24);
  await section(secs, '🧊', 'Nevera', 4, true, NEVERA, 1);
  await section(secs, '🧺', 'Despensa', 3, false, DESPENSA, 1);
  finishMobile(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'inventario-escritorio') {
  const s = screen('Inventario · escritorio', 1280, 'desktop');
  const c = desktop(s);
  withActions(c, 'Inventario', [IB('outline', 'icon', 'rotate-ccw-clock'), BTN('default', 'default', 'Añadir producto', 'plus')]);
  const se = inst(L.search, 'filled=false'); c.appendChild(se); se.layoutSizingHorizontal = 'FILL';
  await chips(c, [['Caducan pronto', 1, 'activo-aviso'], ['Caducados', 1, 'inactivo'], ['Agotados', 1, 'inactivo'], ['Quedan pocas', 1, 'inactivo']], true);
  const secs = stack('secciones', c, 24);
  await section(secs, '🧊', 'Nevera', 4, true, NEVERA, 3);
  await section(secs, '🧺', 'Despensa', 3, false, DESPENSA, 3);
  s.resize(1280, Math.max(800, Math.ceil(56 + c.height))); s.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('AppSidebar')).resize(256, s.height);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

async function listaContenido(c, desktopMode) {
  if (desktopMode) { const r = stack('añadir', c, 0, 'HORIZONTAL'); r.primaryAxisAlignItems = 'MAX'; r.appendChild(BTN('default', 'default', 'Añadir a la lista', 'plus')); }
  const tb = stack('toolbar', c, 4, 'HORIZONTAL'); tb.counterAxisAlignItems = 'CENTER'; tb.primaryAxisAlignItems = 'SPACE_BETWEEN';
  await text('5 productos', 'Caption/Medium', 'muted-foreground', tb);
  const tr = stack('acciones', tb, 4, 'HORIZONTAL'); tr.layoutSizingHorizontal = 'HUG';
  tr.appendChild(BTN('ghost', 'sm', 'Reordenar', 'arrow-up-down')); tr.appendChild(BTN('ghost', 'sm', 'Sin agrupar', 'list'));
  const mc = BTN('outline', 'lg', 'Modo compra', 'store'); c.appendChild(mc); mc.layoutSizingHorizontal = 'FILL';
  const rows = stack('filas', c, 4);
  const group = async (title, slug) => { const h = stack(title, rows, 6, 'HORIZONTAL'); h.counterAxisAlignItems = 'CENTER'; bind(h, 'paddingTop', 'spacing/2'); bind(h, 'paddingBottom', 'spacing/1'); h.appendChild(product(slug, 16)); await text(title, 'Caption/Medium', 'muted-foreground', h).then((t) => { t.fontName = { family: 'Geist', style: 'SemiBold' }; }); };
  const row = (checked, chip, name, slug, total) => { const r = inst(L.row, `checked=${checked}, chip=${chip}`); rows.appendChild(r); r.layoutSizingHorizontal = 'FILL'; const n = r.findOne((x) => x.name === 'name'); n.characters = name; r.findOne((x) => x.name === 'total').characters = total; const pi = r.findOne((x) => x.type === 'INSTANCE' && x.name === 'product-icon'); if (pi) pi.swapComponent(iconsPage.findOne((q) => q.type === 'COMPONENT' && q.name === 'product/' + slug)); };
  await group('Lácteos y huevos', 'leche');
  row('false', 'ahorro', 'Leche entera', 'leche', '= 6 ud'); row('false', 'ninguno', 'Huevos', 'huevo', '= 12 ud');
  await group('Fruta y verdura', 'tomate');
  row('false', 'tienda', 'Tomates', 'tomate', '= 1 kg'); row('false', 'ninguno', 'Plátanos', 'platano', '= 6 ud');
  const cart = stack('en-el-carro', rows, 0); bind(cart, 'paddingTop', 'spacing/4'); bind(cart, 'paddingBottom', 'spacing/1'); await text('En el carro (1)', 'Caption/Medium', 'muted-foreground', cart, { fill: true });
  row('true', 'ninguno', 'Pan de molde', 'pan', '= 1 ud');
  const sg = L.sug.createInstance(); c.appendChild(sg); sg.layoutSizingHorizontal = 'FILL';
}

if (ARGS.screen === 'lista-movil') {
  const s = screen('Lista de la compra · móvil', 390, 'mobile');
  const c = mobileContent(s); c.paddingBottom = 112 + 34 + 88; // pb-28 + pb-fab-over-bar (safe + 22 × 4)
  withActions(c, 'Lista de la compra', []);
  await listaContenido(c, false);
  finishMobile(s, c, { checkout: 'Finalizar compra (1) → inventario' });
  await activate(s, 1);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'lista-escritorio') {
  const s = screen('Lista de la compra · escritorio', 1280, 'desktop');
  const c = desktop(s);
  withActions(c, 'Lista de la compra', []);
  // en escritorio el contenido de la lista no pasa de max-w-lg… no: PageContainer app = un solo ancho; la lista llena el contenedor
  await listaContenido(c, true);
  const bar = stack('CheckoutBar (sticky)', c, 0); bar.strokes = [solid('border')]; bar.strokeTopWeight = 1; bar.strokeBottomWeight = 0; bar.strokeLeftWeight = 0; bar.strokeRightWeight = 0; bind(bar, 'paddingTop', 'spacing/3'); bind(bar, 'paddingBottom', 'spacing/3'); setPaints(bar, 'fills', [['background', 0.95]]);
  const bt = BTN('default', 'lg', 'Finalizar compra (1) → inventario', 'shopping-cart'); bar.appendChild(bt); bt.layoutSizingHorizontal = 'FILL';
  // md: la papelera de cada fila solo aparece con hover o foco; la primera fila la enseña como ejemplo
  c.findOne((n) => n.name === 'filas').children.filter((n) => n.type === 'INSTANCE').forEach((r, i) => { if (i > 0) r.children[r.children.length - 1].opacity = 0; });
  s.resize(1280, Math.max(800, Math.ceil(56 + c.height))); s.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('AppSidebar')).resize(256, s.height);
  await activate(s, 1);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'menus-movil') {
  const s = screen('Menús · móvil', 390, 'mobile');
  const c = mobileContent(s);
  withActions(c, 'Menús', [IB('outline', 'icon', 'book-open'), IB('outline', 'icon', 'ellipsis')]);
  const nav = stack('semana', c, 4, 'HORIZONTAL'); nav.counterAxisAlignItems = 'CENTER';
  nav.appendChild(IB('ghost', 'icon', 'chevron-left'));
  const lbl = stack('etiqueta', nav, 0, 'HORIZONTAL'); lbl.layoutSizingHorizontal = 'FILL'; lbl.primaryAxisAlignItems = 'CENTER'; await text('Semana del 28 de septiembre', 'Body/Small Medium', 'foreground', lbl);
  nav.appendChild(IB('ghost', 'icon', 'chevron-right'));
  // Hoy
  const today = stack('Hoy', c, 8); rad(today, 'radius/xl'); setPaints(today, 'fills', [['card']]); setPaints(today, 'strokes', [['border']]); today.strokeWeight = 1; today.strokeAlign = 'INSIDE'; padX(today, 'spacing/3'); padY(today, 'spacing/3');
  const tt = stack('titulo', today, 4, 'HORIZONTAL'); await text('Hoy', 'Body/Small Medium', 'foreground', tt); await text('· Lunes 28', 'Body/Small', 'muted-foreground', tt);
  const dr = stack('plato', today, 8, 'HORIZONTAL'); dr.counterAxisAlignItems = 'CENTER';
  const dt = stack('texto', dr, 4, 'HORIZONTAL'); dt.layoutSizingHorizontal = 'FILL'; dt.counterAxisAlignItems = 'CENTER'; await text('comida', 'Caption/Default', 'muted-foreground', dt); await text('Lentejas con verduras', 'Body/Small', 'foreground', dt);
  for (const ic of ['chef-hat', 'circle-check', 'circle-x']) { const b = IB('outline', 'icon', ic); dr.appendChild(b); }
  // IA
  const gen = stack('generar', c, 8, 'HORIZONTAL'); gen.counterAxisAlignItems = 'CENTER';
  const ai = inst(L.ai, 'size=lg, state=default'); gen.appendChild(ai); ai.layoutGrow = 1; ai.layoutSizingHorizontal = 'FILL';
  gen.appendChild(IB('outline', 'icon-lg', 'sliders-horizontal'));
  // Semana
  const week = stack('dias', c, 12);
  const DIAS = [['Lunes 28', true, 'Lentejas con verduras', 'Tortilla de patatas'], ['Martes 29', false, 'Arroz con pollo', 'Crema de calabacín'], ['Miércoles 30', false, 'Espaguetis boloñesa', 'Ensalada de garbanzos']];
  for (const [day, isToday, comida, cena] of DIAS) {
    const d = L.dia.createInstance(); week.appendChild(d); d.layoutSizingHorizontal = 'FILL';
    d.findOne((n) => n.name === 'day').characters = day;
    const hoy = d.findOne((n) => n.name === 'hoy'); if (!isToday) { hoy.visible = false; setPaints(d, 'strokes', [['border']]); }
    const platos = d.findAll((n) => n.type === 'INSTANCE' && n.name.startsWith('Plato') || (n.type === 'INSTANCE' && n.findOne && n.findOne((q) => q.name === 'name')));
    const names = d.findAll((n) => n.name === 'name' && n.type === 'TEXT');
    if (names[0]) names[0].characters = comida; if (names[1]) names[1].characters = cena;
    if (!isToday) { for (const p of d.findAll((n) => n.type === 'INSTANCE' && n.findOne((q) => q.name === 'marcar'))) { const pl = await setOf('◆ PATRONES', 'Plato del menú'); p.swapComponent(variant(pl, 'estado=pendiente')); } }
  }
  const cost = stack('coste', c, 4); cost.counterAxisAlignItems = 'CENTER';
  const ct = stack('linea', cost, 4, 'HORIZONTAL'); ct.layoutSizingHorizontal = 'HUG'; await text('Coste estimado de la semana:', 'Caption/Default', 'muted-foreground', ct); await text('≈ 45,20 €', 'Caption/Medium', 'price', ct);
  const add = BTN('outline', 'lg', 'Añadir a la lista lo que falte', 'shopping-cart'); c.appendChild(add); add.layoutSizingHorizontal = 'FILL';
  finishMobile(s, c); const f = s.findAll((n) => n.type === 'INSTANCE' && n.name === 'FAB'); for (const x of f) x.remove(); // /menus no tiene FAB
  await activate(s, 3);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'indice') {
  // Colocar las pantallas en una rejilla con títulos
  const order = [['Inventario · móvil', 'Inventario · móvil · oscuro', 'Lista de la compra · móvil', 'Menús · móvil'], ['Inventario · escritorio', 'Lista de la compra · escritorio']];
  let y = 0; const out = [];
  const oldT = page.findAll((n) => n.name.startsWith('título · ') && n.parent === page); for (const t of oldT) t.remove();
  for (const rowNames of order) { let x = 0, h = 0; for (const n of rowNames) { const s = page.findOne((k) => k.name === n && k.parent === page); if (!s) continue; s.x = x; s.y = y + 48; const t = await text(n, 'Title/Section', 'foreground', page); t.name = 'título · ' + n; t.x = x; t.y = y; x += s.width + 120; h = Math.max(h, s.height); out.push(n); } y += h + 48 + 200; }
  return out;
}
