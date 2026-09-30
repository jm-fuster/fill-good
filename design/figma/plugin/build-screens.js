// build-screens.js — Fase 6: pantallas clave en «◆ PANTALLAS», montadas SOLO con
// instancias de la librería y de los patrones. Son frames (no componentes): una
// pantalla no se reutiliza, se revisa. ARGS.screen:
//   inventario-movil | inventario-escritorio | lista-movil | lista-escritorio | menus-movil | inventario-movil-oscuro
//   pu-crear | pu-pregunta | pu-invitar | pu-lista | pu-inventario | pu-unirse (primer uso)
//   pt-aviso | pt-escanear | pt-analizando | pt-revisar | pt-celebracion | pt-caducidades (primer ticket)
//   rp-despensa-tarjeta | rp-despensa-preguntas | rp-despensa-lista | rp-platos-tarjeta | rp-platos-preguntas
//   rp-platos-descontar | rp-platos-porque (repasos semanales) | indice
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

// ── Primer uso ──────────────────────────────────────────────────────────────
// Alta → /onboarding → /bienvenida → /lista, y /inventario desde la nav; más la
// entrada de quien recibe la invitación (/unirse/[code]). Las tres pantallas de
// alta van FUERA del shell y a pantalla completa: `main mx-auto flex min-h-dvh
// max-w-md flex-col justify-center px-6 py-10`.
const PU = {
  crear: 'Primer uso · 1 · Crear hogar', pregunta: 'Primer uso · 2 · ¿Compartes la compra?', invitar: 'Primer uso · 3 · Invitar',
  lista: 'Primer uso · 4 · Lista vacía', inventario: 'Primer uso · 5 · Inventario vacío', unirse: 'Primer uso · Unirse con invitación',
};
function fullScreen(name) {
  const s = screen(name, 390, 'mobile');
  const m = stack('main', null, 0); s.appendChild(m); m.x = 0; m.y = 0; m.resize(390, 844); m.primaryAxisSizingMode = 'FIXED'; m.primaryAxisAlignItems = 'CENTER';
  padX(m, 'spacing/6'); padY(m, 'spacing/10');
  return { s, m };
}
async function intro(m, title, lead) {
  const h = stack('cabecera', m, 8); h.counterAxisAlignItems = 'CENTER'; bind(h, 'paddingBottom', 'spacing/8'); // mb-8
  const t = await text(title, 'Title/Page', 'foreground', h, { fill: true }); t.textAlignHorizontal = 'CENTER';
  const p = await text(lead, 'Body/Small', 'muted-foreground', h, { fill: true }); p.textAlignHorizontal = 'CENTER';
  return h;
}
const L2 = {
  tabs: await setOf('03 · Navegación', 'Tabs · List'), trig: await setOf('03 · Navegación', 'Tabs · Trigger'),
  label: await setOf('02 · Formularios', 'Label'), input: await setOf('02 · Formularios', 'Input'),
  empty: await setOf('05 · Contenido', 'EmptyState'), sel: await setOf('◆ PATRONES', 'Chip de selección'), fila: await setOf('◆ PATRONES', 'Fila de ajustes'),
};
function tabs(parent, labels, active) {
  const t = inst(L2.tabs, 'variant=default'); parent.appendChild(t); t.layoutSizingHorizontal = 'FILL'; // grid w-full grid-cols-2
  const kids = t.children.filter((k) => k.type === 'INSTANCE');
  kids.forEach((k, i) => { if (i >= labels.length) { k.visible = false; return; } k.swapComponent(variant(L2.trig, `variant=default, state=${i === active ? 'active' : 'default'}`)); k.setProperties({ [P(L2.trig, 'label')]: labels[i] }); k.layoutSizingHorizontal = 'FILL'; });
  return t;
}
async function field(parent, label, { placeholder, value, optional, mono } = {}) {
  const f = stack(label, parent, 8);
  const l = inst(L2.label, 'state=default'); f.appendChild(l); l.setProperties({ [P(L2.label, 'label')]: optional ? `${label} (opcional)` : label });
  if (optional) { const tx = l.findOne((n) => n.type === 'TEXT'); const from = label.length + 1; tx.setRangeFills(from, tx.characters.length, [solid('muted-foreground')]); }
  const i = inst(L2.input, `state=default, filled=${value ? 'true' : 'false'}`); f.appendChild(i); i.layoutSizingHorizontal = 'FILL';
  const pr = {}; if (placeholder) pr[P(L2.input, 'placeholder')] = placeholder; if (value) pr[P(L2.input, 'value')] = value; i.setProperties(pr);
  if (mono) { const tx = i.findOne((n) => n.type === 'TEXT' && n.visible); tx.fontName = { family: 'Geist Mono', style: 'Regular' }; tx.letterSpacing = { value: 10, unit: 'PERCENT' }; } // font-mono tracking-widest uppercase
  return f;
}
function fullBtn(parent, v, size, label, ic, end) { const b = BTN(v, size, label, ic); if (end) b.setProperties({ [P(L.btn, 'icon inline-end#')]: true, [P(L.btn, 'icon inline-end ↳')]: iconComp(end).id }); parent.appendChild(b); b.layoutSizingHorizontal = 'FILL'; return b; }
const HOGAR = 'Casa de los Molina';
// En el primer uso la lista está vacía: la nav no lleva recuento (NavListCount no pinta nada con 0)
// Va DESPUÉS de activate(): cambiar el destino activo devuelve la visibilidad al badge.
const noListCount = (s) => { for (const b of s.findAll((n) => n.type === 'INSTANCE' && n.name === 'badge')) b.visible = false; };

if (ARGS.screen === 'pu-crear' || ARGS.screen === 'pu-unirse') {
  const join = ARGS.screen === 'pu-unirse';
  const { s, m } = fullScreen(join ? PU.unirse : PU.crear);
  await intro(m, join ? 'Únete al hogar' : 'Empieza con tu hogar', join
    ? 'Te han invitado a un hogar en Fill Good. Revisa el código y pulsa «Unirme al hogar» para empezar a compartir inventario y lista de la compra.'
    : 'Crea un hogar nuevo para gestionar tu inventario y tu lista de la compra, o únete al de un familiar con su código de invitación.');
  const t = stack('Tabs', m, 8); tabs(t, ['Crear hogar', 'Unirme'], join ? 1 : 0);
  const form = stack('form', t, 16);
  if (join) { await field(form, 'Código de invitación', { value: '3F9A2B10', mono: true }); await field(form, 'Tu nombre', { placeholder: 'Cómo te verán los demás', optional: true }); fullBtn(form, 'default', 'lg', 'Unirme al hogar', 'log-in'); }
  else { await field(form, 'Nombre del hogar', { placeholder: 'p. ej. Casa de los Molina' }); await field(form, 'Tu nombre', { placeholder: 'Cómo te verán los demás', optional: true }); fullBtn(form, 'default', 'lg', 'Crear mi hogar', 'house'); }
  if (!join) { // mt-10 border-t pt-4 + DeleteAccountRow (supresión sin pasar por Ajustes)
    const w = stack('borrar-cuenta', m, 0); bind(w, 'paddingTop', 'spacing/10');
    const b = stack('border-t', w, 0); b.strokes = [solid('border')]; b.strokeTopWeight = 1; b.strokeBottomWeight = 0; b.strokeLeftWeight = 0; b.strokeRightWeight = 0; b.strokeAlign = 'INSIDE'; bind(b, 'paddingTop', 'spacing/4');
    const r = inst(L2.fila, 'tipo=accion-destructiva'); b.appendChild(r); r.layoutSizingHorizontal = 'FILL';
    r.setProperties({ [P(L2.fila, 'label')]: 'Borrar cuenta', [P(L2.fila, 'hint#')]: false, [P(L2.fila, 'icon')]: iconComp('trash').id });
  }
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pu-pregunta' || ARGS.screen === 'pu-invitar') {
  const yes = ARGS.screen === 'pu-invitar';
  const { s, m } = fullScreen(yes ? PU.invitar : PU.pregunta);
  await intro(m, '¿Compartes la compra con alguien?', `«${HOGAR}» ya está creado. Si hacéis la compra entre varios, la lista se ve y se actualiza en el móvil de cada uno.`);
  if (!yes) {
    const a = stack('respuestas', m, 12); a.counterAxisAlignItems = 'CENTER'; // los dos primeros llenan; «Ahora no» va self-center
    fullBtn(a, 'default', 'lg', 'Sí, con alguien más', 'users');
    fullBtn(a, 'outline', 'lg', 'No, solo yo', 'user');
    const skip = BTN('ghost', 'default', 'Ahora no'); a.appendChild(skip);
    for (const t of skip.findAll((n) => n.type === 'TEXT')) setPaints(t, 'fills', [['muted-foreground']]);
  } else {
    const a = stack('invitar', m, 16);
    await text(`Invita a quien compra contigo: pareja, familia, compañeros de piso… Con el enlace entran directos a «${HOGAR}» y veis la misma lista, al momento. Caduca en 7 días; puedes generar otro en Ajustes.`, 'Body/Small', 'muted-foreground', a, { fill: true });
    const b = stack('enlace', a, 8);
    fullBtn(b, 'default', 'lg', 'Compartir enlace', 'share-2'); // solo si existe navigator.share (móvil)
    fullBtn(b, 'outline', 'lg', 'Copiar enlace', 'copy');
    fullBtn(a, 'ghost', 'lg', 'Seguir a mi lista', null, 'arrow-right');
  }
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pu-lista') {
  const s = screen(PU.lista, 390, 'mobile');
  const c = mobileContent(s);
  withActions(c, 'Lista de la compra', []);
  const e = L2.empty.createInstance(); c.appendChild(e); e.layoutSizingHorizontal = 'FILL';
  e.setProperties({ [P(L2.empty, 'title')]: 'La lista está vacía', [P(L2.empty, 'description')]: 'Marca de una vez todo lo que necesites. Al terminar la compra, lo que marques pasará a tu inventario.', [P(L2.empty, 'icon')]: iconComp('shopping-cart').id, [P(L2.empty, 'action')]: true });
  const act = e.findOne((n) => n.type === 'INSTANCE' && n.name === 'action');
  act.swapComponent(variant(L.btn, 'variant=default, size=lg, state=default'));
  act.setProperties({ [P(L.btn, 'label')]: 'Añadir productos', [P(L.btn, 'icon inline-start#')]: true, [P(L.btn, 'icon inline-start ↳')]: iconComp('plus').id, [P(L.btn, 'icon inline-end#')]: false });
  finishMobile(s, c);
  await activate(s, 1); noListCount(s);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pu-inventario') {
  // El catálogo sembrado al crear el hogar (seed_default_products), agrupado como
  // getStarterCatalog: por sort_order de categoría y por nombre dentro de cada una.
  const CATALOGO = [
    ['Fruta', 'manzana', ['Plátanos', 'Manzanas', 'Naranjas', 'Peras', 'Limones']],
    ['Verdura', 'brocoli', ['Patatas', 'Cebollas', 'Ajos', 'Tomates', 'Zanahorias', 'Pimientos', 'Calabacines', 'Lechuga', 'Pepinos', 'Brócoli']],
    ['Carne', 'carne', ['Pechugas de pollo', 'Carne picada', 'Lomo de cerdo', 'Jamón cocido', 'Jamón serrano']],
    ['Pescado', 'pescado', ['Salmón', 'Merluza']],
    ['Lácteos y huevos', 'leche', ['Leche', 'Huevos', 'Yogures', 'Queso curado', 'Queso rallado', 'Mantequilla', 'Nata para cocinar']],
    ['Panadería', 'pan', ['Pan', 'Pan de molde']],
    ['Despensa', 'conserva', ['Aceite de oliva virgen extra', 'Aceite de girasol', 'Arroz', 'Macarrones', 'Espaguetis', 'Lentejas', 'Garbanzos cocidos', 'Atún en lata', 'Tomate frito', 'Harina de trigo', 'Azúcar', 'Sal', 'Vinagre', 'Café', 'Cacao soluble', 'Cereales', 'Mayonesa', 'Caldo de pollo', 'Pan rallado', 'Miel']],
    ['Congelados', 'hielo', ['Guisantes congelados', 'Gambas congeladas', 'Pizza congelada']],
    ['Bebidas', 'refresco', ['Agua embotellada', 'Zumo de naranja', 'Refrescos', 'Cerveza']],
    ['Snacks y dulces', 'chocolate', ['Galletas', 'Chocolate', 'Patatas fritas', 'Frutos secos']],
    ['Limpieza', 'esponja', ['Papel higiénico', 'Papel de cocina', 'Detergente para la ropa', 'Suavizante', 'Lavavajillas', 'Limpiador multiusos', 'Bolsas de basura', 'Lejía']],
    ['Higiene', 'bote-spray', ['Gel de ducha', 'Champú', 'Pasta de dientes', 'Desodorante', 'Jabón de manos']],
  ];
  const MARCADOS = new Set(['Plátanos', 'Leche', 'Huevos']);
  const s = screen(PU.inventario, 390, 'mobile');
  const c = mobileContent(s);
  withActions(c, 'Inventario', [IB('outline', 'icon', 'rotate-ccw-clock')]);
  const wrap = stack('vacío', c, 24);
  const pick = stack('StarterPicker', wrap, 24); bind(pick, 'paddingBottom', 'spacing/24'); // pb-24: sitio para la barra fija
  const hd = stack('intro', pick, 4);
  await text('¿Qué tienes ya en casa?', 'Title/Base', 'foreground', hd, { fill: true });
  await text('Marca lo que haya ahora mismo; las cantidades las ajustas luego. También puedes escanear un ticket o añadir productos a mano.', 'Body/Small', 'muted-foreground', hd, { fill: true });
  const KL = P(L2.sel, 'label');
  for (const [cat, slug, items] of CATALOGO) {
    const sec = stack(cat, pick, 8);
    const h3 = stack('h3', sec, 6, 'HORIZONTAL'); h3.counterAxisAlignItems = 'CENTER'; h3.appendChild(product(slug, 16)); await text(cat, 'Body/Small Medium', 'muted-foreground', h3);
    const row = stack('chips', sec, 8, 'HORIZONTAL'); row.layoutWrap = 'WRAP'; row.counterAxisSpacing = 8;
    for (const n of [...items].sort((a, b) => a.localeCompare(b, 'es'))) { const ch = inst(L2.sel, `selected=${MARCADOS.has(n)}`); row.appendChild(ch); ch.setProperties({ [KL]: n }); }
  }
  const nudge = stack('escanear', wrap, 6); nudge.counterAxisAlignItems = 'CENTER'; padX(nudge, 'spacing/4'); padY(nudge, 'spacing/4'); rad(nudge, 'radius/xl'); setPaints(nudge, 'strokes', [['border']]); nudge.strokeWeight = 1; nudge.strokeAlign = 'INSIDE'; nudge.dashPattern = [4, 4];
  const np = await text('¿Vienes de la compra? La IA añade los productos y sus precios por ti.', 'Body/Small', 'muted-foreground', nudge, { fill: true }); np.textAlignHorizontal = 'CENTER';
  nudge.appendChild(BTN('outline', 'default', 'O escanea tu primer ticket', 'scan-line'));
  finishMobile(s, c);
  // Barra fija de confirmación: bottom-fab, a la altura del FAB, con su hueco reservado a la derecha
  const fab = s.findOne((n) => n.type === 'INSTANCE' && n.name === 'FAB');
  const bar = stack('confirmar (fixed)', null, 12, 'HORIZONTAL'); s.appendChild(bar); bar.resize(390, 56); bar.layoutSizingVertical = 'HUG'; padX(bar, 'spacing/4');
  const bt = BTN('default', 'lg', `Añadir ${MARCADOS.size} productos`); bar.appendChild(bt); bt.layoutGrow = 1; bt.layoutSizingHorizontal = 'FILL'; bind(bt, 'height', 'spacing/14');
  const lg = (await figma.getLocalEffectStylesAsync()).find((e) => /lg/.test(e.name)); if (lg) await bt.setEffectStyleIdAsync(lg.id);
  const gap = figma.createFrame(); gap.name = 'hueco del FAB'; gap.fills = []; gap.resize(56, 56); bar.appendChild(gap);
  bar.x = 0; bar.y = fab.y;
  s.insertChild(s.children.indexOf(fab), bar); // el FAB queda por encima
  await activate(s, 0); noListCount(s);
  return { screen: s.id, h: Math.round(s.height), shadow: lg && lg.name, fixedIcons: await fixIconColors(s) };
}

// ── Primer ticket ───────────────────────────────────────────────────────────
// /escanear (con el aviso de IA la primera vez) → analizando → /escanear/[id]/
// revisar → (celebración, SOLO si hay algo que contar) → /inventario/revision.
// Un hogar recién creado tiene catálogo sembrado pero NINGÚN nombre de ticket
// aprendido, así que casi todas las líneas caen en «Necesitan decisión».
const PT = {
  aviso: 'Primer ticket · 1 · Antes de usar la IA', escanear: 'Primer ticket · 2 · Escanear', analizando: 'Primer ticket · 3 · Analizando',
  revisar: 'Primer ticket · 4 · Revisar el ticket', celebracion: 'Primer ticket · 5 · Celebración (solo con descuentos)', caducidades: 'Primer ticket · 6 · Revisar caducidades',
};
const L3 = {
  linea: await setOf('◆ PATRONES', 'Línea del ticket'), celebra: await setOf('◆ PATRONES', 'Celebración del ticket'),
  select: await setOf('02 · Formularios', 'Select · Trigger'), sw: await setOf('02 · Formularios', 'Switch'), badge: await setOf('05 · Contenido', 'Badge'),
  modal: await setOf('04 · Overlays', 'ResponsiveModal'), toast: await setOf('04 · Overlays', 'Toast'),
};
const TICKET_HEAD = ['Añadir ticket', 'La IA de Google lee los productos y precios; tú los revisas antes de guardar.'];
function ticketScreen(name) { const s = screen(name, 390, 'mobile'); const c = mobileContent(s); return { s, c }; }
async function endTicket(s, c, { fab = false } = {}) {
  finishMobile(s, c); if (!fab) for (const f of s.findAll((n) => n.type === 'INSTANCE' && n.name === 'FAB')) f.remove(); // /escanear no tiene FAB
  await activate(s, 2); noListCount(s); // «Añadir ticket» es el botón central: ningún destino normal activo
}
function cardFrame(parent, name, gapToken) { const f = stack(name, parent, 16); rad(f, 'radius/xl'); setPaints(f, 'fills', [['card']]); setPaints(f, 'strokes', [['foreground', 0.1]]); f.strokeWeight = 1; f.strokeAlign = 'INSIDE'; if (gapToken) bind(f, 'itemSpacing', gapToken); return f; } // ring-1 ring-foreground/10
async function labeled(parent, label, node) { const f = stack(label, parent, 6); const l = inst(L2.label, 'state=default'); f.appendChild(l); l.setProperties({ [P(L2.label, 'label')]: label }); f.appendChild(node); node.layoutSizingHorizontal = 'FILL'; return f; }
function inputWith(value, placeholder) { const i = inst(L2.input, `state=default, filled=${value ? 'true' : 'false'}`); const pr = {}; if (value) pr[P(L2.input, 'value')] = value; if (placeholder) pr[P(L2.input, 'placeholder')] = placeholder; i.setProperties(pr); return i; }
function line(parent, estado, peso, { name, raw, qty, hint, product, where } = {}) {
  const l = inst(L3.linea, `estado=${estado}, al-peso=${peso}`); parent.appendChild(l); l.layoutSizingHorizontal = 'FILL';
  if (name) l.findOne((n) => n.name === 'nombre').setProperties({ [P(L2.input, 'value')]: name });
  if (qty) l.findOne((n) => n.name === 'cantidad').setProperties({ [P(L2.input, 'value')]: qty });
  if (raw) l.findOne((n) => n.name === 'raw').characters = raw;
  if (hint) l.findOne((n) => n.name === 'hint').characters = hint;
  const sel = l.findOne((n) => n.name === 'producto');
  if (product) sel.findOne((n) => n.name === 'label').characters = product;
  if (where) sel.findOne((n) => n.name === 'ubicacion').characters = where;
  return l;
}
async function reviewContent(c) {
  const { h } = header('Revisar ticket', null, 'Ajusta lo que haga falta y confirma.'); c.appendChild(h); h.layoutSizingHorizontal = 'FILL';
  h.setProperties({ [P(L.ph, 'back#')]: true, [P(L.ph, 'back label')]: 'Añadir ticket' });
  const card = cardFrame(c, 'Datos del ticket'); padY(card, 'spacing/4');
  const ch = stack('header', card, 4); padX(ch, 'spacing/4'); await text('Datos del ticket', 'Title/Card', 'card-foreground', ch, { fill: true });
  const grid = stack('campos (grid-cols-2)', card, 12); padX(grid, 'spacing/4');
  await labeled(grid, 'Tienda', inputWith('Lidl'));
  const sel = inst(L3.select, 'size=default, state=default, filled=true'); sel.setProperties({ [P(L3.select, 'value')]: 'Lidl' }); await labeled(grid, 'Cadena', sel);
  const r = stack('fecha y total', grid, 12, 'HORIZONTAL');
  const f1 = await labeled(r, 'Fecha', inputWith('30/09/2026')); f1.layoutSizingHorizontal = 'FILL';
  const f2 = await labeled(r, 'Total (€)', inputWith('8,41')); f2.layoutSizingHorizontal = 'FILL';
  const prod = stack('productos', c, 8);
  await text('Productos (6 de 6)', 'Body/Small Medium', 'foreground', prod, { fill: true });
  const dec = stack('necesitan decisión', prod, 8); await text('Necesitan decisión (4)', 'Caption/Medium', 'warning', dec, { fill: true });
  line(dec, 'duplicado', 'false', { name: 'Leche entera Milbona', raw: 'LECHE ENTERA MILBONA 1L · 0,89 €' });
  line(dec, 'elegir', 'false');
  line(dec, 'duplicado', 'true');
  line(dec, 'duplicado', 'false', { name: 'Pan de molde integral', raw: 'PAN MOLDE INTEGRAL 460G · 1,45 €', hint: 'Ya tienes «Pan de molde», ¿es el mismo producto?' });
  const ok = stack('asociados', prod, 8); await text('Asociados (2)', 'Caption/Medium', 'muted-foreground', ok, { fill: true });
  line(ok, 'asociada', 'false', { where: '🧊' });
  line(ok, 'asociada', 'false', { name: 'Aceite de girasol', raw: 'ACEITE GIRASOL 1L · 1,89 €', product: 'Aceite de girasol', where: '🧺' });
  const d = stack('descartar', c, 0, 'HORIZONTAL'); d.primaryAxisAlignItems = 'CENTER';
  const del = BTN('ghost', 'default', 'Descartar ticket', 'trash'); d.appendChild(del); for (const t of del.findAll((n) => n.type === 'TEXT')) setPaints(t, 'fills', [['muted-foreground']]); recolor(del.findAll((n) => n.type === 'INSTANCE')[0], 'muted-foreground');
}
// La nav va en z-50 y las barras fijas en z-40: el botón central (absolute -top-5) les pisa 20 px.
const underNav = (s, node) => { const i = s.children.findIndex((n) => n.type === 'INSTANCE' && n.name === 'BottomNav'); if (i >= 0) s.insertChild(i, node); };
function confirmBar(s) { // fixed bottom-16 px-4 pb-safe, encima de la nav
  const b = BTN('default', 'lg', 'Confirmar y añadir al inventario', 'check'); s.appendChild(b); b.resize(358, b.height); b.x = 16; b.y = s.height - 64 - 34 - b.height;
  underNav(s, b);
  return b;
}

if (ARGS.screen === 'pt-aviso' || ARGS.screen === 'pt-escanear' || ARGS.screen === 'pt-analizando') {
  const k = ARGS.screen.slice(3);
  const { s, c } = ticketScreen(PT[k]);
  withActions(c, TICKET_HEAD[0], [], TICKET_HEAD[1]);
  if (k === 'aviso') {
    const card = stack('AiConsentCard', c, 16); padX(card, 'spacing/5'); padY(card, 'spacing/5'); rad(card, 'radius/xl'); setPaints(card, 'fills', [['card']]); setPaints(card, 'strokes', [['border']]); card.strokeWeight = 1; card.strokeAlign = 'INSIDE';
    const hd = stack('titulo', card, 8, 'HORIZONTAL'); hd.counterAxisAlignItems = 'CENTER';
    const ib = stack('icono', hd, 0, 'HORIZONTAL'); ib.layoutSizingHorizontal = 'FIXED'; ib.resize(36, 36); ib.layoutSizingVertical = 'FIXED'; ib.primaryAxisAlignItems = 'CENTER'; ib.counterAxisAlignItems = 'CENTER'; rad(ib, 'radius/lg'); setPaints(ib, 'fills', [['primary', 0.1]]); ib.appendChild(icon('sparkles', 20, 'primary', 'icon'));
    await text('Antes de usar la IA', 'Title/Base', 'foreground', hd);
    const ps = stack('texto', card, 8);
    const BOLD = 'IA de Google (Gemini)';
    const p1 = await text(`Para leer tickets, generar menús y escribir recetas enviamos a la ${BOLD} lo que hace falta: el ticket, tu despensa, tus recetas con sus valoraciones y costes, la lista de la compra, los platos recientes, el presupuesto y las preferencias del menú, incluida una dieta «sin gluten» si la eliges. Es contenido compartido del hogar: viaja también lo que han apuntado los demás.`, 'Body/Small', 'muted-foreground', ps, { fill: true });
    const i = p1.characters.indexOf(BOLD); p1.setRangeFontName(i, i + BOLD.length, { family: 'Geist', style: 'SemiBold' }); p1.setRangeFills(i, i + BOLD.length, [solid('foreground')]);
    await text('Según sus términos, Google no usa lo enviado para mejorar sus productos. Aun así, tapa la zona de la tarjeta del ticket antes de escanearlo. Puedes retirar este permiso cuando quieras en Ajustes.', 'Body/Small', 'muted-foreground', ps, { fill: true });
    const bs = stack('acciones', card, 8); fullBtn(bs, 'default', 'lg', 'Acepto y continúo'); fullBtn(bs, 'ghost', 'default', 'Ver la política de privacidad');
  } else if (k === 'escanear') {
    const bs = stack('ScanForm (móvil)', c, 12);
    fullBtn(bs, 'default', 'lg', 'Escanear ticket', 'scan-line'); fullBtn(bs, 'outline', 'lg', 'Subir imagen o PDF', 'upload');
    await text('Si el ticket es largo o está arrugado, súbelo escaneado en PDF: se lee mejor.', 'Body/Small', 'muted-foreground', bs, { fill: true });
  } else {
    const box = stack('analizando', c, 0); box.counterAxisAlignItems = 'CENTER'; padX(box, 'spacing/6'); padY(box, 'spacing/16'); rad(box, 'radius/xl'); setPaints(box, 'strokes', [['border']]); box.strokeWeight = 1; box.strokeAlign = 'INSIDE'; box.dashPattern = [4, 4];
    box.appendChild(icon('loader-circle', 32, 'primary', 'spinner'));
    const g = figma.createFrame(); g.name = 'mt-4'; g.fills = []; g.resize(1, 16); box.appendChild(g);
    const t = await text('Analizando el ticket…', 'Body/Base Medium', 'foreground', box, { fill: true }); t.textAlignHorizontal = 'CENTER';
    const g2 = figma.createFrame(); g2.name = 'mt-1'; g2.fills = []; g2.resize(1, 4); box.appendChild(g2);
    const p = await text('La IA está leyendo los productos y precios. Puede tardar unos segundos.', 'Body/Small', 'muted-foreground', box, { fill: true }); p.textAlignHorizontal = 'CENTER';
  }
  await endTicket(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pt-revisar') {
  const { s, c } = ticketScreen(PT.revisar);
  await reviewContent(c);
  await endTicket(s, c);
  confirmBar(s);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pt-celebracion') {
  // La revisión debajo (primer viewport) y encima el bottom sheet de SavingsCelebration
  const { s, c } = ticketScreen(PT.celebracion);
  await reviewContent(c);
  await endTicket(s, c); confirmBar(s);
  s.resize(390, 844); // el overlay tapa la pantalla visible, no la página entera
  for (const n of s.children) if (n.type === 'INSTANCE' && n.name === 'BottomNav') n.y = 844 - n.height;
  const ov = figma.createFrame(); ov.name = 'overlay'; ov.resize(390, 844); setPaints(ov, 'fills', [['component/modal/overlay']]); ov.effects = [{ type: 'BACKGROUND_BLUR', radius: 4, visible: true }]; s.appendChild(ov);
  const m = inst(L3.modal, 'viewport=mobile, footer=default'); s.appendChild(m);
  m.findOne((n) => n.name === 'header').visible = false; // la cabecera va dentro del cuerpo: el icono va ENCIMA del título
  m.findOne((n) => n.type === 'INSTANCE' && n.name === 'content').swapComponent(L3.celebra);
  const btns = m.findOne((n) => n.name === 'footer').children.filter((n) => n.type === 'INSTANCE');
  btns[0].setProperties({ [P(L.btn, 'label')]: 'Continuar' }); for (const b of btns.slice(1)) b.visible = false;
  m.x = 0; m.y = 844 - m.height;
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pt-caducidades') {
  const { s, c } = ticketScreen(PT.caducidades);
  withActions(c, 'Revisar caducidades', [], 'Pon fecha a lo que acabas de comprar o márcalo para consumir pronto. Todo es opcional: puedes omitir.');
  const body = stack('ExpiryReview', c, 12); bind(body, 'paddingBottom', 'spacing/32');
  await text('Si tienes varios de un producto, pon la fecha del que caduque antes.', 'Body/Small', 'muted-foreground', body, { fill: true });
  const ul = stack('lista', body, 8);
  const ITEMS = [['Leche entera Milbona', 'leche', '1 ud', '🧺 Despensa'], ['Tomate triturado', 'tomate', '1 ud', '🧺 Despensa'], ['Plátanos', 'platano', '1,12 kg', '🧺 Despensa'], ['Pan de molde integral', 'pan', '1 ud', '🧺 Despensa'], ['Huevos', 'huevo', '1 ud', '🧊 Nevera'], ['Aceite de girasol', 'aceite', '1 ud', '🧺 Despensa']];
  for (const [name, slug, qty, where] of ITEMS) {
    const li = stack(name, ul, 12); padX(li, 'spacing/3'); padY(li, 'spacing/3'); rad(li, 'radius/xl'); setPaints(li, 'fills', [['card']]); setPaints(li, 'strokes', [['border']]); li.strokeWeight = 1; li.strokeAlign = 'INSIDE';
    const top = stack('producto', li, 12, 'HORIZONTAL'); top.counterAxisAlignItems = 'CENTER';
    const ib = stack('icono', top, 0, 'HORIZONTAL'); ib.layoutSizingHorizontal = 'FIXED'; ib.resize(40, 40); ib.layoutSizingVertical = 'FIXED'; ib.primaryAxisAlignItems = 'CENTER'; ib.counterAxisAlignItems = 'CENTER'; rad(ib, 'radius/lg'); setPaints(ib, 'fills', [['muted']]); ib.appendChild(product(slug, 24));
    const tx = stack('texto', top, 2); tx.layoutSizingHorizontal = 'FILL';
    await text(name, 'Body/Base Medium', 'foreground', tx, { fill: true });
    const meta = stack('meta', tx, 6, 'HORIZONTAL'); meta.counterAxisAlignItems = 'CENTER'; await text(qty, 'Body/Small', 'muted-foreground', meta);
    const b = inst(L3.badge, 'variant=secondary'); meta.appendChild(b); b.setProperties({ [P(L3.badge, 'label')]: where });
    const pk = stack('Caducidad', li, 8); const lb = inst(L2.label, 'state=default'); pk.appendChild(lb); lb.setProperties({ [P(L2.label, 'label')]: 'Caducidad' });
    const pr = stack('atajos', pk, 8, 'HORIZONTAL'); pr.layoutWrap = 'WRAP'; pr.counterAxisSpacing = 8; for (const p of ['+3 días', '+1 semana', '+1 mes']) pr.appendChild(BTN('outline', 'default', p));
    const di = inputWith(null, 'dd/mm/aaaa'); pk.appendChild(di); di.layoutSizingHorizontal = 'FILL';
    const sw = stack('consumir pronto', li, 12, 'HORIZONTAL'); sw.primaryAxisAlignItems = 'SPACE_BETWEEN'; sw.counterAxisAlignItems = 'CENTER'; padX(sw, 'spacing/2_5'); padY(sw, 'spacing/2_5'); rad(sw, 'radius/lg'); setPaints(sw, 'strokes', [['border']]); sw.strokeWeight = 1; sw.strokeAlign = 'INSIDE';
    const sl = inst(L2.label, 'state=default'); sw.appendChild(sl); sl.setProperties({ [P(L2.label, 'label')]: 'Consumir pronto' }); sl.findOne((n) => n.type === 'TEXT').fontName = { family: 'Geist', style: 'Regular' }; // font-normal
    sw.appendChild(inst(L3.sw, 'size=default, state=default, checked=false'));
  }
  await endTicket(s, c);
  // Barra fija bottom-16: border-t bg-background/95 px-4 pt-3 pb-safe, Omitir + Guardar (flex-1 los dos por debajo de sm)
  const bar = stack('acciones (fixed)', null, 8, 'HORIZONTAL'); s.appendChild(bar); bar.resize(390, 10); bar.layoutSizingVertical = 'HUG'; padX(bar, 'spacing/4'); bind(bar, 'paddingTop', 'spacing/3'); bar.paddingBottom = 34;
  setPaints(bar, 'fills', [['background', 0.95]]); bar.strokes = [solid('border')]; bar.strokeTopWeight = 1; bar.strokeBottomWeight = 0; bar.strokeLeftWeight = 0; bar.strokeRightWeight = 0; bar.strokeAlign = 'INSIDE';
  for (const [v, l, ic] of [['outline', 'Omitir'], ['default', 'Guardar', 'check']]) { const b = BTN(v, 'lg', l, ic); bar.appendChild(b); b.layoutGrow = 1; b.layoutSizingHorizontal = 'FILL'; }
  bar.x = 0; bar.y = s.height - 64 - bar.height;
  underNav(s, bar);
  // El toast de confirmar el ticket (sonner, top-center) aparece al llegar aquí
  const t = inst(L3.toast, 'type=success'); s.appendChild(t); t.setProperties({ [P(L3.toast, 'title')]: '6 productos añadidos al inventario' }); t.x = (390 - t.width) / 2; t.y = 16;
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

// ── Repasos semanales ───────────────────────────────────────────────────────
// Las dos tarjetas del shell (mb-4 encima del <h1> de cualquier página) y sus
// modales. Nunca salen las dos a la vez: cede la despensa (hasta YIELD_MAX_DAYS).
const RP = {
  dTarjeta: 'Repasos · 1 · Despensa: la tarjeta', dPreguntas: 'Repasos · 2 · Despensa: preguntas', dLista: 'Repasos · 3 · Despensa: ¿lo apuntamos?',
  pTarjeta: 'Repasos · 4 · Platos: la tarjeta', pPreguntas: 'Repasos · 5 · Platos: preguntas', pDescontar: 'Repasos · 6 · Platos: descontar', pPorQue: 'Repasos · 7 · Platos: ¿por qué no?',
};
const L4 = {
  tarjeta: await setOf('◆ PATRONES', 'Tarjeta de repaso'), pd: await setOf('◆ PATRONES', 'Pregunta de despensa'), pp: await setOf('◆ PATRONES', 'Pregunta de plato'),
  cb: await setOf('02 · Formularios', 'Checkbox'),
};
function reviewCard(parent, tipo, title, description) { const t = inst(L4.tarjeta, 'tipo=' + tipo); parent.appendChild(t); t.layoutSizingHorizontal = 'FILL'; t.setProperties({ [P(L4.tarjeta, 'title')]: title, [P(L4.tarjeta, 'description')]: description }); return t; }
async function pageListaConRepaso(name) {
  const s = screen(name, 390, 'mobile'); const c = mobileContent(s); c.paddingBottom = 112 + 34 + 88;
  reviewCard(c, 'despensa', '¿Repasamos la despensa?', '8 productos que llevan tiempo sin mirarse. Un toque cada uno.');
  withActions(c, 'Lista de la compra', []); await listaContenido(c, false);
  finishMobile(s, c, { checkout: 'Finalizar compra (1) → inventario' }); await activate(s, 1);
  return s;
}
async function pageInventarioConRepaso(name) {
  const s = screen(name, 390, 'mobile'); const c = mobileContent(s);
  reviewCard(c, 'platos', '¿Qué tal estos días?', 'Tenías 3 platos planificados.');
  withActions(c, 'Inventario', [IB('outline', 'icon', 'rotate-ccw-clock')]);
  const se = inst(L.search, 'filled=false'); c.appendChild(se); se.layoutSizingHorizontal = 'FILL';
  await chips(c, [['Caducan pronto', 1, 'inactivo'], ['Caducados', 1, 'inactivo'], ['Agotados', 1, 'inactivo'], ['Quedan pocas', 1, 'inactivo']], false);
  const secs = stack('secciones', c, 24); await section(secs, '🧊', 'Nevera', 4, true, NEVERA, 1); await section(secs, '🧺', 'Despensa', 3, false, DESPENSA, 1);
  finishMobile(s, c); await activate(s, 0);
  return s;
}
// Contenido del hueco de ResponsiveModal para UNA pantalla: un componente local en
// la sección «Contenidos de modal», que el sheet recibe por instance swap. Lleva
// también el pie, porque cada repaso pone el suyo (el del componente se oculta).
function modalSlot(name) {
  let holder = page.findOne((n) => n.name === 'Contenidos de modal (slots)' && n.parent === page);
  if (!holder) { holder = stack('Contenidos de modal (slots)', null, 40, 'HORIZONTAL'); page.appendChild(holder); holder.x = -3000; holder.y = 0; holder.primaryAxisSizingMode = 'AUTO'; holder.counterAxisSizingMode = 'AUTO'; }
  for (const o of holder.findAll((n) => n.type === 'COMPONENT' && n.name === '_Contenido · ' + name)) o.remove();
  const k = figma.createComponent(); k.name = '_Contenido · ' + name; k.layoutMode = 'VERTICAL'; k.primaryAxisSizingMode = 'AUTO'; k.counterAxisSizingMode = 'FIXED'; k.resize(390, 10); k.primaryAxisSizingMode = 'AUTO'; k.fills = []; k.itemSpacing = 0; k.clipsContent = false;
  holder.appendChild(k);
  k.description = `Hueco de ResponsiveModal para «${name}» (◆ PANTALLAS). Montado con instancias; el pie va aquí porque cada repaso lleva el suyo.`;
  return k;
}
function modalFooter(k) { const f = stack('pie del repaso', k, 8); padX(f, 'spacing/4'); padY(f, 'spacing/4'); return f; }
async function sheetOver(s, slot, title, description) {
  const m = inst(L3.modal, 'viewport=mobile, footer=default');
  m.setProperties({ [P(L3.modal, 'title')]: title, [P(L3.modal, 'description')]: description });
  m.findOne((n) => n.type === 'INSTANCE' && n.name === 'content').swapComponent(slot);
  m.children.find((n) => n.name === 'footer').visible = false; // el del componente, no el del hueco
  // El sheet mide como mucho el 80 % del alto (max-h-80dvh) y hace scroll: aquí se
  // enseña entero, alargando la pantalla si hace falta.
  const oldH = s.height, H = Math.max(844, Math.ceil(m.height + 169));
  s.resize(390, H); for (const n of s.children) if (n.type === 'INSTANCE' && (n.name === 'BottomNav' || n.name === 'FAB') || n.name === 'CheckoutBar') n.y = H - (oldH - n.y);
  const ov = figma.createFrame(); ov.name = 'overlay'; ov.resize(390, H); setPaints(ov, 'fills', [['component/modal/overlay']]); ov.effects = [{ type: 'BACKGROUND_BLUR', radius: 4, visible: true }]; s.appendChild(ov);
  s.appendChild(m); m.x = 0; m.y = H - m.height;
  return m;
}
function toastOn(s, title) { const t = inst(L3.toast, 'type=success'); s.appendChild(t); t.setProperties({ [P(L3.toast, 'title')]: title }); t.x = (390 - t.width) / 2; t.y = 16; return t; }
const DESPENSA_REPASO = [['Nevera', [['Yogures', 'yogur', '4 ud'], ['Mantequilla', 'mantequilla', '250 g'], ['Queso rallado', 'queso', '200 g']]], ['Congelador', [['Guisantes congelados', 'guisantes', '400 g']]], ['Despensa', [['Arroz', 'arroz', '1 kg'], ['Aceite de oliva virgen extra', 'aceite', '1 l'], ['Café', 'cafe', '250 g'], ['Tomate frito', 'tomate', '2 ud']]]];
function pd(parent, estado, [name, slug, qty]) { const i = inst(L4.pd, 'estado=' + estado); parent.appendChild(i); i.layoutSizingHorizontal = 'FILL'; i.setProperties({ [P(L4.pd, 'name')]: name, [P(L4.pd, 'qty')]: qty, [P(L4.pd, 'producto')]: prod(slug) }); return i; }
function pp(parent, estado, slot, name) { const i = inst(L4.pp, 'estado=' + estado); parent.appendChild(i); i.layoutSizingHorizontal = 'FILL'; i.setProperties({ [P(L4.pp, 'slot')]: slot, [P(L4.pp, 'name')]: name }); return i; }
async function silenceRow(f, kind) {
  if (kind === 'despensa') { // mr-auto flex flex-wrap gap-1, ghost sm: solo mientras no se ha contestado nada
    const r = stack('silencios', f, 4, 'HORIZONTAL'); r.layoutWrap = 'WRAP'; r.counterAxisSpacing = 4; for (const l of ['No esta semana', 'No volver a preguntar']) r.appendChild(BTN('ghost', 'sm', l));
  } else { // flex gap-2, ghost por defecto con text-xs y flex-1
    const r = stack('silencios', f, 8, 'HORIZONTAL'); for (const l of ['Silenciar esta semana', 'No volver a preguntar']) { const b = BTN('ghost', 'default', l); r.appendChild(b); b.layoutSizingHorizontal = 'FILL'; bind(b.findOne((n) => n.type === 'TEXT'), 'fontSize', 'font-size/xs'); }
  }
}
// Lista de platos pendientes: max-h-[55vh] con scroll propio (464 px en 844)
async function platosList(k, rows) {
  const ul = stack('pendientes (max-h 55vh, scroll)', k, 16); padX(ul, 'spacing/4');
  let day = null, g = null;
  for (const [d, estado, slot, name] of rows) { if (d !== day) { day = d; g = stack(d, ul, 8); await text(d, 'Caption/Medium', 'muted-foreground', g, { fill: true }); } pp(g, estado, slot, name); }
  if (ul.height > 464) { ul.layoutSizingVertical = 'FIXED'; ul.resize(390, 464); ul.clipsContent = true; }
  return ul;
}
async function platosFooter(k) { const f = modalFooter(k); const cl = BTN('ghost', 'default', 'Cerrar'); f.appendChild(cl); cl.layoutSizingHorizontal = 'FILL'; await silenceRow(f, 'platos'); }
const PLATOS = (state) => [['Lunes 28', state.lunes ?? 'pendiente', 'Cena', 'Crema de calabacín'], ['Ayer', state.comida ?? 'pendiente', 'Comida', 'Arroz con pollo'], ['Ayer', 'pendiente', 'Cena', 'Tortilla de patatas']];

if (ARGS.screen === 'rp-despensa-tarjeta') { const s = await pageListaConRepaso(RP.dTarjeta); return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) }; }
if (ARGS.screen === 'rp-platos-tarjeta') { const s = await pageInventarioConRepaso(RP.pTarjeta); return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) }; }

if (ARGS.screen === 'rp-despensa-preguntas') {
  const k = modalSlot('Repaso de despensa · preguntas');
  const body = stack('grupos', k, 16); padX(body, 'spacing/4');
  for (const [loc, items] of DESPENSA_REPASO) { const sec = stack(loc, body, 8); await text(loc, 'Caption/Medium', 'muted-foreground', sec, { fill: true }); const ul = stack('filas', sec, 8); for (const it of items) pd(ul, 'pendiente', it); }
  const f = modalFooter(k); const cl = BTN('ghost', 'default', 'Cerrar'); f.appendChild(cl); cl.layoutSizingHorizontal = 'FILL'; await silenceRow(f, 'despensa');
  const s = await pageListaConRepaso(RP.dPreguntas);
  await sheetOver(s, k, 'Repaso de despensa', '¿Te queda de esto? Un toque por producto.');
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'rp-despensa-lista') {
  const k = modalSlot('Repaso de despensa · ¿lo apuntamos?');
  const body = stack('a la lista', k, 12); padX(body, 'spacing/4');
  const ul = stack('filas', body, 8);
  for (const [n, recap] of [['Mantequilla', 'Se ha agotado'], ['Guisantes congelados', 'Te queda poco'], ['Café', 'Te queda poco']]) {
    const li = stack(n, ul, 12, 'HORIZONTAL'); li.counterAxisAlignItems = 'MIN'; padX(li, 'spacing/3'); padY(li, 'spacing/3'); rad(li, 'radius/xl'); setPaints(li, 'strokes', [['border']]); li.strokeWeight = 1; li.strokeAlign = 'INSIDE';
    const cw = stack('check', li, 0, 'HORIZONTAL'); cw.layoutSizingHorizontal = 'HUG'; bind(cw, 'paddingTop', 'spacing/0_5'); const box = inst(L4.cb, 'state=default, checked=true'); cw.appendChild(box); box.rescale(20 / 16);
    const lb = stack('label', li, 4); lb.layoutSizingHorizontal = 'FILL'; await text(n, 'Body/Small Medium', 'foreground', lb, { fill: true }); await text(recap, 'Caption/Default', 'muted-foreground', lb, { fill: true });
  }
  const f = stack('footer (px-0)', body, 8); padY(f, 'spacing/4'); // ResponsiveModalFooter className="gap-2 px-0", dentro del cuerpo
  fullBtn(f, 'default', 'default', 'Apuntar en la lista', 'shopping-cart'); fullBtn(f, 'ghost', 'default', 'Volver', 'chevron-left');
  const s = await pageListaConRepaso(RP.dLista);
  await sheetOver(s, k, '¿Lo apuntamos?', 'Lo que se ha acabado o queda poco, a la lista de la compra.');
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'rp-platos-preguntas' || ARGS.screen === 'rp-platos-descontar' || ARGS.screen === 'rp-platos-porque') {
  const kind = ARGS.screen.slice(10);
  const k = modalSlot('Repaso de platos · ' + (kind === 'porque' ? '¿por qué no?' : kind));
  const ul = await platosList(k, PLATOS(kind === 'preguntas' ? { comida: 'no-abierto' } : kind === 'descontar' ? { comida: 'descontar' } : { lunes: 'por-que' }));
  if (kind === 'descontar') { // los ingredientes del arroz con pollo, no los del ejemplo del patrón
    const row = ul.findAll((n) => n.type === 'INSTANCE' && n.name.startsWith('Pregunta de plato') || (n.type === 'INSTANCE' && n.findOne && n.findOne((q) => q.name === 'descontables'))).find((n) => n.findOne((q) => q.name === 'descontables'));
    const lines = row.findOne((q) => q.name === 'descontables').children;
    const DATA = [['Arroz', 'Tienes 1 kg', '0,3', 'kg'], ['Pechugas de pollo', 'Tienes 0,5 kg', '0,4', 'kg'], ['Pimientos', 'Tienes 3 ud', '1', 'ud']];
    lines.forEach((li, i) => { const [n, have, q, u] = DATA[i]; const ts = li.findAll((x) => x.type === 'TEXT' && x.parent.name !== 'cantidad' && !x.parent.name.startsWith('Input') && x.parent.type !== 'INSTANCE'); ts[0].characters = n; ts[1].characters = have; li.findOne((x) => x.type === 'INSTANCE' && x.parent.name === 'cantidad').setProperties({ [P(L2.input, 'value')]: q }); li.findOne((x) => x.type === 'TEXT' && x.parent.name === 'cantidad').characters = u; });
    const inf = row.findOne((q) => q.name === 'Aceite de oliva'); const it = inf.findAll((x) => x.type === 'TEXT'); it[0].characters = 'Caldo de pollo'; it[1].characters = 'No te queda en el inventario';
  }
  await platosFooter(k);
  const s = await pageInventarioConRepaso(RP[kind === 'preguntas' ? 'pPreguntas' : kind === 'descontar' ? 'pDescontar' : 'pPorQue']);
  await sheetOver(s, k, 'Repaso de platos', '¿Llegaste a cocinar lo que tenías planificado?');
  if (kind === 'descontar') toastOn(s, 'Marcado como cocinado');
  if (kind === 'porque') toastOn(s, 'Anotado: no se hizo');
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'indice') {
  // Colocar las pantallas en una rejilla con títulos
  const order = [['Inventario · móvil', 'Inventario · móvil · oscuro', 'Lista de la compra · móvil', 'Menús · móvil'], ['Inventario · escritorio', 'Lista de la compra · escritorio'], [PU.crear, PU.pregunta, PU.invitar, PU.lista, PU.inventario, PU.unirse], [PT.aviso, PT.escanear, PT.analizando, PT.revisar, PT.celebracion, PT.caducidades], [RP.dTarjeta, RP.dPreguntas, RP.dLista, RP.pTarjeta, RP.pPreguntas, RP.pDescontar, RP.pPorQue]];
  let y = 0; const out = [];
  const oldT = page.findAll((n) => n.name.startsWith('título · ') && n.parent === page); for (const t of oldT) t.remove();
  for (const rowNames of order) { let x = 0, h = 0; for (const n of rowNames) { const s = page.findOne((k) => k.name === n && k.parent === page); if (!s) continue; s.x = x; s.y = y + 48; const t = await text(n, 'Title/Section', 'foreground', page); t.name = 'título · ' + n; t.x = x; t.y = y; x += s.width + 120; h = Math.max(h, s.height); out.push(n); } y += h + 48 + 200; }
  return out;
}
