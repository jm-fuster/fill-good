// build-screens.js — Fase 6: pantallas clave en «◆ PANTALLAS», montadas SOLO con
// instancias de la librería y de los patrones. Son frames (no componentes): una
// pantalla no se reutiliza, se revisa. ARGS.screen:
//   inventario-movil | inventario-escritorio | lista-movil | lista-escritorio | menus-movil | inventario-movil-oscuro
//   pu-crear | pu-pregunta | pu-invitar | pu-lista | pu-inventario | pu-unirse (primer uso)
//   pt-aviso | pt-escanear | pt-analizando | pt-revisar | pt-celebracion | pt-caducidades (primer ticket)
//   rp-despensa-tarjeta | rp-despensa-preguntas | rp-despensa-lista | rp-platos-tarjeta | rp-platos-preguntas
//   rp-platos-descontar | rp-platos-porque (repasos semanales)
//   rc-vacio | rc-lista | rc-receta | ck-antes | ck-paso | ck-final | menus-escritorio
//   pr-vacio | pr-lista | pr-producto | rs-cerrado | rs-primer-mes | pf-nuevo | pf-ahorro
//   aj-indice | aj-hogar | lg-movil | lg-escritorio | ld-movil | ld-escritorio
//   es-abriendo | es-encuadre | es-detectado | es-ajuste | es-sin-camara (escáner de documentos)
//   mc-comprando | mc-quitar | mc-todo | mc-vacia | mc-escritorio (modo compra)
//   inv-anadir | inv-anadir-ajustes | inv-ficha | inv-ficha-ajustes | inv-icono (modales de inventario)
//   ls-anadir | ls-buscar | ls-editar | ls-orden | ls-escritorio (modales de la lista)
//   mn-nuevo | mn-plato | mn-mover | mn-faltan | mn-descontar | mn-hoy | mn-ajustes | mn-rehacer (modales de menús) | indice
//   Con ARGS.desk = true, pt-escanear, pt-revisar, rc-lista, pr-lista, pr-producto, rs-cerrado, pf-ahorro y aj-indice
//   salen en escritorio («… · escritorio»)
// Un índice por página, hecho una vez por ejecución: con un findOne por componente,
// «◆ PANTALLAS» (miles de nodos) y «◆ PATRONES» se recorrían enteras en cada una de las
// decenas de búsquedas del principio, y cada pantalla pasaba de 30 s antes de empezar.
const __sets = {};
async function setOf(pageName, name) {
  let m = __sets[pageName];
  if (!m) {
    const p = figma.root.children.find((x) => x.name === pageName); await p.loadAsync(); m = new Map();
    for (const k of p.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })) if (!(k.type === 'COMPONENT' && k.parent.type === 'COMPONENT_SET') && !m.has(k.name)) m.set(k.name, k);
    __sets[pageName] = m;
  }
  const n = m.get(name); if (!n || n.removed) throw new Error('Falta ' + name); return n;
}
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
// ARGS.desk: el mismo bloque de una pantalla móvil la monta en escritorio (1280 px, sidebar
// de 256 y columna de 960, que es lo que queda del PageContainer «app» a ese ancho: su
// max-w-5xl/6xl no llega a actuar). El nombre gana « · escritorio». Solo toca las piezas
// comunes (screen, mobileContent, finishMobile, confirmBar); lo que cambia de verdad en
// cada pantalla va en su bloque, detrás de `if (DESK)`.
const DESK = !!ARGS.desk;
const DESK_W = 960;
function screen(name, w, mode) {
  if (DESK && w === 390) { name = name + ' · escritorio'; w = 1280; mode = 'desktop'; }
  const old = page.children.find((n) => n.name === name); if (old) old.remove(); // hijos directos: el árbol entero son decenas de miles de nodos
  const s = figma.createFrame(); s.name = name; s.resize(w, 844); s.clipsContent = true; setPaints(s, 'fills', [['background']]);
  page.appendChild(s);
  s.setExplicitVariableModeForCollection(bpCol, bpCol.modes[mode === 'desktop' ? 1 : 0].modeId);
  return s;
}
function col(parent, name, gap) { const f = stack(name, parent, gap); return f; }
function mobileContent(s) { if (DESK) return desktop(s); const c = stack('contenido', null, 16); s.appendChild(c); c.x = 0; c.y = 0; c.resize(390, 10); c.layoutSizingVertical = 'HUG'; padX(c, 'spacing/4'); bind(c, 'paddingTop', 'spacing/4'); c.paddingBottom = 112 + 82; return c; } // pb-28 del shell + pb-fab de la lista (safe 34 + 48): el FAB nunca tapa la última tarjeta
function finishMobile(s, content, { checkout } = {}) {
  if (DESK) { deskFinish(s, content); return; }
  const H = Math.max(844, Math.ceil(content.height)); s.resize(390, H);
  const b = L.bar.createInstance(); s.appendChild(b); b.x = 0; b.y = H - b.height;
  if (checkout) { const wrap = stack('CheckoutBar', null, 0); s.appendChild(wrap); wrap.resize(390, 10); wrap.layoutSizingVertical = 'HUG'; padX(wrap, 'spacing/4'); const bt = BTN('default', 'lg', checkout, 'shopping-cart'); wrap.appendChild(bt); bt.layoutSizingHorizontal = 'FILL'; bt.effects = []; wrap.x = 0; wrap.y = H - 64 - 34 - wrap.height; }
  const f = L.fab.createInstance(); s.appendChild(f); f.x = 390 - 16 - 56; f.y = H - 34 - (checkout ? 112 : 64) - 16 - 56;
}
// En escritorio la pantalla mide lo que su contenido (con 900 de mínimo) y el sidebar la acompaña
function deskFinish(s, content) {
  const H = Math.max(900, Math.ceil(56 + content.height)); s.resize(1280, H);
  const side = s.children.find((n) => n.type === 'INSTANCE' && n.name.startsWith('AppSidebar')); if (side) side.resize(256, H);
}
// Una acción a la derecha del PageHeader que ya está en la columna (el primer hijo)
function deskHeaderAction(c, btn) {
  const h = c.children[0]; const wrap = stack('cabecera', null, 16, 'HORIZONTAL'); c.insertChild(0, wrap); wrap.layoutSizingHorizontal = 'FILL'; wrap.layoutSizingVertical = 'HUG'; wrap.counterAxisAlignItems = 'MIN';
  wrap.appendChild(h); h.layoutSizingHorizontal = 'FILL'; wrap.appendChild(btn);
}
// Rejilla de n columnas (md:grid-cols-n) a partir de un stack vertical: sus hijos pasan a
// ancho fijo y el stack a fila con salto de línea
function deskGrid(stackNode, cols, gap = 12, from = 0) {
  const kids = stackNode.children.slice(from); const w = Math.floor((DESK_W - gap * (cols - 1)) / cols);
  const g = stack('md:grid-cols-' + cols, null, gap, 'HORIZONTAL'); stackNode.insertChild(from, g); g.layoutSizingHorizontal = 'FILL'; g.layoutSizingVertical = 'HUG'; g.layoutWrap = 'WRAP'; g.counterAxisSpacing = gap;
  for (const k of kids) { g.appendChild(k); k.layoutSizingHorizontal = 'FIXED'; k.resize(w, k.height); if ('layoutSizingVertical' in k && k.layoutMode && k.layoutMode !== 'NONE') k.layoutSizingVertical = 'HUG'; }
  return g;
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

// La pantalla de /menus en móvil, también de fondo para sus modales
async function pageMenus(name) {
  const s = screen(name, 390, 'mobile');
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
  const dt = stack('texto', dr, 4, 'HORIZONTAL'); dt.layoutSizingHorizontal = 'FILL'; dt.counterAxisAlignItems = 'CENTER'; await text('Comida', 'Caption/Default', 'muted-foreground', dt); await text('Lentejas con verduras', 'Body/Small', 'foreground', dt);
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
  return s;
}
if (ARGS.screen === 'menus-movil') {
  const s = await pageMenus('Menús · móvil');
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
  const grid = stack(DESK ? 'campos (sm:grid-cols-3)' : 'campos (grid-cols-2)', card, 12); padX(grid, 'spacing/4');
  if (DESK) {
    // Tienda | Cadena | Fecha en la primera fila y Total SOLO en la segunda: el comentario de
    // receipt-review.tsx:727 cuenta tres campos, y son cuatro
    const r1 = stack('fila 1', grid, 12, 'HORIZONTAL'), r2 = stack('fila 2', grid, 12, 'HORIZONTAL');
    (await labeled(r1, 'Tienda', inputWith('Lidl'))).layoutSizingHorizontal = 'FILL';
    const sel = inst(L3.select, 'size=default, state=default, filled=true'); sel.setProperties({ [P(L3.select, 'value')]: 'Lidl' }); (await labeled(r1, 'Cadena', sel)).layoutSizingHorizontal = 'FILL';
    (await labeled(r1, 'Fecha', inputWith('30/09/2026'))).layoutSizingHorizontal = 'FILL';
    const tf = await labeled(r2, 'Total (€)', inputWith('8,41')); tf.layoutSizingHorizontal = 'FIXED'; tf.resize(Math.floor((DESK_W - 32 - 24) / 3), tf.height);
  } else {
  await labeled(grid, 'Tienda', inputWith('Lidl'));
  const sel = inst(L3.select, 'size=default, state=default, filled=true'); sel.setProperties({ [P(L3.select, 'value')]: 'Lidl' }); await labeled(grid, 'Cadena', sel);
  const r = stack('fecha y total', grid, 12, 'HORIZONTAL');
  const f1 = await labeled(r, 'Fecha', inputWith('30/09/2026')); f1.layoutSizingHorizontal = 'FILL';
  const f2 = await labeled(r, 'Total (€)', inputWith('8,41')); f2.layoutSizingHorizontal = 'FILL';
  }
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
  if (DESK) { deskGrid(dec, 2, 12, 1); deskGrid(ok, 2, 12, 1); } // md:grid md:grid-cols-2 md:items-start: sin igualar alturas
  const d = stack('descartar', c, 0, 'HORIZONTAL'); d.primaryAxisAlignItems = 'CENTER';
  const del = BTN('ghost', 'default', 'Descartar ticket', 'trash'); d.appendChild(del); for (const t of del.findAll((n) => n.type === 'TEXT')) setPaints(t, 'fills', [['muted-foreground']]); recolor(del.findAll((n) => n.type === 'INSTANCE')[0], 'muted-foreground');
}
// La nav va en z-50 y las barras fijas en z-40: el botón central (absolute -top-5) les pisa 20 px.
const underNav = (s, node) => { const i = s.children.findIndex((n) => n.type === 'INSTANCE' && n.name === 'BottomNav'); if (i >= 0) s.insertChild(i, node); };
function confirmBar(s) { // fixed bottom-16 px-4 pb-safe, encima de la nav
  if (DESK) { // md:sticky md:bottom-0 md:border-t md:bg-background/95 md:pt-3 md:pb-3, al final del flujo
    const c = s.children.find((n) => n.name === 'contenido');
    const bar = stack('barra de confirmar (md:sticky bottom-0)', c, 0); bind(bar, 'paddingTop', 'spacing/3'); bind(bar, 'paddingBottom', 'spacing/3'); setPaints(bar, 'fills', [['background', 0.95]]); bar.strokes = [solid('border')]; bar.strokeTopWeight = 1; bar.strokeBottomWeight = 0; bar.strokeLeftWeight = 0; bar.strokeRightWeight = 0; bar.strokeAlign = 'INSIDE';
    const b = BTN('default', 'lg', 'Confirmar y añadir al inventario', 'check'); bar.appendChild(b); b.layoutSizingHorizontal = 'FILL';
    deskFinish(s, c); return b;
  }
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
  } else if (k === 'escanear' && DESK) {
    // hidden md:flex min-h-56 rounded-xl border-2 border-dashed px-6 py-10: el escáner no se ofrece
    const bs = stack('ScanForm (escritorio)', c, 12);
    const dz = stack('zona de arrastrar (button)', bs, 12); dz.counterAxisAlignItems = 'CENTER'; dz.primaryAxisAlignItems = 'CENTER'; dz.minHeight = 224; /* min-h-56: la escala de Figma no llega a spacing/56 */ padX(dz, 'spacing/6'); padY(dz, 'spacing/10'); rad(dz, 'radius/xl'); dz.strokeWeight = 2; dz.strokeAlign = 'INSIDE'; dz.dashPattern = [6, 4]; setPaints(dz, 'strokes', [['border']]);
    dz.appendChild(icon('upload', 32, 'muted-foreground', 'icon'));
    const t1 = await text('Arrastra aquí una imagen o PDF, o haz clic para elegir', 'Body/Base Medium', 'foreground', dz); t1.textAlignHorizontal = 'CENTER';
    const t2 = await text('También puedes pegar una captura con Ctrl/Cmd + V', 'Body/Small', 'muted-foreground', dz); t2.textAlignHorizontal = 'CENTER';
    await text('Si el ticket es largo o está arrugado, súbelo escaneado en PDF: se lee mejor.', 'Body/Small', 'muted-foreground', bs, { fill: true });
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
function modalSlot(name, w = 390) {
  let holder = page.children.find((n) => n.name === 'Contenidos de modal (slots)');
  if (!holder) { holder = stack('Contenidos de modal (slots)', null, 40, 'HORIZONTAL'); page.appendChild(holder); holder.x = -3000; holder.y = 0; holder.primaryAxisSizingMode = 'AUTO'; holder.counterAxisSizingMode = 'AUTO'; }
  for (const o of holder.findAll((n) => n.type === 'COMPONENT' && n.name === '_Contenido · ' + name)) o.remove();
  const k = figma.createComponent(); k.name = '_Contenido · ' + name; k.layoutMode = 'VERTICAL'; k.primaryAxisSizingMode = 'AUTO'; k.counterAxisSizingMode = 'FIXED'; k.resize(w, 10); k.primaryAxisSizingMode = 'AUTO'; k.fills = []; k.itemSpacing = 0; k.clipsContent = false;
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

// ── Recetas, modo cocinado y Menús en escritorio ────────────────────────────
const RC = {
  vacio: 'Recetas · 1 · Sin recetas', lista: 'Recetas · 2 · Mis recetas', receta: 'Recetas · 3 · Receta (edición)',
  antes: 'Cocinar · 1 · Antes de empezar', paso: 'Cocinar · 2 · Paso con tiempo', final: 'Cocinar · 3 · Plato terminado',
  escritorio: 'Menús · escritorio',
};
const L5 = {
  tarjeta: await setOf('◆ PATRONES', 'Tarjeta de receta'), pack: await setOf('◆ PATRONES', 'Receta del pack'), coste: await setOf('◆ PATRONES', 'Coste de receta'),
  val: await setOf('◆ PATRONES', 'Valoración'), ing: await setOf('◆ PATRONES', 'Ingrediente al cocinar'), timer: await setOf('◆ PATRONES', 'Temporizador'),
  plato: await setOf('◆ PATRONES', 'Plato del menú'), ta: await setOf('02 · Formularios', 'Textarea'), sw: await setOf('02 · Formularios', 'Switch'),
};
function backHeader(c, title, back) { const { h } = header(title, null, null); c.appendChild(h); h.layoutSizingHorizontal = 'FILL'; h.setProperties({ [P(L.ph, 'back#')]: true, [P(L.ph, 'back label')]: back }); return h; }
// Badges expuestos de un patrón, UNO POR HUECO (cada hueco tiene su variante: temporada
// en outline, tipo de comida o dieta en secondary). null = ese hueco no se pinta.
function setBadges(inst, slots) {
  const bs = inst.findAll((n) => n.type === 'INSTANCE' && n.parent.name === 'etiquetas' && !n.name.startsWith('Coste'));
  bs.forEach((b, i) => { if (slots[i] == null) b.visible = false; else b.setProperties({ [P(L3.badge, 'label')]: slots[i] }); });
}
function exploreHeader(parent, open) {
  const sec = stack('Explorar recetas', parent, 0); rad(sec, 'radius/xl'); setPaints(sec, 'strokes', [['border']]); sec.strokeWeight = 1; sec.strokeAlign = 'INSIDE';
  const h = stack('cabecera (botón)', sec, 8, 'HORIZONTAL'); h.counterAxisAlignItems = 'CENTER'; bind(h, 'minHeight', 'spacing/11'); padX(h, 'spacing/3'); padY(h, 'spacing/3');
  h.appendChild(icon('compass', 16, 'muted-foreground', 'icon'));
  return { sec, h, done: async () => {
    await text('Explorar recetas', 'Body/Base Medium', 'foreground', h);
    const pill = stack('43', h, 0, 'HORIZONTAL'); pill.layoutSizingHorizontal = 'HUG'; padX(pill, 'spacing/2'); padY(pill, 'spacing/0_5'); rad(pill, 'radius/full'); setPaints(pill, 'fills', [['muted']]); await text('43', 'Caption/Default', 'muted-foreground', pill);
    const sp = figma.createFrame(); sp.name = 'ml-auto'; sp.fills = []; sp.resize(1, 1); h.appendChild(sp); sp.layoutGrow = 1;
    h.appendChild(icon(open ? 'chevron-up' : 'chevron-down', 16, 'foreground', 'chevron'));
  } };
}
function pack(parent, estado, name, description, labels) { const p = inst(L5.pack, 'estado=' + estado); parent.appendChild(p); p.layoutSizingHorizontal = 'FILL'; p.setProperties({ [P(L5.pack, 'name')]: name, [P(L5.pack, 'description')]: description }); setBadges(p, labels); return p; }
function recipeCard(parent, hist, name, ings, labels, cost, votos, veces) {
  const t = inst(L5.tarjeta, 'historial=' + hist); parent.appendChild(t); t.layoutSizingHorizontal = 'FILL'; t.setProperties({ [P(L5.tarjeta, 'name')]: name, [P(L5.tarjeta, 'ingredientes')]: ings }); setBadges(t, labels);
  const cb = t.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('Coste')); if (!cost) cb.visible = false; else { if (cost.parcial) cb.swapComponent(variant(L5.coste, 'estado=parcial')); cb.setProperties({ [P(L5.coste, 'importe')]: cost.v }); if (cost.de) cb.findOne((n) => n.name === 'cobertura').characters = cost.de; }
  if (votos) t.findOne((n) => n.name === 'votos').characters = votos; if (veces) t.findOne((n) => n.name === 'veces').characters = veces;
  return t;
}
async function smallLabel(parent, label) { const l = inst(L2.label, 'state=default'); parent.appendChild(l); l.setProperties({ [P(L2.label, 'label')]: label }); bind(l.findOne((n) => n.type === 'TEXT'), 'fontSize', 'font-size/xs'); return l; }

if (ARGS.screen === 'rc-vacio') {
  const s = screen(RC.vacio, 390, 'mobile'); const c = mobileContent(s);
  backHeader(c, 'Mis recetas', 'Menús');
  const body = stack('cuerpo', c, 24);
  const e = L2.empty.createInstance(); body.appendChild(e); e.layoutSizingHorizontal = 'FILL';
  e.setProperties({ [P(L2.empty, 'title')]: 'Aún no tienes recetas', [P(L2.empty, 'description')]: 'Explora el pack de recetas de abajo para empezar, añade las tuyas o guarda las que genere la IA.', [P(L2.empty, 'icon')]: iconComp('book-open').id, [P(L2.empty, 'action')]: true });
  const act = e.findOne((n) => n.type === 'INSTANCE' && n.name === 'action'); act.swapComponent(variant(L.btn, 'variant=default, size=default, state=default'));
  act.setProperties({ [P(L.btn, 'label')]: 'Añade tu primera receta', [P(L.btn, 'icon inline-start#')]: true, [P(L.btn, 'icon inline-start ↳')]: iconComp('plus').id, [P(L.btn, 'icon inline-end#')]: false });
  const ex = exploreHeader(body, true); await ex.done();
  const eb = stack('abierta', ex.sec, 12); padX(eb, 'spacing/3'); bind(eb, 'paddingBottom', 'spacing/3');
  await text('Recetas españolas de diario para empezar tu recetario. Añade las que te gusten; luego puedes editarlas o borrarlas.', 'Caption/Default', 'muted-foreground', eb, { fill: true });
  const fl = stack('filtros', eb, 8);
  for (const [l, v] of [['Temporada', 'Cualquiera'], ['Momento', 'Comida o cena'], ['Dieta', 'Cualquiera']]) { const f = stack(l, fl, 4); await smallLabel(f, l); const sel = inst(L3.select, 'size=default, state=default, filled=true'); f.appendChild(sel); sel.setProperties({ [P(L3.select, 'value')]: v }); sel.layoutSizingHorizontal = 'HUG'; }
  const ul = stack('recetas', eb, 8);
  pack(ul, 'añadir', 'Lentejas estofadas', 'Guiso de cuchara con lentejas y verduras, de toda la vida.', ['Invierno', 'Vegano', 'Sin gluten']);
  pack(ul, 'añadir', 'Potaje de garbanzos', 'Garbanzos guisados con verduras y un toque de pimentón.', ['Invierno', 'Vegano', 'Sin gluten']);
  pack(ul, 'añadir', 'Pollo al ajillo', 'Pollo dorado con mucho ajo y un chorrito de limón.', [null, null, 'Sin gluten']);
  pack(ul, 'añadir', 'Tortilla de patatas', 'La clásica tortilla española, jugosa por dentro.', [null, 'Vegetariano', 'Sin gluten']);
  finishMobile(s, c); const fab = s.findOne((n) => n.type === 'INSTANCE' && n.name === 'FAB'); await activate(s, 3);
  return { screen: s.id, h: Math.round(s.height), fab: !!fab, fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'rc-lista') {
  const s = screen(RC.lista, 390, 'mobile'); const c = mobileContent(s);
  backHeader(c, 'Mis recetas', 'Menús');
  const body = stack('cuerpo', c, 24);
  const rl = stack('RecipesList', body, 16);
  const se = inst(L.search, 'filled=false'); rl.appendChild(se); se.layoutSizingHorizontal = 'FILL'; se.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('Input')).setProperties({ [P(L2.input, 'placeholder')]: 'Buscar receta…' });
  const g = stack('Filtrar por tipo de comida', rl, 8, 'HORIZONTAL'); for (const [v, l] of [['default', 'Todas'], ['outline', 'Comida'], ['outline', 'Cena']]) { const b = BTN(v, 'default', l); g.appendChild(b); b.layoutSizingHorizontal = 'FILL'; }
  const ul = stack('recetas', rl, 8);
  recipeCard(ul, 'true', 'Tortilla de patatas', '5 ingredientes', ['Comida', 'Cena', '🗓️ Todo el año'], { v: '≈ 2,85 €' }, '★ 4,5 · 2 votos', 'Hecha 3 veces · última vez ayer');
  recipeCard(ul, 'true', 'Lentejas estofadas', '8 ingredientes', ['Comida', null, '❄️ Invierno'], null, '★ 5,0 · 1 voto', 'Hecha 1 vez · última vez hace 5 días');
  recipeCard(ul, 'false', 'Crema de calabacín', '6 ingredientes', [null, 'Cena', '🗓️ Todo el año'], { v: '≥ 1,90 €', parcial: true, de: ' (4 de 6)' });
  recipeCard(ul, 'false', 'Espaguetis a la boloñesa', '9 ingredientes', ['Comida', 'Cena', '🗓️ Todo el año'], null);
  if (DESK) {
    recipeCard(ul, 'false', 'Pollo al horno con patatas', '6 ingredientes', ['Comida', null, '🗓️ Todo el año'], { v: '≈ 5,10 €' });
    recipeCard(ul, 'true', 'Gazpacho', '7 ingredientes', ['Comida', 'Cena', '☀️ Verano'], { v: '≈ 3,40 €' }, '★ 4,0 · 1 voto', 'Hecha 2 veces · última vez hace 3 semanas');
    deskGrid(ul, 3, 12); // md:grid-cols-2 lg:grid-cols-3
    deskHeaderAction(c, BTN('default', 'default', 'Nueva receta', 'plus')); // hidden md:inline-flex; el FAB es md:hidden
  }
  const ex = exploreHeader(body, false); await ex.done();
  finishMobile(s, c); await activate(s, 3);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'rc-receta') {
  const s = screen(RC.receta, 390, 'mobile'); const c = mobileContent(s); c.paddingBottom = 112 + 32;
  backHeader(c, 'Lentejas estofadas', 'Mis recetas'); // sin pasos no hay «Cocinar paso a paso»; sin precios no hay coste
  const v = inst(L5.val, 'votos=sin'); c.appendChild(v); v.layoutSizingHorizontal = 'FILL';
  const form = stack('RecipeForm', c, 24); bind(form, 'paddingTop', 'spacing/2');
  const basic = stack('datos', form, 16);
  await labeled(basic, 'Nombre', inputWith('Lentejas estofadas'));
  const ta = inst(L5.ta, 'state=default, filled=true'); ta.setProperties({ [P(L5.ta, 'value')]: 'Guiso de cuchara con lentejas y verduras, de toda la vida.' });
  const df = await labeled(basic, 'Descripción (opcional)', ta); const dl = df.findOne((n) => n.type === 'INSTANCE').findOne((n) => n.type === 'TEXT'); dl.setRangeFills(12, dl.characters.length, [solid('muted-foreground')]);
  const g2 = stack('raciones y minutos', basic, 12, 'HORIZONTAL');
  (await labeled(g2, 'Raciones', inputWith('2'))).layoutSizingHorizontal = 'FILL';
  const mf = await labeled(g2, 'Minutos (opcional)', inputWith(null, 'p. ej. 45')); mf.layoutSizingHorizontal = 'FILL'; const ml = mf.findOne((n) => n.type === 'INSTANCE').findOne((n) => n.type === 'TEXT'); ml.setRangeFills(8, ml.characters.length, [solid('muted-foreground')]);
  const fs = async (legend, hint) => { const f = stack(legend, form, 8); await text(legend, 'Body/Small Medium', 'foreground', f, { fill: true }); if (hint) await text(hint, 'Caption/Default', 'muted-foreground', f, { fill: true }); return f; };
  const tipo = await fs('Tipo de comida', 'Puedes marcar varias.'); const tr = stack('opciones', tipo, 8, 'HORIZONTAL'); for (const [on, l] of [[false, 'Desayuno'], [true, 'Comida'], [false, 'Cena']]) { const b = BTN(on ? 'default' : 'outline', 'lg', l); tr.appendChild(b); b.layoutSizingHorizontal = 'FILL'; }
  const temp = await fs('Temporada'); const tp = stack('opciones', temp, 8, 'HORIZONTAL'); for (const [on, l] of [[false, 'Todo el año'], [true, 'Invierno'], [false, 'Verano']]) { const b = BTN(on ? 'default' : 'outline', 'default', l); tp.appendChild(b); b.layoutSizingHorizontal = 'FILL'; }
  const ingr = await fs('Ingredientes'); const ul = stack('lista', ingr, 12);
  const ING = [['Lentejas', '160', 'g', 'No lo tienes'], ['Zanahorias', '1', 'ud', 'En casa'], ['Cebollas', '1', 'ud', 'En casa'], ['Patatas', '1', 'ud', 'En casa'], ['Ajos', '2', 'ud', 'En casa'], ['Tomate frito', '60', 'g', 'No lo tienes'], ['Aceite de oliva virgen extra', '20', 'ml', 'En casa'], ['Sal', null, null, 'En casa']];
  for (const [n, q, u, stock] of ING) {
    const li = stack(n, ul, 8); padX(li, 'spacing/3'); padY(li, 'spacing/3'); rad(li, 'radius/lg'); setPaints(li, 'strokes', [['border']]); li.strokeWeight = 1; li.strokeAlign = 'INSIDE';
    const r1 = stack('nombre', li, 8, 'HORIZONTAL'); r1.counterAxisAlignItems = 'CENTER'; const ni = inputWith(n, 'Ingrediente'); r1.appendChild(ni); ni.layoutSizingHorizontal = 'FILL'; r1.appendChild(IB('ghost', 'icon', 'trash'));
    const b = inst(L3.badge, 'variant=default'); li.appendChild(b); b.setProperties({ [P(L3.badge, 'label')]: stock }); const ok = stock === 'En casa'; setPaints(b, 'fills', [[ok ? 'success' : 'muted', ok ? 0.15 : 1]]); for (const t of b.findAll((x) => x.type === 'TEXT')) setPaints(t, 'fills', [[ok ? 'success' : 'muted-foreground']]);
    const r2 = stack('cantidad', li, 8, 'HORIZONTAL'); r2.counterAxisAlignItems = 'CENTER';
    const qi = inputWith(q, 'Cant.'); r2.appendChild(qi); qi.layoutSizingHorizontal = 'FIXED'; qi.resize(96, qi.height);
    const us = inst(L3.select, `size=default, state=default, filled=${u ? 'true' : 'false'}`); r2.appendChild(us); us.setProperties(u ? { [P(L3.select, 'value')]: u } : { [P(L3.select, 'placeholder')]: 'Sin unidad' }); us.layoutSizingHorizontal = 'FILL'; // w-32, pero en 334 px no cabe todo: el navegador encoge los campos (flex-shrink) y aquí la unidad toma lo que queda
    const op = stack('Opcional', r2, 8, 'HORIZONTAL'); op.layoutSizingHorizontal = 'HUG'; op.counterAxisAlignItems = 'CENTER'; await text('Opcional', 'Body/Small', 'muted-foreground', op); op.appendChild(inst(L5.sw, 'size=default, state=default, checked=false'));
  }
  const ai = BTN('outline', 'default', 'Añadir ingrediente', 'plus'); ingr.appendChild(ai);
  const pasos = await fs('Pasos (opcional)', 'Uno por paso, en orden, con las cantidades para 2 raciones. Si pegas una receta entera, cada línea se convierte en un paso.');
  const pl = pasos.findOne((n) => n.type === 'TEXT' && n.characters === 'Pasos (opcional)'); pl.setRangeFills(6, pl.characters.length, [solid('muted-foreground')]);
  const st = stack('paso 1', pasos, 8); padX(st, 'spacing/3'); padY(st, 'spacing/3'); rad(st, 'radius/lg'); setPaints(st, 'strokes', [['border']]); st.strokeWeight = 1; st.strokeAlign = 'INSIDE';
  const sr = stack('texto', st, 8, 'HORIZONTAL'); sr.counterAxisAlignItems = 'MIN';
  const num = stack('número', sr, 0, 'HORIZONTAL'); num.layoutSizingHorizontal = 'FIXED'; num.resize(24, 24); num.layoutSizingVertical = 'FIXED'; num.primaryAxisAlignItems = 'CENTER'; num.counterAxisAlignItems = 'CENTER'; rad(num, 'radius/full'); setPaints(num, 'fills', [['muted']]); await text('1', 'Caption/Medium', 'muted-foreground', num);
  const stx = inst(L5.ta, 'state=default, filled=false'); sr.appendChild(stx); stx.layoutSizingHorizontal = 'FILL'; stx.setProperties({ [P(L5.ta, 'placeholder')]: 'p. ej. Sofríe la cebolla a fuego medio 5 minutos' });
  const ac = stack('acciones', st, 4, 'HORIZONTAL'); ac.appendChild(IB('ghost', 'icon', 'chevron-up')); ac.appendChild(IB('ghost', 'icon', 'chevron-down')); const sp2 = figma.createFrame(); sp2.name = 'ml-auto'; sp2.fills = []; sp2.resize(1, 1); ac.appendChild(sp2); sp2.layoutGrow = 1; ac.appendChild(IB('ghost', 'icon', 'trash'));
  const pr = stack('añadir', pasos, 8, 'HORIZONTAL'); pr.layoutWrap = 'WRAP'; pr.counterAxisSpacing = 8; pr.appendChild(BTN('outline', 'default', 'Añadir paso', 'plus'));
  const aib = inst(L.ai, 'size=default, state=default'); pr.appendChild(aib); aib.setProperties({ [P(L.ai, 'label')]: 'Escribir con IA' }); aib.layoutSizingHorizontal = 'HUG';
  await text('La IA escribe los pasos y completa las cantidades que falten arriba, sin tocar los ingredientes que ya hayas puesto. Revísalo antes de guardar.', 'Caption/Default', 'muted-foreground', pasos, { fill: true });
  const acts = stack('acciones', form, 8); fullBtn(acts, 'default', 'lg', 'Guardar cambios'); fullBtn(acts, 'destructive', 'default', 'Eliminar receta', 'trash'); fullBtn(acts, 'ghost', 'default', 'Cancelar');
  finishMobile(s, c); for (const f of s.findAll((n) => n.type === 'INSTANCE' && n.name === 'FAB')) f.remove(); await activate(s, 3);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

// Modo cocinado: pantalla completa (fixed inset-0 z-[60]), sin nav ni cabecera de la app
async function cookScreen(name, sub, progress) {
  const s = screen(name, 390, 'mobile'); s.layoutMode = 'VERTICAL'; s.primaryAxisSizingMode = 'FIXED'; s.counterAxisSizingMode = 'FIXED'; s.resize(390, 844); s.itemSpacing = 0;
  const h = stack('CookingHeader', s, 8); padX(h, 'spacing/4'); bind(h, 'paddingTop', 'spacing/3'); bind(h, 'paddingBottom', 'spacing/3'); h.strokes = [solid('border')]; h.strokeBottomWeight = 1; h.strokeTopWeight = 0; h.strokeLeftWeight = 0; h.strokeRightWeight = 0; h.strokeAlign = 'INSIDE';
  const r = stack('fila', h, 12, 'HORIZONTAL'); r.primaryAxisAlignItems = 'SPACE_BETWEEN'; r.counterAxisAlignItems = 'CENTER';
  const l = stack('títulos', r, 0); l.layoutSizingHorizontal = 'FILL'; await text('Lentejas estofadas', 'Title/Section', 'foreground', l, { fill: true }); await text(sub, 'Caption/Default', 'muted-foreground', l, { fill: true });
  const x = IB('ghost', 'icon', 'x'); r.appendChild(x); x.name = 'Salir de cocinar';
  const bar = figma.createFrame(); bar.name = 'Progreso de la receta'; bar.layoutMode = 'HORIZONTAL'; bar.fills = []; h.appendChild(bar); bar.layoutSizingHorizontal = 'FILL'; bar.layoutSizingVertical = 'FIXED'; bar.resize(358, 4); rad(bar, 'radius/full'); setPaints(bar, 'fills', [['muted']]); bar.clipsContent = true;
  if (progress > 0) { const fill = figma.createFrame(); fill.name = 'relleno'; bar.appendChild(fill); fill.layoutSizingVertical = 'FILL'; fill.resize(358 * progress, 4); rad(fill, 'radius/full'); setPaints(fill, 'fills', [['success']]); }
  return s;
}
async function timerBar(s, estado, label) {
  const b = stack('TimerBar', s, 8, 'HORIZONTAL'); b.counterAxisAlignItems = 'CENTER'; padX(b, 'spacing/4'); padY(b, 'spacing/2'); setPaints(b, 'fills', [['card']]); b.strokes = [solid('border')]; b.strokeBottomWeight = 1; b.strokeTopWeight = 0; b.strokeLeftWeight = 0; b.strokeRightWeight = 0; b.strokeAlign = 'INSIDE';
  const ul = stack('tiempos', b, 8, 'HORIZONTAL'); ul.layoutSizingHorizontal = 'FILL'; ul.layoutWrap = 'WRAP';
  const t = inst(L5.timer, 'estado=' + estado); ul.appendChild(t); t.setProperties({ [P(L5.timer, 'tiempo')]: label });
  const m = IB('ghost', 'icon', 'volume-2'); b.appendChild(m); recolor(m.findAll((q) => q.type === 'INSTANCE')[0], 'muted-foreground'); m.name = 'Silenciar el sonido';
  return b;
}
function cookBody(s, gap) { const b = stack('cuerpo (scroll)', s, gap); padX(b, 'spacing/4'); padY(b, 'spacing/6'); b.layoutSizingVertical = 'FILL'; b.clipsContent = true; return b; }
function cookFooter(s) { const f = stack('footer', s, 8, 'HORIZONTAL'); padX(f, 'spacing/4'); bind(f, 'paddingTop', 'spacing/3'); f.paddingBottom = 34 + 12; f.strokes = [solid('border')]; f.strokeTopWeight = 1; f.strokeBottomWeight = 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0; f.strokeAlign = 'INSIDE'; return f; }
async function heading20(parent, chars) { const t = await text(chars, 'Title/Page', 'foreground', parent, { fill: true }); bind(t, 'fontSize', 'font-size/xl'); return t; }

if (ARGS.screen === 'ck-antes') {
  const s = await cookScreen(RC.antes, 'Ingredientes', 0);
  const b = cookBody(s, 20);
  const hd = stack('intro', b, 4); await heading20(hd, 'Antes de empezar'); await text('Saca lo que vas a necesitar y márcalo. Para 2 raciones.', 'Body/Small', 'muted-foreground', hd, { fill: true });
  const w = stack('te falta', b, 8); padX(w, 'spacing/3'); padY(w, 'spacing/3'); rad(w, 'radius/xl'); setPaints(w, 'fills', [['warning', 0.15]]); setPaints(w, 'strokes', [['warning', 0.4]]); w.strokeWeight = 1; w.strokeAlign = 'INSIDE';
  await text('Te faltan 2 ingredientes', 'Body/Small Medium', 'warning', w, { fill: true }); await text('No está en la despensa ni apuntado en la lista: Lentejas, Tomate frito.', 'Caption/Default', 'warning', w, { fill: true });
  w.appendChild(BTN('outline', 'default', 'Apuntar en la lista', 'shopping-cart'));
  const ul = stack('ingredientes', b, 4);
  for (const [q, n, st] of [['160 g', 'Lentejas', 'falta'], ['1 ud', 'Zanahorias', 'marcado'], ['1 ud', 'Cebollas', 'marcado'], ['1 ud', 'Patatas', 'pendiente'], ['2 ud', 'Ajos', 'marcado'], ['60 g', 'Tomate frito', 'falta'], ['20 ml', 'Aceite de oliva virgen extra', 'pendiente'], ['al gusto', 'Sal', 'pendiente']]) { const i = inst(L5.ing, 'estado=' + st); ul.appendChild(i); i.layoutSizingHorizontal = 'FILL'; if (st === 'marcado') { i.findOne((x) => x.name === 'cantidad').characters = q; i.findOne((x) => x.name === 'name').characters = n; } else i.setProperties({ [P(L5.ing, 'cantidad')]: q, [P(L5.ing, 'name')]: n }); } // «marcado» no va enlazado (ver el patrón)
  const f = cookFooter(s); const go = BTN('default', 'lg', 'Empezar', null); go.setProperties({ [P(L.btn, 'icon inline-end#')]: true, [P(L.btn, 'icon inline-end ↳')]: iconComp('chevron-right').id }); f.appendChild(go); go.layoutSizingHorizontal = 'FILL';
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'ck-paso') {
  const s = await cookScreen(RC.paso, 'Paso 4 de 5', 3 / 5);
  await timerBar(s, 'en-marcha', '06:41'); // el de 8 min del paso 2, todavía en marcha
  const b = cookBody(s, 24);
  const lv = stack('paso (aria-live)', b, 12);
  await text('Paso 4 de 5', 'Caption/Medium', 'muted-foreground', lv, { fill: true });
  const t = await text('Cuece a fuego suave 35 minutos, removiendo de vez en cuando.', 'Body/Base Medium', 'foreground', lv, { fill: true }); bind(t, 'fontSize', 'font-size/xl'); t.lineHeight = { value: 162.5, unit: 'PERCENT' };
  const ch = stack('Tiempos de este paso', b, 8, 'HORIZONTAL'); ch.appendChild(BTN('outline', 'default', '35 min', 'timer'));
  const ing = stack('ingredientes', b, 12); padX(ing, 'spacing/3'); padY(ing, 'spacing/3'); rad(ing, 'radius/xl'); setPaints(ing, 'strokes', [['border']]); ing.strokeWeight = 1; ing.strokeAlign = 'INSIDE';
  const vb = BTN('ghost', 'default', 'Ver ingredientes (8)', 'list-checks'); ing.appendChild(vb); vb.layoutSizingHorizontal = 'FILL'; vb.primaryAxisAlignItems = 'MIN';
  const f = cookFooter(s); f.appendChild(IB('outline', 'icon-lg', 'chevron-left'));
  const nx = BTN('default', 'lg', 'Siguiente', null); nx.setProperties({ [P(L.btn, 'icon inline-end#')]: true, [P(L.btn, 'icon inline-end ↳')]: iconComp('chevron-right').id }); f.appendChild(nx); nx.layoutSizingHorizontal = 'FILL';
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'ck-final') {
  const s = await cookScreen(RC.final, 'Plato terminado', 1);
  await timerBar(s, 'sonado', '¡Tiempo! 35 min');
  const b = cookBody(s, 20); b.layoutSizingVertical = 'HUG'; b.clipsContent = false; // sin pie fijo: la pantalla final se desplaza entera
  const cel = stack('celebración', b, 8); cel.counterAxisAlignItems = 'CENTER';
  const circ = stack('icono', cel, 0, 'HORIZONTAL'); circ.layoutSizingHorizontal = 'FIXED'; circ.resize(48, 48); circ.layoutSizingVertical = 'FIXED'; circ.primaryAxisAlignItems = 'CENTER'; circ.counterAxisAlignItems = 'CENTER'; rad(circ, 'radius/full'); setPaints(circ, 'fills', [['accent']]); circ.appendChild(icon('party-popper', 24, 'accent-foreground', 'icon'));
  (await heading20(cel, '¡Lentejas estofadas listo!')).textAlignHorizontal = 'CENTER';
  (await text('Primera vez que lo cocináis', 'Body/Small', 'muted-foreground', cel, { fill: true })).textAlignHorizontal = 'CENTER';
  const mk = stack('¿Lo apuntamos como cocinado?', b, 8); padX(mk, 'spacing/4'); padY(mk, 'spacing/4'); rad(mk, 'radius/xl'); setPaints(mk, 'strokes', [['border']]); mk.strokeWeight = 1; mk.strokeAlign = 'INSIDE';
  await text('¿Lo apuntamos como cocinado?', 'Body/Small Medium', 'foreground', mk, { fill: true });
  await text('Con esto el menú deja de preguntarte por él y el generador sabe que no toca repetirlo pronto.', 'Caption/Default', 'muted-foreground', mk, { fill: true });
  fullBtn(mk, 'default', 'lg', 'Lo cocinamos', 'chef-hat'); fullBtn(mk, 'ghost', 'default', 'Ahora no');
  const v = inst(L5.val, 'votos=sin'); b.appendChild(v); v.layoutSizingHorizontal = 'FILL';
  const ex = stack('salida', b, 8); fullBtn(ex, 'default', 'lg', 'Listo'); fullBtn(ex, 'ghost', 'default', 'Volver a los pasos', 'chevron-left');
  s.primaryAxisSizingMode = 'AUTO'; if (s.height < 844) { s.primaryAxisSizingMode = 'FIXED'; s.resize(390, 844); } // fixed inset-0: nunca menos que la pantalla
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'menus-escritorio') {
  const s = screen(RC.escritorio, 1280, 'desktop'); const c = desktop(s);
  withActions(c, 'Menús', [IB('outline', 'icon', 'book-open'), IB('outline', 'icon', 'ellipsis')]);
  const nav = stack('semana', c, 4, 'HORIZONTAL'); nav.counterAxisAlignItems = 'CENTER';
  nav.appendChild(IB('ghost', 'icon', 'chevron-left'));
  const lbl = stack('etiqueta', nav, 8, 'HORIZONTAL'); lbl.layoutSizingHorizontal = 'FILL'; lbl.primaryAxisAlignItems = 'CENTER'; lbl.counterAxisAlignItems = 'CENTER'; await text('Semana del 28 de septiembre', 'Body/Small Medium', 'foreground', lbl);
  const rv = BTN('ghost', 'default', '1 por repasar', 'chef-hat'); lbl.appendChild(rv); for (const t of rv.findAll((n) => n.type === 'TEXT')) setPaints(t, 'fills', [['muted-foreground']]); recolor(rv.findAll((n) => n.type === 'INSTANCE')[0], 'muted-foreground');
  nav.appendChild(IB('ghost', 'icon', 'chevron-right'));
  const today = stack('Hoy', c, 8); rad(today, 'radius/xl'); setPaints(today, 'fills', [['card']]); setPaints(today, 'strokes', [['border']]); today.strokeWeight = 1; today.strokeAlign = 'INSIDE'; padX(today, 'spacing/3'); padY(today, 'spacing/3');
  const tt = stack('titulo', today, 4, 'HORIZONTAL'); await text('Hoy', 'Body/Small Medium', 'foreground', tt); await text('· Miércoles 30', 'Body/Small', 'muted-foreground', tt);
  for (const [slot, dish] of [['Comida', 'Pollo al ajillo'], ['Cena', 'Ensalada mixta con atún']]) { // slotLabel(), con mayúscula
    const dr = stack(dish, today, 8, 'HORIZONTAL'); dr.counterAxisAlignItems = 'CENTER';
    const dt = stack('texto', dr, 4, 'HORIZONTAL'); dt.layoutSizingHorizontal = 'FILL'; dt.counterAxisAlignItems = 'CENTER'; await text(slot, 'Caption/Default', 'muted-foreground', dt); await text(dish, 'Body/Small', 'foreground', dt);
    for (const ic of ['circle-check', 'circle-x']) { const b2 = IB('outline', 'icon', ic); dr.appendChild(b2); recolor(b2.findAll((q) => q.type === 'INSTANCE')[0], 'muted-foreground'); }
  }
  // 3 columnas (xl:grid-cols-3, gap-3): a 960 px, tarjetas de 312. Cada hueco mide menos de 9rem: el plato se apila.
  const grid = stack('semana (xl:grid-cols-3)', c, 12, 'HORIZONTAL'); grid.layoutWrap = 'WRAP'; grid.counterAxisSpacing = 12; grid.counterAxisAlignItems = 'MIN';
  const K = P(L5.plato, 'name');
  const DIAS = [
    ['Lunes 28', ['cocinado', 'Lentejas estofadas'], ['marcar-apilado', 'Crema de calabacín']],
    ['Martes 29', ['cocinado', 'Arroz con verduras'], ['cocinado', 'Tortilla de patatas']],
    ['Miércoles 30', ['marcar-apilado', 'Pollo al ajillo'], ['marcar-apilado', 'Ensalada mixta con atún'], true],
    ['Jueves 1', ['pendiente', 'Espaguetis a la boloñesa'], ['pendiente', 'Crema de zanahoria']],
    ['Viernes 2', ['pendiente', 'Merluza al horno con patatas'], ['pendiente', 'Huevos rotos con jamón']],
    ['Sábado 3', ['pendiente', 'Arroz con gambas'], ['pendiente', 'Sándwich mixto']],
    ['Domingo 4', ['pendiente', 'Potaje de garbanzos'], ['pendiente', 'Pisto de verduras']],
  ];
  for (const [day, comida, cena, isToday] of DIAS) {
    const d = L.dia.createInstance(); grid.appendChild(d); d.layoutSizingHorizontal = 'FIXED'; d.resize(312, d.height); d.layoutSizingVertical = 'HUG';
    d.findOne((n) => n.name === 'day').characters = day;
    if (!isToday) { d.findOne((n) => n.name === 'hoy').visible = false; setPaints(d, 'strokes', [['border']]); }
    const platos = d.findAll((n) => n.type === 'INSTANCE' && n.parent && (n.parent.name === 'Comida' || n.parent.name === 'Cena') && n.name.startsWith('Plato'));
    [comida, cena].forEach(([st, name], i) => { const p = platos[i]; p.swapComponent(variant(L5.plato, 'estado=' + st)); p.setProperties({ [K]: name }); p.layoutSizingHorizontal = 'FILL'; p.layoutSizingVertical = 'HUG'; });
  }
  const cost = stack('coste', c, 4); cost.counterAxisAlignItems = 'CENTER';
  const ct = stack('linea', cost, 4, 'HORIZONTAL'); ct.layoutSizingHorizontal = 'HUG'; await text('Coste estimado de la semana:', 'Caption/Default', 'muted-foreground', ct); await text('≈ 58,40 €', 'Caption/Medium', 'price', ct);
  const add = BTN('outline', 'lg', 'Añadir a la lista lo que falte', 'shopping-cart'); c.appendChild(add); add.layoutSizingHorizontal = 'FILL';
  // Semana completa: el bloque de IA baja debajo de la lista y en tamaño normal (ctaOnTop solo con huecos libres de hoy en adelante)
  const gen = stack('generar', c, 8, 'HORIZONTAL'); gen.counterAxisAlignItems = 'CENTER';
  const ai = inst(L.ai, 'size=default, state=default'); gen.appendChild(ai); ai.layoutGrow = 1; ai.layoutSizingHorizontal = 'FILL';
  gen.appendChild(IB('outline', 'icon-lg', 'sliders-horizontal'));
  s.resize(1280, Math.max(800, Math.ceil(56 + c.height))); s.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('AppSidebar')).resize(256, s.height);
  await activate(s, 3);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

// ── Precios, Resumen y Perfil (la pestaña Perfil queda activa en las tres) ──
const PP = {
  prVacio: 'Precios · 1 · Sin historial', prLista: 'Precios · 2 · Con tickets', prProducto: 'Precios · 3 · Un producto',
  rsCerrado: 'Resumen · 1 · Mes cerrado', rsPrimer: 'Resumen · 2 · Primer mes',
  pfNuevo: 'Perfil · 1 · Hogar nuevo', pfAhorro: 'Perfil · 2 · Con ahorro',
};
const L6 = {
  aviso: await setOf('◆ PATRONES', 'Aviso de precio'), objetivo: await setOf('◆ PATRONES', 'Barra de objetivo'), reparto: await setOf('◆ PATRONES', 'Barra de reparto'),
  producto: await setOf('◆ PATRONES', 'Producto con precio'), hucha: await setOf('◆ PATRONES', 'Hucha del mes'),
  stat: await setOf('05 · Contenido', 'StatTile'), avatar: await setOf('05 · Contenido', 'Avatar'), legend: await setOf('06 · Datos', 'Chart · Legend'),
};
function descHeader(c, title, back, desc) { const { h } = header(title, null, desc); c.appendChild(h); h.layoutSizingHorizontal = 'FILL'; if (back) h.setProperties({ [P(L.ph, 'back#')]: true, [P(L.ph, 'back label')]: back }); return h; }
function statTile(parent, accent, ic, label, value, hint) {
  const t = inst(L6.stat, 'accent=' + accent); parent.appendChild(t); t.layoutSizingHorizontal = 'FILL';
  const pr = { [P(L6.stat, 'label')]: label, [P(L6.stat, 'value')]: value, [P(L6.stat, 'icon')]: iconComp(ic).id, [P(L6.stat, 'hint#')]: !!hint }; if (hint) pr[P(L6.stat, 'hint text')] = hint; t.setProperties(pr); return t;
}
// grid-cols-2 gap-2. Con un número impar, la última va a media anchura y deja el hueco al lado
// (Resumen); Perfil pasa a grid-cols-1 cuando solo hay una.
function tileGrid(parent, rows) {
  const g = stack('tarjetas (grid-cols-2 gap-2)', parent, 8);
  for (let i = 0; i < rows.length; i += 2) {
    const r = stack('fila', g, 8, 'HORIZONTAL'); r.counterAxisAlignItems = 'MIN';
    const pair = rows.slice(i, i + 2); for (const t of pair) statTile(r, ...t);
    if (pair.length === 1) { const hole = figma.createFrame(); hole.name = 'hueco (media columna vacía)'; hole.fills = []; hole.resize(10, 10); r.appendChild(hole); hole.layoutSizingHorizontal = 'FILL'; }
  }
  return g;
}
async function borderLink(parent, label, iconL, iconR) { // Link inline-flex min-h-11 rounded-lg border px-3 text-sm (no es un Button)
  const b = stack(label, parent, 4, 'HORIZONTAL'); b.layoutSizingHorizontal = 'HUG'; b.counterAxisAlignItems = 'CENTER'; bind(b, 'minHeight', 'spacing/11'); padX(b, 'spacing/3'); rad(b, 'radius/lg'); setPaints(b, 'strokes', [['border']]); b.strokeWeight = 1; b.strokeAlign = 'INSIDE';
  if (iconL) b.appendChild(icon(iconL, 16, 'foreground', 'icon'));
  await text(label, 'Body/Small', 'foreground', b);
  if (iconR) b.appendChild(icon(iconR, 16, 'foreground', 'icon'));
  return b;
}
async function endPerfil(s, c) { finishMobile(s, c); for (const f of s.findAll((n) => n.type === 'INSTANCE' && n.name === 'FAB')) f.remove(); await activate(s, 4); }

if (ARGS.screen === 'pr-vacio') {
  const s = screen(PP.prVacio, 390, 'mobile'); const c = mobileContent(s);
  descHeader(c, 'Precios', 'Perfil', 'Evolución de precios de lo que compras.');
  const e = L2.empty.createInstance(); c.appendChild(e); e.layoutSizingHorizontal = 'FILL';
  e.setProperties({ [P(L2.empty, 'title')]: 'Sin historial de precios', [P(L2.empty, 'description')]: 'Escanea tickets de la compra y aquí verás cómo evoluciona el precio de cada producto y dónde compras más barato.', [P(L2.empty, 'icon')]: iconComp('chart-line').id, [P(L2.empty, 'action')]: false });
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pr-lista') {
  const s = screen(PP.prLista, 390, 'mobile'); const c = mobileContent(s);
  descHeader(c, 'Precios', 'Perfil', 'Evolución de precios de lo que compras.');
  const av = stack('Avisos de precio', c, 8); await text('Avisos', 'Body/Small Medium', 'muted-foreground', av, { fill: true });
  for (const [t, txt] of [['sube', 'Aceite de oliva virgen extra ha subido un 17% desde tu última compra'], ['baja', 'Plátanos está un 6% por debajo de tu precio habitual']]) { const a = inst(L6.aviso, 'tipo=' + t); av.appendChild(a); a.layoutSizingHorizontal = 'FILL'; a.setProperties({ [P(L6.aviso, 'texto')]: txt }); }
  const card = cardFrame(c, 'SpendingPanel'); padY(card, 'spacing/4');
  const ch = stack('CardHeader', card, 8, 'HORIZONTAL'); padX(ch, 'spacing/4'); ch.counterAxisAlignItems = 'CENTER';
  await text('Resumen de Septiembre 2026', 'Title/Card', 'card-foreground', ch, { fill: true });
  const nav = stack('CardAction', ch, 4, 'HORIZONTAL'); nav.layoutSizingHorizontal = 'HUG';
  for (const [ic, off] of [['chevron-left', false], ['chevron-right', true]]) { const b = stack(off ? 'Mes siguiente (no hay)' : 'Mes anterior', nav, 0, 'HORIZONTAL'); b.layoutSizingHorizontal = 'FIXED'; b.resize(36, 36); b.layoutSizingVertical = 'FIXED'; b.primaryAxisAlignItems = 'CENTER'; b.counterAxisAlignItems = 'CENTER'; rad(b, 'radius/lg'); setPaints(b, 'strokes', [['border']]); b.strokeWeight = 1; b.strokeAlign = 'INSIDE'; b.appendChild(icon(ic, 16, off ? 'muted-foreground' : 'foreground', 'icon')); if (off) b.opacity = 0.4; } // size-9: 36 px
  const cc = stack('CardContent', card, 16); padX(cc, 'spacing/4');
  const tr = stack('total', cc, 8, 'HORIZONTAL'); tr.primaryAxisAlignItems = 'SPACE_BETWEEN'; tr.counterAxisAlignItems = 'MAX';
  await text('142,37 €', 'Display/3xl', 'foreground', tr);
  const cp = stack('compras', tr, 6, 'HORIZONTAL'); cp.layoutSizingHorizontal = 'HUG'; cp.counterAxisAlignItems = 'CENTER'; cp.appendChild(icon('receipt', 16, 'muted-foreground', 'icon')); await text('3 compras', 'Body/Small', 'muted-foreground', cp);
  const dl = stack('frente al mes anterior', cc, 4, 'HORIZONTAL'); dl.counterAxisAlignItems = 'CENTER'; dl.appendChild(icon('trending-up', 16, 'warning', 'icon')); await text('23,47 € más que el mes anterior', 'Body/Small', 'warning', dl);
  const bb = inst(L6.objetivo, 'estado=bien'); cc.appendChild(bb); bb.layoutSizingHorizontal = 'FILL';
  const reparto = async (title, rows) => { const sec = stack(title, cc, 8); await text(title, 'Body/Small Medium', 'muted-foreground', sec, { fill: true }); const max = rows[0][1]; rows.forEach(([l, v, col], i) => { const r = inst(L6.reparto, 'color=' + col); sec.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.setProperties({ [P(L6.reparto, 'label')]: l, [P(L6.reparto, 'importe')]: v.toFixed(2).replace('.', ',') + ' €' }); const f = r.findOne((n) => n.name === 'relleno'); f.resize(326 * (v / max), 8); }); };
  // Cinco barras como mucho: del quinto en adelante se juntan en «Otros» (muted-foreground/40)
  await reparto('Por categoría', [['Despensa', 58.2, '1'], ['Lácteos y huevos', 34.1, '2'], ['Verdura', 22.85, '3'], ['Limpieza', 15.4, '4'], ['Otros', 11.82, 'otros']]);
  await reparto('Por comercio', [['Mercadona', 96.12, '1'], ['Lidl', 46.25, '2']]);
  const ul = stack(DESK ? 'productos (lg:grid-cols-2)' : 'productos', c, 8);
  for (const [cmp, n, d, t, v] of [['true', 'Aceite de oliva virgen extra', '4 compras · último 10,45 €/ud', '37,50 €', '10,45 €/l'], ['true', 'Leche entera', '6 compras · último 0,92 €/ud', '34,14 €', '0,92 €/l'], ['false', 'Plátanos', '3 compras · último 1,59 €/kg', '5,97 €']]) { const p = inst(L6.producto, 'comparable=' + cmp); ul.appendChild(p); p.layoutSizingHorizontal = 'FILL'; p.setProperties({ [P(L6.producto, 'name')]: n, [P(L6.producto, 'detalle')]: d, [P(L6.producto, 'total')]: t }); if (v) p.findOne((x) => x.name === 'comparable').characters = v; }
  if (DESK) deskGrid(ul, 2, 8);
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pr-producto') {
  const s = screen(PP.prProducto, 390, 'mobile'); const c = mobileContent(s);
  descHeader(c, 'Leche entera', 'Precios', 'Evolución del precio por ud. Cada ud trae 1 l.');
  const body = stack('contenido', c, 24);
  const st = stack('mínimo, último y máximo (grid-cols-3)', body, 8, 'HORIZONTAL');
  for (const [l, v, tone, cmp] of [['Mínimo', '0,89 €', 'success', '0,89 €/l'], ['Último', '0,92 €', 'foreground', '0,92 €/l'], ['Máximo', '1,05 €', 'warning', '1,05 €/l']]) { const b = stack(l, st, 2); b.layoutSizingHorizontal = 'FILL'; padX(b, 'spacing/3'); padY(b, 'spacing/3'); rad(b, 'radius/xl'); setPaints(b, 'strokes', [['border']]); b.strokeWeight = 1; b.strokeAlign = 'INSIDE'; await text(l, 'Caption/Default', 'muted-foreground', b, { fill: true }); await text(v, 'Title/Base', tone, b, { fill: true }); await text(cmp, 'Caption/Default', 'price', b, { fill: true }); }
  // PriceChart (Recharts LineChart, aspect-[4/3]): eje X de CATEGORÍAS (fechas equiespaciadas),
  // eje Y desde 0, una línea por cadena (chart-1, chart-2…), rejilla horizontal discontinua.
  const W = DESK ? DESK_W : 358, H = DESK ? Math.round(DESK_W / 2) : Math.round(358 * 3 / 4), mL = 4 + 48, mR = 12, mT = 8, mB = 28; // aspect-[4/3] md:aspect-[2/1]
  const chart = figma.createFrame(); chart.name = 'PriceChart (aspect 4/3)'; chart.fills = []; chart.resize(W, H); chart.clipsContent = false; body.appendChild(chart); chart.layoutSizingHorizontal = 'FIXED';
  const pw = W - mL - mR, ph = H - mT - mB, yMax = 1.2, ticks = [0, 0.3, 0.6, 0.9, 1.2];
  const yOf = (v) => mT + ph - (v / yMax) * ph, xOf = (i) => mL + (pw * i) / 5;
  for (const t of ticks) {
    const g = figma.createVector(); g.name = 'rejilla ' + t.toFixed(2); g.vectorPaths = [{ windingRule: 'NONE', data: `M 0 0 L ${pw} 0` }]; chart.appendChild(g); g.x = mL; g.y = yOf(t); setPaints(g, 'strokes', [['border', 0.5]]); g.strokeWeight = 1; g.dashPattern = [3, 3];
    const lab = await text(t.toFixed(2) + ' €', 'Caption/Default', 'muted-foreground', chart); lab.textAlignHorizontal = 'RIGHT'; lab.resize(44, lab.height); lab.x = 4; lab.y = yOf(t) - lab.height / 2; // «0.90 €»: toFixed, con PUNTO
  }
  const FECHAS = ['4 ago', '12 ago', '21 ago', '30 ago', '9 sep', '22 sep'];
  for (let i = 0; i < 6; i++) { const lab = await text(FECHAS[i], 'Caption/Default', 'muted-foreground', chart); lab.x = xOf(i) - lab.width / 2; lab.y = mT + ph + 8; }
  for (const [token, pts] of [['chart-1', [[0, 0.95], [2, 0.99], [4, 1.05]]], ['chart-2', [[1, 0.89], [3, 0.89], [5, 0.92]]]]) {
    const v = figma.createVector(); v.name = token === 'chart-1' ? 'Mercadona' : 'Lidl'; const d = pts.map(([i, p], k) => `${k ? 'L' : 'M'} ${xOf(i) - xOf(pts[0][0])} ${yOf(p) - Math.min(...pts.map((q) => yOf(q[1])))}`).join(' ');
    v.vectorPaths = [{ windingRule: 'NONE', data: d }]; chart.appendChild(v); v.x = xOf(pts[0][0]); v.y = Math.min(...pts.map((q) => yOf(q[1]))); setPaints(v, 'strokes', [[token]]); v.strokeWeight = 2; v.strokeJoin = 'ROUND'; v.strokeCap = 'ROUND';
    for (const [i, p] of pts) { const e = figma.createEllipse(); e.name = 'punto'; e.resize(8, 8); chart.appendChild(e); e.x = xOf(i) - 4; e.y = yOf(p) - 4; setPaints(e, 'fills', [['background']]); setPaints(e, 'strokes', [[token]]); e.strokeWeight = 2; }
  }
  const lg = L6.legend.createInstance(); body.appendChild(lg); lg.layoutSizingHorizontal = 'FILL';
  const items = lg.children.filter((n) => n.type === 'FRAME'); items.forEach((it, i) => { if (i === 1) it.findOne((n) => n.type === 'TEXT').characters = 'Lidl'; if (i > 1) it.visible = false; });
  const barato = stack('Dónde te sale más barato', body, 8); await text('Dónde te sale más barato', 'Body/Small Medium', 'foreground', barato, { fill: true });
  for (const [ch, m, best, rel] of [['Lidl', 'media 0,90 €/ud · 3 compras', true, 'más barato'], ['Mercadona', 'media 1,00 €/ud · 3 compras', false, '+11%']]) {
    const li = stack(ch, barato, 12, 'HORIZONTAL'); li.primaryAxisAlignItems = 'SPACE_BETWEEN'; li.counterAxisAlignItems = 'CENTER'; padX(li, 'spacing/3'); padY(li, 'spacing/3'); rad(li, 'radius/xl'); setPaints(li, 'strokes', [[best ? 'success' : 'border', best ? 0.4 : 1]]); li.strokeWeight = 1; li.strokeAlign = 'INSIDE'; if (best) setPaints(li, 'fills', [['success', 0.05]]);
    const tx = stack('texto', li, 0); tx.layoutSizingHorizontal = 'FILL'; await text(ch, 'Body/Base Medium', 'foreground', tx, { fill: true }); await text(m, 'Caption/Default', 'muted-foreground', tx, { fill: true });
    await text(rel, 'Body/Small Medium', best ? 'success' : 'muted-foreground', li);
  }
  const compras = stack('Compras', body, 8); await text('Compras', 'Body/Small Medium', 'foreground', compras, { fill: true });
  const table = stack('tabla', compras, 0);
  const ROWS = [['Fecha', 'Tienda', 'Precio/ud', true], ['22 sep 2026', 'Lidl', '0,92 €/ud'], ['9 sep 2026', 'Mercadona', '1,05 €/ud'], ['30 ago 2026', 'Lidl', '0,89 €/ud'], ['21 ago 2026', 'Mercadona', '0,99 €/ud'], ['12 ago 2026', 'Lidl', '0,89 €/ud'], ['4 ago 2026', 'Mercadona', '0,95 €/ud']];
  for (let i = 0; i < ROWS.length; i++) {
    const [a, b, p, head] = ROWS[i]; const r = stack(head ? 'cabecera' : a, table, 0, 'HORIZONTAL'); padY(r, 'spacing/2'); if (i < ROWS.length - 1) { r.strokes = [solid('border')]; r.strokeBottomWeight = 1; r.strokeTopWeight = 0; r.strokeLeftWeight = 0; r.strokeRightWeight = 0; r.strokeAlign = 'INSIDE'; }
    const style = head ? 'Body/Small Medium' : 'Body/Small', tone = head ? 'muted-foreground' : 'foreground';
    const t1 = await text(a, style, tone, r); t1.textAutoResize = 'HEIGHT'; t1.resize(120, t1.height);
    await text(b, style, tone, r, { fill: true });
    const t3 = await text(p, style, tone, r); t3.textAlignHorizontal = 'RIGHT'; t3.textAutoResize = 'HEIGHT'; t3.resize(100, t3.height); if (!head) t3.fontName = { family: 'Geist Mono', style: 'Regular' };
  }
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

async function resumen(s, c, { next, hero, heroTone, sub, tiles }) {
  descHeader(c, 'Resumen del mes', 'Perfil', 'Septiembre 2026');
  const nv = stack('Cambiar de mes', c, 8, 'HORIZONTAL'); nv.primaryAxisAlignItems = 'SPACE_BETWEEN';
  await borderLink(nv, 'Anterior', 'chevron-left'); if (next) await borderLink(nv, 'Siguiente', null, 'chevron-right');
  const card = cardFrame(c, 'hucha del mes'); padY(card, 'spacing/4');
  const cc = stack('CardContent', card, 4); padX(cc, 'spacing/4'); padY(cc, 'spacing/6'); cc.counterAxisAlignItems = 'CENTER';
  const l1 = stack('etiqueta', cc, 6, 'HORIZONTAL'); l1.layoutSizingHorizontal = 'HUG'; l1.counterAxisAlignItems = 'CENTER'; l1.appendChild(icon('piggy-bank', 16, 'muted-foreground', 'icon')); await text('A la hucha en septiembre 2026', 'Body/Small', 'muted-foreground', l1);
  await text(hero, 'Display/4xl', heroTone, cc);
  await text(sub, 'Body/Small', 'muted-foreground', cc);
  tileGrid(c, tiles);
}

if (ARGS.screen === 'rs-cerrado') {
  const s = screen(PP.rsCerrado, 390, 'mobile'); const c = mobileContent(s);
  await resumen(s, c, { next: true, hero: '+14,37 €', heroTone: 'success', sub: 'en 6 compras, 312,48 € de gasto', tiles: [
    ['success', 'receipt', 'Frente al mes anterior', '+29,42 €', 'Has gastado menos'], ['success', 'target', 'Objetivo del mes', 'Cumplido', '37,52 € por debajo'],
    ['price', 'star', 'Producto estrella', 'Aceite de oliva virgen extra', '23,85 € en total'], ['success', 'store', 'Dónde más ahorras', 'Mercadona', '8,90 € a la hucha'],
    ['none', 'list-checks', 'Compras perfectas', '2 de 4', 'Ceñidas a la lista'], ['none', 'circle-plus', 'Capricho recurrente', 'Patatas fritas', 'Fuera de lista 2 veces']] });
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'rs-primer-mes') {
  const s = screen(PP.rsPrimer, 390, 'mobile'); const c = mobileContent(s);
  await resumen(s, c, { next: false, hero: '0,00 €', heroTone: 'success', sub: 'en 2 compras, 58,40 € de gasto', tiles: [
    ['warning', 'receipt', 'Frente al mes anterior', '-58,40 €', 'Has gastado más'], ['price', 'star', 'Producto estrella', 'Aceite de oliva virgen extra', '10,45 € en total'], ['none', 'list-checks', 'Compras perfectas', '1 de 2', 'Ceñidas a la lista']] });
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

async function perfilHeader(c) {
  const h = stack('PageHeader (con avatar)', c, 16, 'HORIZONTAL'); h.counterAxisAlignItems = 'MIN'; bind(h, 'paddingBottom', 'spacing/6'); h.primaryAxisAlignItems = 'SPACE_BETWEEN';
  const l = stack('quién', h, 12, 'HORIZONTAL'); l.layoutSizingHorizontal = 'FILL'; l.counterAxisAlignItems = 'CENTER';
  const aw = figma.createFrame(); aw.name = 'Editar tu foto y tu nombre'; aw.fills = []; aw.resize(56, 56); aw.clipsContent = false; l.appendChild(aw);
  const av = inst(L6.avatar, 'size=lg'); aw.appendChild(av); av.rescale(56 / av.width); av.x = 0; av.y = 0; av.setProperties({ [P(L6.avatar, 'initials')]: 'AP', [P(L6.avatar, 'badge')]: false });
  const pb = figma.createFrame(); pb.name = 'lápiz'; pb.layoutMode = 'HORIZONTAL'; pb.primaryAxisAlignItems = 'CENTER'; pb.counterAxisAlignItems = 'CENTER'; pb.resize(24, 24); rad(pb, 'radius/full'); setPaints(pb, 'fills', [['primary']]); setPaints(pb, 'strokes', [['background']]); pb.strokeWeight = 2; pb.strokeAlign = 'OUTSIDE'; pb.appendChild(icon('pencil', 12, 'primary-foreground', 'icon')); aw.appendChild(pb); pb.x = 56 - 24 + 2; pb.y = 56 - 24 + 2;
  const tx = stack('títulos', l, 4); tx.layoutSizingHorizontal = 'FILL'; await text('Ana Pérez', 'Title/Page', 'foreground', tx, { fill: true }); await text('Casa de los Molina', 'Body/Small', 'muted-foreground', tx, { fill: true });
  h.appendChild(IB('outline', 'icon', 'settings'));
}

if (ARGS.screen === 'pf-nuevo') {
  const s = screen(PP.pfNuevo, 390, 'mobile'); const c = mobileContent(s);
  await perfilHeader(c);
  const e = L2.empty.createInstance(); c.appendChild(e); e.layoutSizingHorizontal = 'FILL';
  e.setProperties({ [P(L2.empty, 'title')]: 'Tu hucha empieza aquí', [P(L2.empty, 'description')]: 'Escanea un ticket y esta pantalla te dirá cuánto ahorras cada mes y cuántas compras se ciñen a la lista.', [P(L2.empty, 'icon')]: iconComp('piggy-bank').id, [P(L2.empty, 'action')]: true });
  const act = e.findOne((n) => n.type === 'INSTANCE' && n.name === 'action'); act.swapComponent(variant(L.btn, 'variant=default, size=default, state=default'));
  act.setProperties({ [P(L.btn, 'label')]: 'Escanear un ticket', [P(L.btn, 'icon inline-start#')]: true, [P(L.btn, 'icon inline-start ↳')]: iconComp('scan-line').id, [P(L.btn, 'icon inline-end#')]: false });
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'pf-ahorro') {
  const s = screen(PP.pfAhorro, 390, 'mobile'); const c = mobileContent(s);
  await perfilHeader(c);
  const hu = L6.hucha.createInstance(); c.appendChild(hu); hu.layoutSizingHorizontal = 'FILL';
  tileGrid(c, [['none', 'list-checks', 'Compras perfectas', '3 de 4', 'Ceñidas a la lista'], ['none', 'receipt', 'Gasto del mes', '312,48 €', 'en 6 compras']]);
  const bb = inst(L6.objetivo, 'estado=bien'); c.appendChild(bb); bb.layoutSizingHorizontal = 'FILL';
  bb.findOne((n) => n.name === 'gastado').characters = '312,48 €'; bb.findOne((n) => n.name === 'objetivo').characters = ' / 400,00 €'; bb.findOne((n) => n.name === 'resto').characters = 'Te quedan 87,52 € este mes'; bb.findOne((n) => n.name === 'relleno').resize(358 * 0.78, 10);
  const g = stack('SettingsGroup', c, 0); rad(g, 'radius/xl'); setPaints(g, 'fills', [['card']]); setPaints(g, 'strokes', [['foreground', 0.1]]); g.strokeWeight = 1; g.strokeAlign = 'INSIDE';
  const fk = (k) => P(L2.fila, k);
  [['sparkles', 'Resumen de agosto', 'Cómo se cerró el mes pasado'], ['chart-line', 'Precios y alertas', 'Evolución de lo que compras y dónde sale más barato']].forEach(([ic, l, h], i) => {
    if (i) { const d = figma.createFrame(); d.name = 'divide-y'; d.resize(358, 1); setPaints(d, 'fills', [['border']]); g.appendChild(d); d.layoutSizingHorizontal = 'FILL'; }
    const r = inst(L2.fila, 'tipo=enlace'); g.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.setProperties({ [fk('label')]: l, [fk('hint#')]: true, [fk('hint text')]: h, [fk('icon')]: iconComp(ic).id });
  });
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

// ── Ajustes, legales y landing ──────────────────────────────────────────────
const AL = {
  ajIndice: 'Ajustes · 1 · Índice', ajHogar: 'Ajustes · 2 · Mi hogar',
  lgMovil: 'Legal · Privacidad · móvil', lgEscritorio: 'Legal · Privacidad · escritorio',
  ldMovil: 'Landing · móvil', ldEscritorio: 'Landing · escritorio',
};
const L7 = { cab: await setOf('◆ PATRONES', 'Cabecera pública'), pie: await setOf('◆ PATRONES', 'Pie público'), cb: await setOf('02 · Formularios', 'Checkbox') };
const FK = (k) => P(L2.fila, k);
function settingsRow(parent, tipo, ic, label, { hint, value, control, controlVariant = 'outline', theme } = {}) {
  const r = inst(L2.fila, 'tipo=' + tipo); parent.appendChild(r); r.layoutSizingHorizontal = 'FILL';
  const pr = { [FK('label')]: label, [FK('hint#')]: !!hint, [FK('icon')]: iconComp(ic).id, [FK('value#')]: !!value }; if (hint) pr[FK('hint text')] = hint; if (value) pr[FK('value text')] = value; r.setProperties(pr);
  if (tipo === 'control') { const b = r.findOne((n) => n.type === 'INSTANCE' && n.name === 'control'); if (theme) { b.swapComponent(variant(L.ib, 'variant=outline, size=icon, state=default')); b.setProperties({ [P(L.ib, 'icon')]: iconComp('sun').id }); } else { b.swapComponent(variant(L.btn, `variant=${controlVariant}, size=default, state=default`)); b.setProperties({ [P(L.btn, 'label')]: control }); } }
  return r;
}
function group(parent, title) { const s = stack(title || 'grupo', parent, 8); if (title) { const h = stack('título', s, 0); padX(h, 'spacing/1'); text(title, 'Body/Small Medium', 'muted-foreground', h, { fill: true }); } const box = stack('filas (divide-y)', s, 0); rad(box, 'radius/xl'); setPaints(box, 'fills', [['card']]); setPaints(box, 'strokes', [['foreground', 0.1]]); box.strokeWeight = 1; box.strokeAlign = 'INSIDE'; return box; }
function divider(box) { const d = figma.createFrame(); d.name = 'divide-y'; d.resize(10, 1); setPaints(d, 'fills', [['border']]); box.appendChild(d); d.layoutSizingHorizontal = 'FILL'; }
function rows(box, list) { list.forEach((args, i) => { if (i) divider(box); settingsRow(box, ...args); }); }

if (ARGS.screen === 'aj-indice') {
  const s = screen(AL.ajIndice, 390, 'mobile'); const c = mobileContent(s);
  descHeader(c, 'Ajustes', 'Perfil', 'Tu hogar y tus preferencias.');
  const body = stack('cuerpo', c, 24);
  const acc = stack('cuenta', body, 12, 'HORIZONTAL'); acc.primaryAxisAlignItems = 'SPACE_BETWEEN'; acc.counterAxisAlignItems = 'CENTER'; bind(acc, 'minHeight', 'spacing/14'); padX(acc, 'spacing/4'); padY(acc, 'spacing/3'); rad(acc, 'radius/xl'); setPaints(acc, 'fills', [['card']]); setPaints(acc, 'strokes', [['foreground', 0.1]]); acc.strokeWeight = 1; acc.strokeAlign = 'INSIDE';
  const at = stack('quién', acc, 0); at.layoutSizingHorizontal = 'FILL'; await text('Ana Pérez', 'Body/Small Medium', 'foreground', at, { fill: true }); await text('ana@ejemplo.com', 'Body/Small', 'muted-foreground', at, { fill: true });
  const ub = inst(L6.avatar, 'size=default'); acc.appendChild(ub); ub.rescale(28 / ub.width); ub.setProperties({ [P(L6.avatar, 'initials')]: 'AP' }); ub.name = 'UserButton de Clerk (~28 px)';
  rows(group(body, 'Hogar'), [['enlace', 'house', 'Casa de los Molina', { hint: 'Invitaciones, miembros y cambio de hogar', value: '2 miembros' }], ['accion', 'target', 'Objetivo de gasto', { hint: 'Al mes, para el panel de precios', value: '400,00 €' }], ['enlace', 'store', 'Tus supermercados', { hint: 'Dónde soléis comprar', value: '2 tiendas' }], ['enlace', 'list-ordered', 'Orden de la tienda', { hint: 'Ordena los pasillos según tu supermercado' }]]);
  rows(group(body, 'Preferencias'), [['enlace', 'bell', 'Notificaciones', { value: 'Activadas' }], ['enlace', 'smartphone', 'Alexa', { hint: 'Maneja el inventario y la lista por voz', value: 'Sin vincular' }], ['control', 'sparkles', 'Procesamiento con IA', { hint: 'Tickets, menús y recetas con la IA de Google', value: 'Aceptado', control: 'Retirar' }], ['control', 'chart-column', 'Medición de uso', { hint: 'Qué días abres la app y si usas el repaso de despensa', value: 'Activada', control: 'Desactivar' }], ['control', 'package-search', 'Repaso de despensa', { hint: 'Una vez por semana, qué te queda de lo que llevas tiempo sin mirar', value: 'Activado', control: 'Desactivar' }], ['control', 'palette', 'Tema', { hint: 'Claro, oscuro o automático', theme: true }]]);
  rows(group(body, 'Información'), [['enlace', 'info', 'Acerca de Fill Good', { hint: 'Créditos y textos legales' }]]);
  const cu = group(body, 'Cuenta'); rows(cu, [['accion', 'download', 'Exportar mis datos', { hint: 'Descarga tu cuenta y el contenido de tu hogar en JSON' }], ['accion', 'log-out', 'Cerrar sesión']]); divider(cu); const del = settingsRow(cu, 'accion-destructiva', 'trash', 'Borrar cuenta');
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'aj-hogar') {
  const s = screen(AL.ajHogar, 390, 'mobile'); const c = mobileContent(s);
  descHeader(c, 'Mi hogar', 'Ajustes', 'Invitaciones, miembros y propiedad de «Casa de los Molina».');
  const body = stack('tarjetas', c, 16);
  const card = async (title, desc) => { const f = cardFrame(body, title); padY(f, 'spacing/4'); const h = stack('CardHeader', f, 4); padX(h, 'spacing/4'); await text(title, 'Title/Card', 'card-foreground', h, { fill: true }); if (desc) await text(desc, 'Body/Small', 'muted-foreground', h, { fill: true }); const ct = stack('CardContent', f, 8); padX(ct, 'spacing/4'); return ct; };
  const inv = await card('Invitar al hogar', 'Comparte el enlace para que otros miembros se unan con un solo toque. También puedes dictarles el código. Cada código vale 7 días, y al regenerarlo el anterior deja de funcionar.');
  await text('Código de invitación', 'Body/Small Medium', 'foreground', inv, { fill: true });
  const cr = stack('código', inv, 8, 'HORIZONTAL'); cr.counterAxisAlignItems = 'CENTER';
  const code = stack('code', cr, 0, 'HORIZONTAL'); code.layoutSizingHorizontal = 'FILL'; padX(code, 'spacing/3'); padY(code, 'spacing/2_5'); rad(code, 'radius/lg'); setPaints(code, 'fills', [['muted']]); setPaints(code, 'strokes', [['border']]); code.strokeWeight = 1; code.strokeAlign = 'INSIDE'; code.clipsContent = false;
  const ct = await text('A1B2C3D4E5F6', 'Body/Base', 'foreground', code); ct.fontName = { family: 'Geist Mono', style: 'Regular' }; bind(ct, 'fontSize', 'font-size/lg'); ct.letterSpacing = { value: 10, unit: 'PERCENT' }; // font-mono text-lg tracking-widest
  for (const ic of ['copy', 'share-2', 'refresh-cw']) cr.appendChild(IB('outline', 'icon', ic));
  await text('Caduca el 7 de octubre.', 'Body/Small', 'muted-foreground', inv, { fill: true });
  const mem = await card('Miembros (2)');
  for (const [n, me, owner] of [['Ana Pérez', true, true], ['Jorge', false, false]]) {
    const r = stack(n, mem, 8, 'HORIZONTAL'); r.primaryAxisAlignItems = 'SPACE_BETWEEN'; r.counterAxisAlignItems = 'CENTER';
    const nt = await text(me ? `${n} (tú)` : n, 'Body/Small', 'foreground', r, { fill: true }); if (me) nt.setRangeFills(n.length, nt.characters.length, [solid('muted-foreground')]);
    const rt = stack('derecha', r, 8, 'HORIZONTAL'); rt.layoutSizingHorizontal = 'HUG'; rt.counterAxisAlignItems = 'CENTER';
    const b = inst(L3.badge, owner ? 'variant=default' : 'variant=secondary'); rt.appendChild(b); b.setProperties({ [P(L3.badge, 'label')]: owner ? 'Propietario' : 'Miembro' });
    if (!owner) rt.appendChild(IB('ghost', 'icon', 'user-minus'));
  }
  const hs = await card('Tus hogares', 'Puedes tener más de un hogar: una segunda residencia, la casa de vacaciones…');
  const hb = fullBtn(hs, 'outline', 'default', 'Crear o unirse a otro hogar', 'house-plus'); hb.primaryAxisAlignItems = 'MIN';
  const ge = await card('Gestión del hogar', 'Puedes ceder la propiedad y seguir en el hogar, o abandonarlo transfiriéndola en el mismo paso.');
  for (const [v, l, ic] of [['outline', 'Cambiar nombre', 'pencil'], ['outline', 'Transferir propiedad', 'crown'], ['destructive', 'Abandonar hogar', 'log-out'], ['destructive', 'Eliminar hogar', 'trash']]) { const b = fullBtn(ge, v, 'default', l, ic); b.primaryAxisAlignItems = 'MIN'; }
  await endPerfil(s, c);
  return { screen: s.id, h: Math.round(s.height), codeOverflow: Math.round(ct.width + 24 - code.width), fixedIcons: await fixIconColors(s) };
}

// Páginas públicas: fuera del shell, cabecera y pie de la landing
function publicScreen(name, desktopMode) { const s = screen(name, desktopMode ? 1280 : 390, desktopMode ? 'desktop' : 'mobile'); s.layoutMode = 'VERTICAL'; s.primaryAxisSizingMode = 'AUTO'; s.counterAxisSizingMode = 'FIXED'; s.itemSpacing = 0; s.counterAxisAlignItems = 'CENTER'; const h = inst(L7.cab, 'viewport=' + (desktopMode ? 'desktop' : 'mobile')); s.appendChild(h); return s; }
function publicFooter(s, desktopMode) { const f = inst(L7.pie, 'viewport=' + (desktopMode ? 'desktop' : 'mobile')); s.appendChild(f); }
async function legalText(parent, chars, bolds = []) { const t = await text(chars, 'Body/Small', 'muted-foreground', parent, { fill: true }); t.lineHeight = { value: 162.5, unit: 'PERCENT' }; for (const b of bolds) { const i = chars.indexOf(b); if (i >= 0) { t.setRangeFontName(i, i + b.length, { family: 'Geist', style: 'Medium' }); t.setRangeFills(i, i + b.length, [solid('foreground')]); } } return t; }

async function legalPage(desktopMode) {
  const s = publicScreen(desktopMode ? AL.lgEscritorio : AL.lgMovil, desktopMode);
  const main = stack('main', s, 0); main.counterAxisAlignItems = 'CENTER'; padY(main, desktopMode ? 'spacing/14' : 'spacing/10');
  const col = stack('PageContainer prose', main, 32); col.layoutSizingHorizontal = 'FIXED'; col.resize(desktopMode ? 672 : 390, 10); col.layoutSizingVertical = 'HUG'; padX(col, desktopMode ? 'spacing/6' : 'spacing/4');
  const hd = stack('cabecera', col, 8); const h1 = await text('Política de privacidad', 'Title/Page', 'foreground', hd, { fill: true }); if (desktopMode) bind(h1, 'fontSize', 'font-size/3xl'); await text('Última actualización: 28 de septiembre de 2026', 'Caption/Default', 'muted-foreground', hd, { fill: true });
  await legalText(col, 'Esta política explica qué datos personales tratamos cuando usas Fill Good, con qué finalidad, con qué base legal y qué derechos tienes. La resumimos en una frase: guardamos lo mínimo para que la app funcione, no vendemos tus datos y no usamos publicidad ni analítica de terceros.', ['Fill Good']);
  const sec = async (title) => { const x = stack(title, col, 12); await text(title, 'Title/Section', 'foreground', x, { fill: true }); return x; };
  const s1 = await sec('1. Responsable del tratamiento');
  const ul = await legalText(s1, 'Titular: Jorge Molina Fuster\nContacto: fillgood@jorgemolinafuster.com', ['Titular:', 'Contacto:']); ul.setRangeListOptions(0, ul.characters.length, { type: 'UNORDERED' });
  const s2 = await sec('2. Qué datos tratamos');
  await legalText(s2, 'Datos de tu cuenta. Al registrarte, nuestro proveedor de identidad (Clerk) gestiona tu dirección de correo, tu nombre y, si la añades, tu foto de perfil, además de los identificadores técnicos de sesión necesarios para mantenerte conectado.', ['Datos de tu cuenta.']);
  await legalText(s2, 'Contenido de tu hogar. Lo que tú y los miembros de tu hogar introducís al usar la app: inventario y ubicaciones, fechas de caducidad, lista de la compra, recetas, menús semanales, presupuesto mensual y orden de pasillos de tu tienda.', ['Contenido de tu hogar.']);
  await legalText(s2, 'Tickets de compra. Cuando escaneas un ticket, el archivo (imagen o PDF) se procesa para extraer sus datos y no se almacena en nuestros servidores. Lo que se guarda es el resultado de la extracción: establecimiento, fecha, importes y líneas de producto con sus precios.', ['Tickets de compra.', 'no se almacena']);
  const rest = stack('resto (sin dibujar)', col, 12); padY(rest, 'spacing/4'); rad(rest, 'radius/lg'); padX(rest, 'spacing/4'); setPaints(rest, 'strokes', [['border']]); rest.strokeWeight = 1; rest.strokeAlign = 'INSIDE'; rest.dashPattern = [4, 4];
  await text('Sigue igual: 3. Para qué y con qué base legal · 4. Con quién se comparten · 5. Inteligencia artificial · 6. Transferencias internacionales · 7. Cuánto tiempo conservamos los datos · 8. Tus derechos · 9. Menores de edad · 10. Cookies y almacenamiento local · 11. Seguridad · 12. Cambios en esta política', 'Caption/Default', 'muted-foreground', rest, { fill: true });
  publicFooter(s, desktopMode);
  return s;
}
if (ARGS.screen === 'lg-movil' || ARGS.screen === 'lg-escritorio') { const s = await legalPage(ARGS.screen === 'lg-escritorio'); return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) }; }

async function pantryRow(parent, name, slug, badge, tone) {
  const r = stack(name, parent, 12, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; padX(r, 'spacing/3'); padY(r, 'spacing/3'); rad(r, 'radius/xl'); setPaints(r, 'fills', [['card']]); setPaints(r, 'strokes', [['border']]); r.strokeWeight = 1; r.strokeAlign = 'INSIDE';
  r.appendChild(product(slug, 28)); await text(name, 'Body/Small Medium', 'foreground', r, { fill: true });
  const b = inst(L3.badge, 'variant=default'); r.appendChild(b); b.setProperties({ [P(L3.badge, 'label')]: badge }); setPaints(b, 'fills', [[tone, 0.15]]); for (const t of b.findAll((x) => x.type === 'TEXT')) setPaints(t, 'fills', [[tone]]);
}
async function phone(parent, desktopMode) {
  const w = figma.createFrame(); w.name = 'HeroPreview (teléfono)'; w.fills = []; w.clipsContent = false; w.resize(320, 10); parent.appendChild(w);
  const ph = stack('marco', null, 0); w.appendChild(ph); ph.resize(320, 10); ph.layoutSizingVertical = 'HUG'; padX(ph, 'spacing/2'); padY(ph, 'spacing/2'); rad(ph, 'radius/3xl'); setPaints(ph, 'fills', [['card']]); setPaints(ph, 'strokes', [['border']]); ph.strokeWeight = 1; ph.strokeAlign = 'INSIDE';
  const lg = (await figma.getLocalEffectStylesAsync()).find((e) => e.name === 'Shadow/lg'); if (lg) await ph.setEffectStyleIdAsync(lg.id);
  const sc = stack('pantalla', ph, 0); rad(sc, 'radius/2xl'); setPaints(sc, 'fills', [['background']]); sc.clipsContent = true; sc.counterAxisAlignItems = 'CENTER';
  const notch = figma.createFrame(); notch.name = 'notch'; notch.resize(64, 6); rad(notch, 'radius/full'); setPaints(notch, 'fills', [['border']]); const nw = stack('notch', sc, 0); nw.counterAxisAlignItems = 'CENTER'; bind(nw, 'paddingTop', 'spacing/3'); nw.appendChild(notch);
  const hd = stack('cabecera', sc, 8, 'HORIZONTAL'); hd.primaryAxisAlignItems = 'SPACE_BETWEEN'; hd.counterAxisAlignItems = 'BASELINE'; padX(hd, 'spacing/4'); bind(hd, 'paddingTop', 'spacing/4'); bind(hd, 'paddingBottom', 'spacing/3');
  await text('Despensa', 'Title/Base', 'foreground', hd); await text('12 productos', 'Caption/Default', 'muted-foreground', hd);
  const rs = stack('filas', sc, 8); padX(rs, 'spacing/3'); bind(rs, 'paddingBottom', 'spacing/5');
  for (const a of [['Café molido', 'cafe', 'En stock', 'success'], ['Fresas', 'fresa', 'Caduca en 2 días', 'warning'], ['Espinacas frescas', 'lechuga', 'Caducado', 'destructive'], ['Berenjenas', 'berenjena', 'En stock', 'success']]) await pantryRow(rs, ...a);
  w.resize(320, ph.height);
  if (desktopMode) {
    ph.rotation = -2; ph.y = 16; // lg:translate-y-4 lg:rotate-2 (Figma gira al revés que CSS)
    const n = stack('aviso flotante (lg)', null, 8, 'HORIZONTAL'); w.appendChild(n); n.primaryAxisSizingMode = 'AUTO'; n.counterAxisSizingMode = 'AUTO'; n.counterAxisAlignItems = 'CENTER'; padX(n, 'spacing/3'); padY(n, 'spacing/2'); rad(n, 'radius/xl'); setPaints(n, 'fills', [['card']]); setPaints(n, 'strokes', [['border']]); n.strokeWeight = 1; n.strokeAlign = 'INSIDE';
    const sm = (await figma.getLocalEffectStylesAsync()).find((e) => e.name === 'Shadow/sm'); if (sm) await n.setEffectStyleIdAsync(sm.id);
    const ib = stack('icono', n, 0, 'HORIZONTAL'); ib.resize(32, 32); ib.primaryAxisAlignItems = 'CENTER'; ib.counterAxisAlignItems = 'CENTER'; ib.primaryAxisSizingMode = 'FIXED'; ib.counterAxisSizingMode = 'FIXED'; rad(ib, 'radius/lg'); setPaints(ib, 'fills', [['warning', 0.15]]); ib.appendChild(icon('bell', 16, 'warning', 'icon'));
    await text('El yogur caduca pronto', 'Body/Small Medium', 'foreground', n); n.x = -24; n.y = -16;
    w.resize(320, ph.height + 16);
  }
  return w;
}
function landingSection(s, name, cw, { bg, top = true, py = ['spacing/16', 'spacing/24'], desktopMode }) {
  const sec = stack(name, s, 0); sec.counterAxisAlignItems = 'CENTER'; padY(sec, desktopMode ? py[1] : py[0]); if (bg) setPaints(sec, 'fills', [bg]);
  if (top) { sec.strokes = [solid('border')]; sec.strokeTopWeight = 1; sec.strokeBottomWeight = 0; sec.strokeLeftWeight = 0; sec.strokeRightWeight = 0; sec.strokeAlign = 'INSIDE'; }
  const inner = stack('contenedor', sec, 0); inner.layoutSizingHorizontal = 'FIXED'; inner.resize(cw, 10); inner.layoutSizingVertical = 'HUG';
  return inner;
}
async function h2(parent, chars, desktopMode, maxW) { const t = await text(chars, 'Display/3xl', 'foreground', parent, { fill: !maxW }); if (desktopMode) bind(t, 'fontSize', 'font-size/4xl'); if (maxW) { t.textAutoResize = 'HEIGHT'; t.resize(Math.min(maxW, parent.width), t.height); } return t; }
async function bodyLg(parent, chars, tone = 'muted-foreground', maxW) { const t = await text(chars, 'Body/Base', tone, parent, { fill: !maxW }); bind(t, 'fontSize', 'font-size/lg'); t.lineHeight = { value: 155, unit: 'PERCENT' }; if (maxW) { t.textAutoResize = 'HEIGHT'; t.resize(Math.min(maxW, parent.width), t.height); } return t; }
async function h3(parent, chars) { const t = await text(chars, 'Body/Base Medium', 'foreground', parent, { fill: true }); bind(t, 'fontSize', 'font-size/lg'); return t; }
// MEDIDO: cambiar layoutMode intercambia qué eje es el principal, y los modos de tamaño
// se quedan con el eje, no con la dirección: el ancho fijo pasaba a ser el ALTO fijo y la
// sección dejaba de crecer con su contenido. Se vuelven a poner después del cambio.
function fixAxes(f, w) { f.layoutSizingHorizontal = 'FIXED'; f.resize(w, Math.max(1, f.height)); f.layoutSizingVertical = 'HUG'; }
function gapV(parent, px) { const g = figma.createFrame(); g.name = 'mt-' + px / 4; g.fills = []; g.resize(1, px); parent.appendChild(g); return g; }

async function landing(desktopMode) {
  const s = publicScreen(desktopMode ? AL.ldEscritorio : AL.ldMovil, desktopMode);
  const cw = desktopMode ? 1104 : 358;
  // Hero
  const hero = landingSection(s, 'Hero', cw, { top: false, py: ['spacing/8', 'spacing/24'], desktopMode }); if (!desktopMode) bind(hero.parent, 'paddingBottom', 'spacing/16');
  hero.layoutMode = desktopMode ? 'HORIZONTAL' : 'VERTICAL'; hero.itemSpacing = desktopMode ? 32 : 40; hero.counterAxisAlignItems = 'CENTER'; fixAxes(hero, cw);
  const tb = stack('texto', hero, 0); if (desktopMode) { tb.layoutSizingHorizontal = 'FIXED'; tb.resize(631, 10); tb.layoutSizingVertical = 'HUG'; }
  const h1 = await text('Compra lo justo, ahorra más', 'Display/4xl', 'foreground', tb, { fill: true }); if (desktopMode) bind(h1, 'fontSize', 'font-size/6xl');
  gapV(tb, 20); await bodyLg(tb, 'La despensa, la lista de la compra y los precios de tu súper, compartidos con toda tu casa.', 'muted-foreground', desktopMode ? 470 : null);
  gapV(tb, 32); const ctas = stack('CTAs', tb, 12, desktopMode ? 'HORIZONTAL' : 'VERTICAL'); if (desktopMode) ctas.layoutSizingHorizontal = 'HUG';
  for (const [v, l] of [['default', 'Crear cuenta gratis'], ['outline', 'Iniciar sesión']]) { const b = BTN(v, 'lg', l); ctas.appendChild(b); if (!desktopMode) b.layoutSizingHorizontal = 'FILL'; }
  const pv = stack('preview', hero, 0); pv.counterAxisAlignItems = 'CENTER'; if (desktopMode) { pv.layoutSizingHorizontal = 'FIXED'; pv.resize(441, 10); pv.layoutSizingVertical = 'HUG'; } await phone(pv, desktopMode);
  // Cómo funciona
  const how = landingSection(s, 'Cómo funciona', cw, { desktopMode });
  await h2(how, 'Del ticket a la despensa, en un minuto', desktopMode, desktopMode ? 460 : null); gapV(how, desktopMode ? 56 : 40);
  const ol = stack('pasos', how, desktopMode ? 24 : 32, desktopMode ? 'HORIZONTAL' : 'VERTICAL');
  const STEPS = [['scan-line', 'Escanea el ticket', 'Haz una foto al salir del súper. La IA la convierte en productos con sus precios.'], ['refrigerator', 'Tu despensa al día con cada ticket', 'El inventario refleja lo que hay en casa y avisa de lo que caduca.'], ['shopping-cart', 'Compra solo lo que falta', 'La lista compartida te sugiere lo que se agota, sin duplicados.']];
  for (let i = 0; i < 3; i++) {
    const [ic, t, b] = STEPS[i]; const li = stack(t, ol, 16, desktopMode ? 'VERTICAL' : 'HORIZONTAL'); li.counterAxisAlignItems = 'MIN'; if (desktopMode) li.layoutSizingHorizontal = 'FILL'; li.clipsContent = false;
    const tile = stack('icono', li, 0, 'HORIZONTAL'); tile.layoutSizingHorizontal = 'FIXED'; tile.resize(48, 48); tile.layoutSizingVertical = 'FIXED'; tile.primaryAxisAlignItems = 'CENTER'; tile.counterAxisAlignItems = 'CENTER'; rad(tile, 'radius/lg'); setPaints(tile, 'fills', [['secondary']]); tile.appendChild(icon(ic, 24, 'secondary-foreground', 'icon'));
    const tx = stack('texto', li, 6); tx.layoutSizingHorizontal = 'FILL'; await h3(tx, t); await text(b, 'Body/Base', 'muted-foreground', tx, { fill: true });
    if (desktopMode && i > 0) { const ch = icon('chevron-right', 20, 'muted-foreground', 'separador (md)'); ch.opacity = 0.4; li.appendChild(ch); ch.layoutPositioning = 'ABSOLUTE'; ch.x = -20; ch.y = 12; }
  }
  // Bento
  const bento = landingSection(s, 'Bento', cw, { desktopMode });
  await h2(bento, 'Todo lo de casa, en una sola app', desktopMode); gapV(bento, desktopMode ? 56 : 40);
  const cell = async (parent, bg, ic, t, b) => { const x = stack(t, parent, 0); padX(x, 'spacing/6'); padY(x, 'spacing/6'); rad(x, 'radius/xl'); setPaints(x, 'fills', [[bg]]); setPaints(x, 'strokes', [['border']]); x.strokeWeight = 1; x.strokeAlign = 'INSIDE'; if (ic) { x.appendChild(icon(ic, 24, 'foreground', 'icon')); gapV(x, 12); } await h3(x, t); gapV(x, 6); await text(b, 'Body/Base', 'muted-foreground', x, { fill: true }); return x; };
  const grid = stack('rejilla (md:grid-cols-4)', bento, 16, 'VERTICAL');
  let c1, c2, c3, c4, c5, c6;
  if (desktopMode) {
    const r12 = stack('filas 1-2', grid, 16, 'HORIZONTAL'); r12.counterAxisAlignItems = 'MIN';
    c1 = await cell(r12, 'card', null, 'Caducidades a la vista', 'El semáforo te dice qué va justo de fecha antes de que se tire.'); c1.layoutSizingHorizontal = 'FILL';
    const right = stack('derecha', r12, 16); right.layoutSizingHorizontal = 'FILL';
    c2 = await cell(right, 'secondary', null, 'Precios súper a súper', 'Fill Good recuerda lo que pagaste en cada súper y te enseña dónde te sale mejor.');
    const r2 = stack('fila 2', right, 16, 'HORIZONTAL'); c3 = await cell(r2, 'card', null, 'Lista compartida en tiempo real', 'Lo que apunta uno lo ve toda la casa, al momento.'); c4 = await cell(r2, 'accent', 'receipt-text', 'Tickets leídos por IA', 'Foto o PDF: los productos, cantidades y precios se apuntan solos.'); for (const x of [c3, c4]) { x.layoutSizingHorizontal = 'FILL'; }
    const r3 = stack('fila 3', grid, 16, 'HORIZONTAL'); c5 = await cell(r3, 'card', 'calendar-days', 'Del menú semanal a la lista', 'Planifica la semana y añade sus ingredientes a la lista en un toque.'); c6 = await cell(r3, 'card', 'smartphone', 'Instálala como app', 'En tu móvil, con avisos de caducidad. Sin pasar por ninguna tienda de apps.'); for (const x of [c5, c6]) x.layoutSizingHorizontal = 'FILL';
  } else {
    c1 = await cell(grid, 'card', null, 'Caducidades a la vista', 'El semáforo te dice qué va justo de fecha antes de que se tire.');
    c2 = await cell(grid, 'secondary', null, 'Precios súper a súper', 'Fill Good recuerda lo que pagaste en cada súper y te enseña dónde te sale mejor.');
    c3 = await cell(grid, 'card', null, 'Lista compartida en tiempo real', 'Lo que apunta uno lo ve toda la casa, al momento.');
    c4 = await cell(grid, 'accent', 'receipt-text', 'Tickets leídos por IA', 'Foto o PDF: los productos, cantidades y precios se apuntan solos.');
    c5 = await cell(grid, 'card', 'calendar-days', 'Del menú semanal a la lista', 'Planifica la semana y añade sus ingredientes a la lista en un toque.');
    c6 = await cell(grid, 'card', 'smartphone', 'Instálala como app', 'En tu móvil, con avisos de caducidad. Sin pasar por ninguna tienda de apps.');
  }
  gapV(c1, 20); const pr = stack('filas', c1, 8); for (const a of [['Zanahorias', 'zanahoria', 'En stock', 'success'], ['Filetes de ternera', 'carne', 'Caduca en 3 días', 'warning'], ['Salmón fresco', 'pescado', 'Caducado', 'destructive']]) await pantryRow(pr, ...a);
  gapV(c2, 16); const chipsR = stack('súpers', c2, 8, 'HORIZONTAL'); chipsR.layoutWrap = 'WRAP'; chipsR.counterAxisSpacing = 8;
  for (const [n, p, k] of [['Súper A', '1,89 €', 'chart-1'], ['Súper B', '2,05 €', 'chart-2'], ['Súper C', '1,79 €', 'chart-3']]) { const ch = stack(n, chipsR, 8, 'HORIZONTAL'); ch.layoutSizingHorizontal = 'HUG'; ch.counterAxisAlignItems = 'CENTER'; padX(ch, 'spacing/3'); padY(ch, 'spacing/1_5'); rad(ch, 'radius/full'); setPaints(ch, 'fills', [['card']]); setPaints(ch, 'strokes', [['border']]); ch.strokeWeight = 1; ch.strokeAlign = 'INSIDE'; const d = figma.createEllipse(); d.name = 'punto'; d.resize(8, 8); setPaints(d, 'fills', [[k]]); ch.appendChild(d); await text(n, 'Body/Small Medium', 'foreground', ch); const pt = await text(p, 'Body/Small', 'muted-foreground', ch); pt.fontName = { family: 'Geist Mono', style: 'Regular' }; }
  gapV(c3, 16); const tm = stack('Tomates', c3, 10, 'HORIZONTAL'); tm.counterAxisAlignItems = 'CENTER'; tm.appendChild(inst(L7.cb, 'state=disabled, checked=true')); const tt = await text('Tomates', 'Body/Small', 'muted-foreground', tm); tt.textDecoration = 'STRIKETHROUGH';
  if (desktopMode) { const rh = c1.parent.findOne((n) => n.name === 'derecha'); c1.layoutSizingVertical = 'FIXED'; c1.resize(c1.width, rh.height); for (const x of [c5, c6]) x.layoutSizingVertical = 'FILL'; for (const x of [c3, c4]) x.layoutSizingVertical = 'FILL'; }
  // Precios
  const sp = landingSection(s, 'Precios', cw, { bg: ['muted'], desktopMode });
  sp.layoutMode = desktopMode ? 'HORIZONTAL' : 'VERTICAL'; sp.itemSpacing = desktopMode ? 48 : 32; sp.counterAxisAlignItems = 'CENTER'; fixAxes(sp, cw);
  const stx = stack('texto', null, 0); const fig = stack('figure', null, 0);
  if (desktopMode) { sp.appendChild(fig); sp.appendChild(stx); for (const x of [fig, stx]) { x.layoutSizingHorizontal = 'FIXED'; x.resize(528, 10); x.layoutSizingVertical = 'HUG'; } } else { sp.appendChild(stx); sp.appendChild(fig); for (const x of [stx, fig]) { x.layoutSizingHorizontal = 'FILL'; x.layoutSizingVertical = 'HUG'; } }
  await h2(stx, 'Tus tickets se convierten en tu historial de precios', desktopMode); gapV(stx, 16); await bodyLg(stx, 'Cada ticket guarda lo que pagaste y dónde. Fill Good compara tus súpers y te avisa cuando algo sube.', 'muted-foreground', desktopMode ? 480 : null);
  padX(fig, 'spacing/5'); padY(fig, 'spacing/5'); rad(fig, 'radius/xl'); setPaints(fig, 'fills', [['card']]); setPaints(fig, 'strokes', [['border']]); fig.strokeWeight = 1; fig.strokeAlign = 'INSIDE';
  const cap = stack('figcaption', fig, 8, 'HORIZONTAL'); cap.primaryAxisAlignItems = 'SPACE_BETWEEN'; cap.counterAxisAlignItems = 'BASELINE'; await text('Aceite de oliva 1 L', 'Body/Base Medium', 'foreground', cap); await text('Precio, últimos meses', 'Caption/Default', 'muted-foreground', cap);
  gapV(fig, 12);
  const W = fig.width - 40, H = W * 120 / 320, sx = W / 320, sy = H / 120, V = [8.1, 8.45, 8.3, 8.95, 9.25, 9.1, 9.7, 9.95], mn = Math.min(...V), mx = Math.max(...V);
  const pts = V.map((v, i) => [12 + (i / 7) * 296, 12 + (1 - (v - mn) / (mx - mn)) * 96]);
  const svg = figma.createFrame(); svg.name = 'sparkline (viewBox 320×120, preserveAspectRatio none)'; svg.fills = []; svg.resize(W, H); svg.clipsContent = false; fig.appendChild(svg); svg.layoutSizingHorizontal = 'FILL';
  // Coordenadas RELATIVAS al origen de cada vector, y el vector se coloca en (ox, oy)
  const ox = 12 * sx, oy = Math.min(...pts.map((p) => p[1])) * sy;
  const rel = (x, y) => `${(x * sx - ox).toFixed(1)} ${(y * sy - oy).toFixed(1)}`;
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${rel(x, y)}`).join(' ');
  const area = figma.createVector(); area.name = 'área'; area.vectorPaths = [{ windingRule: 'NONZERO', data: `${path} L ${rel(308, 108)} L ${rel(12, 108)} Z` }]; svg.appendChild(area); area.x = ox; area.y = oy; setPaints(area, 'fills', [['chart-3', 0.1]]); area.strokes = [];
  const line = figma.createVector(); line.name = 'línea'; line.vectorPaths = [{ windingRule: 'NONE', data: path }]; svg.appendChild(line); line.x = ox; line.y = oy; setPaints(line, 'strokes', [['chart-3']]); line.strokeWeight = 2.5; line.strokeCap = 'ROUND'; line.strokeJoin = 'ROUND';
  const [lx, ly] = pts[7]; const dot = figma.createEllipse(); dot.name = 'último'; dot.resize(7, 7); svg.appendChild(dot); dot.x = lx * sx - 3.5; dot.y = ly * sy - 3.5; setPaints(dot, 'fills', [['chart-3']]);
  gapV(fig, 16); const rl = stack('precios', fig, 8);
  for (const [n, p, best] of [['Súper A', '9,85 €'], ['Súper B', '10,20 €'], ['Súper C', '9,49 €', true]]) { const r = stack(n, rl, 8, 'HORIZONTAL'); r.primaryAxisAlignItems = 'SPACE_BETWEEN'; r.counterAxisAlignItems = 'CENTER'; await text(n, 'Body/Small', 'muted-foreground', r); const pr2 = stack('precio', r, 6, 'HORIZONTAL'); pr2.layoutSizingHorizontal = 'HUG'; pr2.counterAxisAlignItems = 'CENTER'; if (best) await text('más barato', 'Caption/Default', 'success', pr2); const pt = await text(p, best ? 'Body/Small Medium' : 'Body/Small', best ? 'success' : 'foreground', pr2); pt.fontName = { family: 'Geist Mono', style: best ? 'Medium' : 'Regular' }; }
  // FAQ (PageContainer narrow: 512 px)
  const faq = landingSection(s, 'Preguntas frecuentes', desktopMode ? 464 : 358, { desktopMode });
  await h2(faq, 'Preguntas frecuentes', desktopMode); gapV(faq, 32);
  const fl = stack('lista', faq, 12);
  const FAQ = [['¿Cuánto cuesta?', 'Nada. Fill Good es gratis.'], ['¿Funciona con mi supermercado?'], ['¿Tengo que instalar algo?'], ['¿Quién ve mis datos?'], ['¿Cuántas personas pueden usarla?']];
  for (const [q, a] of FAQ) { const d = stack(q, fl, 0); rad(d, 'radius/lg'); setPaints(d, 'fills', [['card']]); setPaints(d, 'strokes', [['border']]); d.strokeWeight = 1; d.strokeAlign = 'INSIDE'; const sm = stack('summary', d, 12, 'HORIZONTAL'); sm.primaryAxisAlignItems = 'SPACE_BETWEEN'; sm.counterAxisAlignItems = 'CENTER'; bind(sm, 'minHeight', 'spacing/11'); padX(sm, 'spacing/4'); padY(sm, 'spacing/3'); await text(q, 'Body/Base Medium', 'foreground', sm, { fill: true }); const cv = icon(a ? 'chevron-up' : 'chevron-down', 20, 'muted-foreground', 'chevron'); sm.appendChild(cv); if (a) { const an = stack('respuesta', d, 0); padX(an, 'spacing/4'); bind(an, 'paddingBottom', 'spacing/4'); await text(a, 'Body/Base', 'muted-foreground', an, { fill: true }); } }
  // CTA
  const cta = landingSection(s, 'CTA', desktopMode ? 672 : 358, { bg: ['primary'], top: false, desktopMode }); cta.counterAxisAlignItems = 'CENTER';
  const ch2 = await text('Empieza hoy con tu casa', 'Display/3xl', 'primary-foreground', cta, { fill: true }); ch2.textAlignHorizontal = 'CENTER'; if (desktopMode) bind(ch2, 'fontSize', 'font-size/4xl');
  gapV(cta, 16); const cp = await bodyLg(cta, 'Crea tu hogar, invita a los tuyos y comprad con cabeza.', 'primary-foreground'); setPaints(cp, 'fills', [['primary-foreground', 0.9]]); cp.textAlignHorizontal = 'CENTER';
  gapV(cta, 32); const cb = BTN('secondary', 'lg', 'Crear cuenta gratis'); cta.appendChild(cb); if (!desktopMode) cb.layoutSizingHorizontal = 'FILL';
  publicFooter(s, desktopMode);
  return s;
}
if (ARGS.screen === 'ld-movil' || ARGS.screen === 'ld-escritorio') { const s = await landing(ARGS.screen === 'ld-escritorio'); return { screen: s.id, h: Math.round(s.height), fixedIcons: await fixIconColors(s) }; }

// ── Escáner de documentos ───────────────────────────────────────────────────
// receipts/components/document-scanner.tsx: fixed inset-0 z-[60] con la clase `dark`
// forzada, así que la pantalla va en modo Dark sea cual sea el tema. El visor es el vídeo
// (object-contain) con un canvas encima: velo negro al 50 % fuera del recorte y el trazo
// del polígono (3 px, primary buscando, success al bloquearse). La imagen de la cámara es
// una ILUSTRACIÓN con tokens: en código es el vídeo, no hay nada que copiar.
const ES = {
  abriendo: 'Escáner · 1 · Abriendo la cámara', encuadre: 'Escáner · 2 · Encuadrando', detectado: 'Escáner · 3 · Ticket detectado',
  ajuste: 'Escáner · 4 · Ajustar el recorte', sinCamara: 'Escáner · Sin cámara (vuelve al formulario)',
};
const L8 = {
  ctrl: await setOf('◆ PATRONES', 'Controles del escáner'), tirador: await setOf('◆ PATRONES', 'Tirador de esquina'),
  fila: await setOf('◆ PATRONES', 'Fila del modo compra'), chip: await setOf('◆ PATRONES', 'Chip de tienda'),
  cogidos: await setOf('◆ PATRONES', 'Plegable de cogidos'), reco: await setOf('◆ PATRONES', 'Recomendados'),
};
const darkMode = (n) => n.setExplicitVariableModeForCollection(colorCol, colorCol.modes.find((m) => m.name === 'Dark').modeId);
// Vector con coordenadas del padre: el trazado se escribe relativo a su esquina y se coloca
function vec(parent, name, subpaths, { closed = true, winding = 'NONZERO' } = {}) {
  const pts = subpaths.flat(); const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
  const d = subpaths.map((sp) => sp.map((p, i) => `${i ? 'L' : 'M'} ${(p[0] - minX).toFixed(2)} ${(p[1] - minY).toFixed(2)}`).join(' ') + (closed ? ' Z' : '')).join(' ');
  const v = figma.createVector(); v.name = name; v.strokes = []; parent.appendChild(v); // un vector nace con trazo negro sin enlazar v.vectorPaths = [{ windingRule: winding, data: d }]; v.x = minX; v.y = minY; return v;
}
const QUAD = [[78, 118], [300, 102], [322, 556], [62, 574]]; // TL, TR, BR, BL del ticket en el vídeo
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
async function scannerScreen(name, fase, { scene = true, poly = null, handles = false } = {}) {
  const s = screen(name, 390, 'mobile'); darkMode(s);
  s.layoutMode = 'VERTICAL'; s.primaryAxisSizingMode = 'FIXED'; s.counterAxisSizingMode = 'FIXED'; s.resize(390, 844); s.itemSpacing = 0;
  const v = figma.createFrame(); v.name = 'visor (video object-contain + canvas)'; v.fills = []; v.clipsContent = true; s.appendChild(v); v.layoutSizingHorizontal = 'FILL'; v.layoutSizingVertical = 'FILL';
  const c = inst(L8.ctrl, 'fase=' + fase); s.appendChild(c); c.layoutSizingHorizontal = 'FILL';
  const W = 390, H = Math.round(v.height), vh = Math.min(H, Math.round(W * 16 / 9)), oy = Math.round((H - vh) / 2); // 1080×1920 en contain
  if (scene) {
    const cam = figma.createFrame(); cam.name = 'imagen de la cámara (ilustración)'; v.appendChild(cam); cam.x = 0; cam.y = oy; cam.resize(W, vh); setPaints(cam, 'fills', [['secondary']]); cam.clipsContent = true;
    const paper = vec(cam, 'ticket (papel)', [QUAD]); setPaints(paper, 'fills', [['foreground']]);
    const L = (t) => lerp(QUAD[0], QUAD[3], t), R = (t) => lerp(QUAD[1], QUAD[2], t);
    const seg = (t, a, b) => { const l = L(t), r = R(t); return [lerp(l, r, a), lerp(l, r, b)]; };
    const head = vec(cam, 'cabecera del ticket', [seg(0.07, 0.3, 0.7)], { closed: false }); head.strokeWeight = 6; head.strokeCap = 'ROUND'; setPaints(head, 'strokes', [['background', 0.5]]);
    const rowsT = [0.16, 0.2, 0.28, 0.32, 0.36, 0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.64, 0.68];
    const linesL = vec(cam, 'líneas (producto)', rowsT.map((t, i) => seg(t, 0.1, 0.45 + (i % 3) * 0.08)), { closed: false }); linesL.strokeWeight = 3; linesL.strokeCap = 'ROUND'; setPaints(linesL, 'strokes', [['background', 0.35]]);
    const linesR = vec(cam, 'líneas (importe)', rowsT.map((t) => seg(t, 0.78, 0.9)), { closed: false }); linesR.strokeWeight = 3; linesR.strokeCap = 'ROUND'; setPaints(linesR, 'strokes', [['background', 0.35]]);
    const tot = vec(cam, 'total', [seg(0.78, 0.1, 0.35), seg(0.78, 0.7, 0.9)], { closed: false }); tot.strokeWeight = 5; tot.strokeCap = 'ROUND'; setPaints(tot, 'strokes', [['background', 0.5]]);
    if (poly) {
      const veil = vec(cam, 'velo (fuera del recorte)', [[[0, 0], [W, 0], [W, vh], [0, vh]], QUAD], { winding: 'EVENODD' }); setPaints(veil, 'fills', [['component/scanner/velo']]);
      const p = vec(cam, 'polígono detectado', [QUAD]); p.fills = []; setPaints(p, 'strokes', [[poly]]); p.strokeWeight = 3; p.strokeJoin = 'ROUND'; p.strokeAlign = 'CENTER';
    }
    if (handles) for (const q of QUAD) { const h = inst(L8.tirador, 'state=default'); cam.appendChild(h); h.x = q[0] - 22; h.y = q[1] - 22; }
  }
  return s;
}
if (ARGS.screen && ARGS.screen.startsWith('es-') && ARGS.screen !== 'es-sin-camara') {
  const v = await compVar('component/scanner/velo', { r: 0, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 0, a: 0.5 }, ['FRAME_FILL', 'SHAPE_FILL'], 'rgb(0 0 0 / 0.5)', 'x');
  v.description = 'Velo del escáner fuera del recorte (document-scanner.tsx:339): se pinta en el canvas con fillStyle «rgb(0 0 0 / 0.5)» y relleno evenodd, a mano y a propósito (es sobre vídeo, en los dos temas). NO ES UN TOKEN: vive solo en ese canvas.';
  const k = ARGS.screen.slice(3);
  const cfg = {
    abriendo: [ES.abriendo, 'abriendo', { scene: false }], encuadre: [ES.encuadre, 'encuadre', {}],
    detectado: [ES.detectado, 'detectado', { poly: 'success' }], ajuste: [ES.ajuste, 'ajuste', { poly: 'primary', handles: true }],
  }[k];
  const s = await scannerScreen(...cfg);
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'es-sin-camara') {
  // getUserMedia falló: el escáner se cierra, sale un toast.info y el botón principal
  // pasa a «Hacer foto al ticket» (input nativo con capture="environment")
  const { s, c } = ticketScreen(ES.sinCamara);
  withActions(c, TICKET_HEAD[0], [], TICKET_HEAD[1]);
  const bs = stack('ScanForm (móvil)', c, 12);
  fullBtn(bs, 'default', 'lg', 'Hacer foto al ticket', 'camera'); fullBtn(bs, 'outline', 'lg', 'Subir imagen o PDF', 'upload');
  await text('Si el ticket es largo o está arrugado, súbelo escaneado en PDF: se lee mejor.', 'Body/Small', 'muted-foreground', bs, { fill: true });
  await endTicket(s, c);
  const t = inst(L3.toast, 'type=info'); s.appendChild(t); t.setProperties({ [P(L3.toast, 'title')]: 'No hay permiso para usar la cámara. Puedes hacer una foto normal del ticket.' }); t.x = (390 - t.width) / 2; t.y = 16;
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

// ── Modo compra ─────────────────────────────────────────────────────────────
// /lista/compra: fixed inset-0 z-[60] (tapa la nav y el sidebar), bandas a lo ancho con el
// contenido en max-w-2xl. Sin resumen ni confirmación al terminar: Finalizar lleva directo
// a /inventario/revision (ya dibujada en «Primer ticket · 6»).
const MC = {
  comprando: 'Modo compra · 1 · Comprando', quitar: 'Modo compra · 2 · Quitar un producto', todo: 'Modo compra · 3 · Todo en el carro',
  vacia: 'Modo compra · 4 · Lista vacía', escritorio: 'Modo compra · escritorio',
};
function band(s, name, W, { border = 'bottom', bg, px = 'spacing/4', py = ['spacing/3', 'spacing/3'] } = {}) {
  const b = stack(name, s, 0); b.layoutSizingHorizontal = 'FILL'; b.counterAxisAlignItems = 'CENTER'; padX(b, px); bind(b, 'paddingTop', py[0]); bind(b, 'paddingBottom', py[1]);
  if (bg) setPaints(b, 'fills', [bg]);
  if (border) { b.strokes = [solid('border')]; b.strokeTopWeight = border === 'top' ? 1 : 0; b.strokeBottomWeight = border === 'bottom' ? 1 : 0; b.strokeLeftWeight = 0; b.strokeRightWeight = 0; b.strokeAlign = 'INSIDE'; }
  const inner = stack('max-w-2xl', b, 0); inner.layoutSizingHorizontal = W > 390 ? 'FIXED' : 'FILL'; if (W > 390) inner.resize(672, 10); inner.layoutSizingVertical = 'HUG';
  return inner;
}
async function mcHeader(s, W, sub, progress, desktopMode) {
  const inner = band(s, 'header (pt-safe-3)', W, { py: ['spacing/3', 'spacing/3'] });
  const row = stack('fila', inner, 12, 'HORIZONTAL'); row.counterAxisAlignItems = 'CENTER';
  const l = stack('títulos', row, 0); l.layoutSizingHorizontal = 'FILL';
  await text('Modo compra', 'Title/Section', 'foreground', l, { fill: true });
  await text(sub, 'Caption/Default', 'muted-foreground', l, { fill: true });
  const acts = stack('acciones', row, 4, 'HORIZONTAL'); acts.layoutSizingHorizontal = 'HUG';
  if (desktopMode) { const a = IB('ghost', 'icon', 'plus'); acts.appendChild(a); a.name = 'Añadir a la lista'; }
  const x = IB('ghost', 'icon', 'x'); acts.appendChild(x); x.name = 'Salir del modo compra';
  if (progress != null) {
    const g = gapV(inner, 8);
    const bar = figma.createFrame(); bar.name = 'Progreso de la compra (progressbar)'; bar.layoutMode = 'HORIZONTAL'; inner.appendChild(bar); bar.layoutSizingHorizontal = 'FILL'; bar.layoutSizingVertical = 'FIXED'; bar.resize(inner.width, 4); rad(bar, 'radius/full'); setPaints(bar, 'fills', [['muted']]); bar.clipsContent = true;
    if (progress > 0) { const f = figma.createFrame(); f.name = 'relleno'; bar.appendChild(f); f.layoutSizingVertical = 'FILL'; f.resize(Math.round(inner.width * progress), 4); rad(f, 'radius/full'); setPaints(f, 'fills', [['success']]); }
  }
}
async function mcCost(s, W, total, basis, left) {
  const inner = band(s, 'coste estimado', W, { bg: ['muted', 0.4] });
  const row = stack('fila', inner, 12, 'HORIZONTAL'); row.counterAxisAlignItems = 'MAX';
  const l = stack('estimado', row, 0); l.layoutSizingHorizontal = 'FILL';
  const t = await text(total, 'Title/Page', 'foreground', l); t.fontName = { family: 'Geist', style: 'SemiBold' };
  await text(basis, 'Caption/Default', 'muted-foreground', l, { fill: true });
  if (left) { const r = stack('queda', row, 0); r.layoutSizingHorizontal = 'HUG'; r.counterAxisAlignItems = 'MAX'; const a = await text('Queda por coger', 'Body/Small', 'muted-foreground', r); a.textAlignHorizontal = 'RIGHT'; await text(left, 'Body/Small Medium', 'foreground', r); }
}
function mcChips(s, W, labels, active) {
  const inner = band(s, 'Tienda de esta compra (group)', W, { py: ['spacing/2', 'spacing/2'] });
  const row = stack('chips', inner, 8, 'HORIZONTAL');
  labels.forEach((l, i) => { const c = inst(L8.chip, 'activo=' + (i === active)); row.appendChild(c); c.setProperties({ [P(L8.chip, 'label')]: l }); });
}
// Medido: una segunda loadFontAsync de la MISMA fuente dentro de una ejecución no vuelve
// nunca (la primera sí), y con el fontName tal cual (lleva variationSettings) tampoco. Se
// carga cada familia y estilo una sola vez por ejecución.
const __fonts = new Set();
async function loadFont(t) { const k = t.fontName.family + '/' + t.fontName.style; if (__fonts.has(k)) return; __fonts.add(k); await figma.loadFontAsync({ family: t.fontName.family, style: t.fontName.style }); }
async function setT(node, name, chars) { const t = node.findOne((n) => n.type === 'TEXT' && n.name === name); if (!t) return; if (chars == null) { t.visible = false; return; } await loadFont(t); t.characters = chars; }
async function mrow(parent, estado, [name, slug, total, price, qty], store) {
  const r = inst(L8.fila, 'estado=' + estado); parent.appendChild(r); r.layoutSizingHorizontal = 'FILL';
  const pr = { [P(L8.fila, 'nombre')]: name, [P(L8.fila, 'total')]: total, [P(L8.fila, 'con precio')]: price != null };
  if (price != null) pr[P(L8.fila, 'precio')] = price; if (store) pr[P(L8.fila, 'tienda')] = store;
  r.setProperties(pr);
  const pi = r.findOne((x) => x.type === 'INSTANCE' && x.name === 'product-icon'); if (pi) pi.swapComponent(iconsPage.findOne((q) => q.type === 'COMPONENT' && q.name === 'product/' + slug));
  const st = r.exposedInstances.find((x) => x.name === 'QuantityStepper');
  if (st && qty) { const cs = await st.getMainComponentAsync(); st.setProperties({ [Object.keys(cs.parent.componentPropertyDefinitions).find((k) => k.startsWith('value'))]: qty }); }
  return r;
}
async function aisle(parent, title, slug, rows, cogidos, opts = {}) {
  const sec = stack(title, parent, 0);
  const h = stack('h2', sec, 6, 'HORIZONTAL'); h.counterAxisAlignItems = 'CENTER'; bind(h, 'paddingBottom', 'spacing/1_5'); h.appendChild(product(slug, 18));
  const t = await text(title, 'Body/Small Medium', 'muted-foreground', h); t.fontName = { family: 'Geist', style: 'SemiBold' };
  const ul = stack('pendientes', sec, 4);
  for (const [estado, row, store] of rows) await mrow(ul, estado, row, store);
  if (!rows.length) ul.remove();
  if (cogidos) { const w = stack('mt-1', sec, 0); bind(w, 'paddingTop', 'spacing/1'); const c = inst(L8.cogidos, 'abierto=false'); w.appendChild(c); c.layoutSizingHorizontal = 'FILL'; c.setProperties({ [P(L8.cogidos, 'label')]: cogidos }); }
  return sec;
}
async function orderHint(parent, label) {
  const b = stack('ordenar pasillos (button)', parent, 6, 'HORIZONTAL'); b.layoutSizingHorizontal = 'HUG'; b.counterAxisAlignItems = 'CENTER'; bind(b, 'minHeight', 'spacing/11'); padX(b, 'spacing/2'); rad(b, 'radius/lg');
  b.appendChild(icon('list-ordered', 16, 'muted-foreground', 'icon')); await text(label, 'Body/Small', 'muted-foreground', b);
}
function mcBody(s, W) {
  const b = stack('cuerpo (scroll, pb-fab-flush)', s, 0); b.layoutSizingHorizontal = 'FILL'; b.layoutSizingVertical = 'FILL'; b.clipsContent = true; b.counterAxisAlignItems = 'CENTER'; padX(b, 'spacing/4'); bind(b, 'paddingTop', 'spacing/3');
  const inner = stack('max-w-2xl', b, 16); inner.layoutSizingHorizontal = W > 390 ? 'FIXED' : 'FILL'; if (W > 390) inner.resize(672, 10); inner.layoutSizingVertical = 'HUG';
  return inner;
}
function mcFooter(s, W, label) {
  const inner = band(s, 'footer (pb-safe-3)', W, { border: 'top' }); inner.parent.paddingBottom = W > 390 ? 12 : 34 + 12; setPaints(inner.parent, 'fills', [['background']]);
  const b = BTN('default', 'lg', label, 'shopping-cart'); inner.appendChild(b); b.layoutSizingHorizontal = 'FILL'; // shadow-lg: el Button ya trae su sombra
  return inner.parent;
}
function mcFab(s, footer) { const f = L.fab.createInstance(); s.appendChild(f); f.layoutPositioning = 'ABSOLUTE'; f.x = 390 - 16 - 56; f.y = 844 - (footer ? footer.height : 34) - 16 - 56; }
async function recos(parent, open) { const r = inst(L8.reco, 'abierto=' + open); parent.appendChild(r); r.layoutSizingHorizontal = 'FILL'; return r; }
async function mcScreen(name, W) {
  const s = screen(name, W, W > 390 ? 'desktop' : 'mobile'); s.layoutMode = 'VERTICAL'; s.primaryAxisSizingMode = 'FIXED'; s.counterAxisSizingMode = 'FIXED'; s.resize(W, W > 390 ? 900 : 844); s.itemSpacing = 0;
  return s;
}
const MC_ROWS = {
  leche: ['Leche entera', 'leche', '= 6 ud', '5,34 €', '6'], huevos: ['Huevos', 'huevo', '= 12 ud', '2,15 €', '1'], yogur: ['Yogures naturales', 'yogur', '= 8 ud', '1,98 €', '2'],
  tomate: ['Tomates', 'tomate', '= 1 kg', '2,49 €', '1'], platano: ['Plátanos', 'platano', '= 6 ud', null, '6'], pan: ['Pan de molde', 'pan', '= 1 ud', '1,45 €', '1'],
};
if (ARGS.screen === 'mc-comprando' || ARGS.screen === 'mc-quitar') {
  const quitar = ARGS.screen === 'mc-quitar';
  const s = await mcScreen(quitar ? MC.quitar : MC.comprando, 390);
  await mcHeader(s, 390, quitar ? 'Quedan 3 por coger · 2 de 5' : 'Quedan 4 por coger · 2 de 6', quitar ? 2 / 5 : 2 / 6);
  await mcCost(s, 390, quitar ? '6,08 €' : '11,42 €', quitar ? 'estimado sobre 4 de 5 ítems' : 'estimado sobre 5 de 6 ítems', quitar ? '≈ 4,64 €' : '≈ 9,98 €');
  mcChips(s, 390, ['Todas', 'Mercadona', 'Lidl'], 0);
  const b = mcBody(s, 390);
  await aisle(b, 'Lácteos y huevos', 'leche', quitar ? [['deslizada', MC_ROWS.huevos]] : [['pendiente', MC_ROWS.leche], ['pendiente', MC_ROWS.huevos]], '1 cogido');
  await aisle(b, 'Fruta y verdura', 'tomate', [['pendiente', MC_ROWS.tomate], ['otra-tienda', MC_ROWS.platano, 'Lidl']], '1 cogido');
  await orderHint(b, '¿No es el orden de tu tienda? Ordena los pasillos');
  await recos(b, false);
  const f = mcFooter(s, 390, 'Finalizar compra (2) → inventario'); mcFab(s, f);
  if (quitar) {
    const t = inst(L3.toast, 'type=success'); s.appendChild(t); t.layoutPositioning = 'ABSOLUTE'; t.setProperties({ [P(L3.toast, 'title')]: 'Leche entera quitado' }); t.x = (390 - t.width) / 2; t.y = 16;
    // La acción de Sonner: botón de 24 px (data-button), fondo normal-text y texto normal-bg
    const a = stack('Deshacer (acción del toast)', null, 0, 'HORIZONTAL'); s.appendChild(a); a.layoutPositioning = 'ABSOLUTE'; a.counterAxisSizingMode = 'FIXED'; a.resize(10, 24); a.primaryAxisSizingMode = 'AUTO'; a.counterAxisAlignItems = 'CENTER'; padX(a, 'spacing/2'); rad(a, 'radius/sm'); setPaints(a, 'fills', [['popover-foreground']]);
    await text('Deshacer', 'Caption/Medium', 'popover', a); a.x = t.x + t.width - a.width - 16; a.y = t.y + (t.height - 24) / 2;
  }
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mc-todo') {
  const s = await mcScreen(MC.todo, 390);
  await mcHeader(s, 390, 'Todo en el carro · 6 de 6', 1);
  await mcCost(s, 390, '14,62 €', 'estimado sobre 5 de 6 ítems', null);
  mcChips(s, 390, ['Todas', 'Mercadona', 'Lidl'], 0);
  const b = mcBody(s, 390);
  await aisle(b, 'Lácteos y huevos', 'leche', [], '3 cogidos');
  await aisle(b, 'Fruta y verdura', 'tomate', [], '2 cogidos');
  await aisle(b, 'Panadería', 'pan', [], '1 cogido');
  await orderHint(b, '¿No es el orden de tu tienda? Ordena los pasillos');
  await recos(b, false);
  const f = mcFooter(s, 390, 'Finalizar compra (6) → inventario'); mcFab(s, f);
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mc-vacia') {
  // Con la lista vacía: sin progreso, sin coste y sin pie; la cabecera dice «Todo en el
  // carro» porque solo mira si quedan pendientes (shopping-mode.tsx:502-504)
  const s = await mcScreen(MC.vacia, 390);
  await mcHeader(s, 390, 'Todo en el carro', null);
  const b = mcBody(s, 390);
  const e = stack('vacío', b, 0); e.counterAxisAlignItems = 'CENTER'; padX(e, 'spacing/6'); padY(e, 'spacing/6'); rad(e, 'radius/xl'); setPaints(e, 'strokes', [['border']]); e.strokeWeight = 1; e.strokeAlign = 'INSIDE'; e.dashPattern = [4, 4];
  const t = await text('La lista está vacía.', 'Body/Small', 'muted-foreground', e, { fill: true }); t.textAlignHorizontal = 'CENTER';
  await recos(b, true);
  mcFab(s, null);
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mc-escritorio') {
  // ≥ md: el «+» sube a la cabecera, no hay FAB y la columna es max-w-2xl centrada;
  // con una tienda elegida, lo de las demás va en «Para otras tiendas (N)»
  const s = await mcScreen(MC.escritorio, 1280);
  await mcHeader(s, 1280, 'Quedan 4 por coger · 2 de 7', 2 / 7, true);
  await mcCost(s, 1280, '12,89 €', 'estimado sobre 6 de 7 ítems', '≈ 11,45 €');
  mcChips(s, 1280, ['Todas', 'Mercadona', 'Lidl'], 1);
  const b = mcBody(s, 1280);
  await aisle(b, 'Lácteos y huevos', 'leche', [['pendiente', MC_ROWS.leche], ['pendiente', MC_ROWS.yogur], ['pendiente', MC_ROWS.huevos]], '1 cogido');
  await aisle(b, 'Fruta y verdura', 'tomate', [['pendiente', MC_ROWS.tomate]], '1 cogido');
  await orderHint(b, '¿No es el orden de Mercadona? Ordena sus pasillos');
  const o = stack('Para otras tiendas (button)', b, 6, 'HORIZONTAL'); o.counterAxisAlignItems = 'CENTER'; bind(o, 'minHeight', 'spacing/11'); padX(o, 'spacing/2'); rad(o, 'radius/lg');
  o.appendChild(icon('store', 16, 'muted-foreground', 'icon')); const ot = await text('Para otras tiendas', 'Body/Small', 'muted-foreground', o); await text('(1)', 'Body/Small', 'muted-foreground', o).then((x) => { x.layoutGrow = 1; }); o.appendChild(icon('chevron-down', 16, 'muted-foreground', 'chevron'));
  await recos(b, true);
  mcFooter(s, 1280, 'Finalizar compra (2) → inventario');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

// ── Modales del día a día: inventario, lista y menús ────────────────────────
// Cada uno es un hueco «_Contenido · …» (modalSlot) que el ResponsiveModal recibe por
// instance swap, encima de la pantalla de la que sale. El hueco lleva su pie: en los
// que tienen `sticky`, con borde arriba y bg-popover, como ResponsiveModalFooter.
// Los textos de las instancias van SIEMPRE por propiedades (setProperties): cargar
// fuentes para editar un texto dentro de una instancia se cuelga.
const MO = {
  invAnadir: 'Inventario · Añadir producto', invAnadirAjustes: 'Inventario · Añadir producto · ajustes adicionales', invFicha: 'Inventario · Ficha del producto',
  invFichaAjustes: 'Inventario · Ficha · ajustes adicionales', invIcono: 'Inventario · Ficha · elegir icono',
  lsAnadir: 'Lista · Añadir a la lista', lsBuscar: 'Lista · Añadir · buscando y creando', lsEditar: 'Lista · Editar producto', lsOrden: 'Lista · Orden de los pasillos', lsEscritorio: 'Lista · Añadir a la lista · escritorio',
  mnNuevo: 'Menús · Plato nuevo', mnPlato: 'Menús · Editar un plato', mnMover: 'Menús · Mover a…', mnFaltan: 'Menús · Añadir a la lista lo que falte',
  mnDescontar: 'Menús · Descontar del inventario', mnHoy: 'Menús · ¿Qué hago hoy?', mnAjustes: 'Menús · Ajustes del menú', mnRehacer: 'Menús · Rehacer todo el menú',
};
const L9 = {
  ficha: await setOf('◆ PATRONES', 'Ficha del selector'), pasillo: await setOf('◆ PATRONES', 'Fila de orden de pasillos'), ubic: await setOf('◆ PATRONES', 'Chip de ubicación'),
  sw: await setOf('◆ PATRONES', 'Fila con interruptor'), pleg: await setOf('◆ PATRONES', 'Cabecera del plegable'), accion: await setOf('◆ PATRONES', 'Casilla de acción'),
  hueco: await setOf('◆ PATRONES', 'Casilla de hueco'), casilla: await setOf('◆ PATRONES', 'Fila con casilla'), objetivo: await setOf('◆ PATRONES', 'Opción de objetivo'),
  idea: await setOf('◆ PATRONES', 'Idea para hoy'), desc: await setOf('◆ PATRONES', 'Fila a descontar'), chip: await setOf('◆ PATRONES', 'Chip de tienda'),
  cb: await setOf('02 · Formularios', 'Checkbox'), switchC: await setOf('02 · Formularios', 'Switch'), ta: await setOf('02 · Formularios', 'Textarea'),
};
const prodC = (slug) => iconsPage.findOne((q) => q.type === 'COMPONENT' && q.name === 'product/' + slug);
const selectWith = (value, placeholder) => { const i = inst(L3.select, `size=default, state=default, filled=${value ? 'true' : 'false'}`); const pr = {}; if (value) pr[P(L3.select, 'value')] = value; if (placeholder) pr[P(L3.select, 'placeholder')] = placeholder; i.setProperties(pr); return i; };
function body(k, gap = 16) { const b = stack('cuerpo (px-4)', k, gap); padX(b, 'spacing/4'); return b; }
// Pie del hueco: sticky = border-t bg-popover de lado a lado; si no, px-4 y nada más
function slotFooter(k, sticky) {
  const f = stack(sticky ? 'ResponsiveModalFooter (sticky)' : 'ResponsiveModalFooter', k, 8); padX(f, 'spacing/4'); padY(f, 'spacing/4');
  if (sticky) { setPaints(f, 'fills', [['popover']]); f.strokes = [solid('border')]; f.strokeTopWeight = 1; f.strokeBottomWeight = 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0; f.strokeAlign = 'INSIDE'; }
  return f;
}
function grid2(parent, name, gap = 12) { const g = stack(name, parent, gap, 'HORIZONTAL'); return g; }
function half(node) { node.layoutSizingHorizontal = 'FILL'; return node; }
async function note(parent, chars, tone = 'muted-foreground', style = 'Caption/Default') { return text(chars, style, tone, parent, { fill: true }); }
function fichaChip(parent, estado, nombre, slug, sufijo) {
  const c = inst(L9.ficha, 'estado=' + estado); parent.appendChild(c);
  const pr = { [P(L9.ficha, 'nombre')]: nombre, [P(L9.ficha, 'con sufijo')]: !!sufijo }; if (sufijo) pr[P(L9.ficha, 'sufijo')] = sufijo; if (slug && prodC(slug)) pr[P(L9.ficha, 'icono')] = prodC(slug).id;
  c.setProperties(pr); return c;
}
async function chipGroup(parent, title, iconNode, chips) {
  const s = stack(title, parent, 8);
  const h = stack('h3', s, 6, 'HORIZONTAL'); h.counterAxisAlignItems = 'CENTER'; if (iconNode) h.appendChild(iconNode); await text(title, 'Body/Small Medium', 'muted-foreground', h);
  const w = stack('fichas (flex-wrap gap-2)', s, 8, 'HORIZONTAL'); w.layoutWrap = 'WRAP'; w.counterAxisSpacing = 8;
  for (const c of chips) fichaChip(w, ...c);
  return s;
}
function searchBox(parent, placeholder) { const b = inst(L.search, 'filled=false'); parent.appendChild(b); b.layoutSizingHorizontal = 'FILL'; const i = b.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('Input')) || b.findAll((n) => n.type === 'INSTANCE').find((n) => n.componentProperties && Object.keys(n.componentProperties).some((k) => k.startsWith('placeholder'))); if (i) i.setProperties({ [Object.keys(i.componentProperties).find((k) => k.startsWith('placeholder'))]: placeholder }); return b; }
async function collapsible(parent, open, ayuda) {
  const box = stack('CollapsibleFields', parent, 0); rad(box, 'radius/xl'); box.strokeWeight = 1; box.strokeAlign = 'INSIDE'; setPaints(box, 'strokes', [['border']]); box.clipsContent = true;
  const h = inst(L9.pleg, 'abierto=' + open); box.appendChild(h); h.layoutSizingHorizontal = 'FILL'; h.setProperties({ [P(L9.pleg, 'ayuda')]: ayuda });
  if (!open) return null;
  const b = stack('cuerpo (border-t p-3 gap-4)', box, 16); padX(b, 'spacing/3'); padY(b, 'spacing/3'); b.strokes = [solid('border')]; b.strokeTopWeight = 1; b.strokeBottomWeight = 0; b.strokeLeftWeight = 0; b.strokeRightWeight = 0; b.strokeAlign = 'INSIDE';
  return b;
}
async function expiryPicker(parent, fecha) {
  const f = stack('ExpiryQuickPicker', parent, 8); const l = inst(L2.label, 'state=default'); f.appendChild(l); l.setProperties({ [P(L2.label, 'label')]: 'Caducidad' });
  const r = stack('rápidos (flex-wrap gap-2)', f, 8, 'HORIZONTAL'); r.layoutWrap = 'WRAP'; r.counterAxisSpacing = 8;
  for (const t of ['+3 días', '+1 semana', '+1 mes']) r.appendChild(BTN('outline', 'default', t));
  if (fecha) r.appendChild(BTN('ghost', 'default', 'Borrar', 'x'));
  const i = inputWith(fecha, 'dd/mm/aaaa'); f.appendChild(i); i.layoutSizingHorizontal = 'FILL';
  if (fecha) await note(f, 'Si tienes varios, pon la fecha del que caduque antes.', 'muted-foreground', 'Body/Small');
  return f;
}
function actionsFooter(k, sticky, items) { const f = slotFooter(k, sticky); for (const [v, size, label, ic] of items) { const b = BTN(v, size, label, ic); f.appendChild(b); b.layoutSizingHorizontal = 'FILL'; } return f; }
async function modalPage(kind, name) {
  if (kind === 'inventario') {
    const s = screen(name, 390, 'mobile'); const c = mobileContent(s);
    withActions(c, 'Inventario', [IB('outline', 'icon', 'rotate-ccw-clock')]);
    const se = inst(L.search, 'filled=false'); c.appendChild(se); se.layoutSizingHorizontal = 'FILL';
    await chips(c, [['Caducan pronto', 1, 'inactivo'], ['Caducados', 1, 'inactivo'], ['Agotados', 1, 'inactivo'], ['Quedan pocas', 1, 'inactivo']], false);
    const secs = stack('secciones', c, 24); await section(secs, '🧊', 'Nevera', 4, true, NEVERA, 1); await section(secs, '🧺', 'Despensa', 3, false, DESPENSA, 1);
    finishMobile(s, c); await activate(s, 0); return s;
  }
  if (kind === 'lista') {
    const s = screen(name, 390, 'mobile'); const c = mobileContent(s); c.paddingBottom = 112 + 34 + 88;
    withActions(c, 'Lista de la compra', []); await listaContenido(c, false);
    finishMobile(s, c, { checkout: 'Finalizar compra (1) → inventario' }); await activate(s, 1); return s;
  }
  return pageMenus(name);
}
// En móvil el sheet se ve entero (sheetOver alarga la pantalla): en la app mide como
// mucho el 80 % del alto y hace scroll, con el pie sticky pegado abajo.
async function sheetModal(kind, name, k, title, description) {
  const s = await modalPage(kind, name);
  const m = await sheetOver(s, k, title, description || ' ');
  // Sin descripción el sheet encoge: se vuelve a apoyar abajo (si no, queda un hueco de overlay debajo)
  if (!description) { const d = m.findOne((n) => n.type === 'TEXT' && n.name === 'description'); if (d) d.visible = false; m.y = s.height - m.height; }
  return s;
}

// ── Inventario ──
async function invBase(b, { nombre, categoria, cantidad = '1', unidad = 'Unidades' }) {
  await labeled(b, 'Producto', inputWith(nombre, 'p. ej. Leche entera'));
  await labeled(b, 'Categoría', selectWith(categoria, 'Sin categoría'));
  const g = grid2(b, 'cantidad y unidad (grid-cols-2 gap-3)'); half(await labeled(g, 'Cantidad', inputWith(cantidad))); half(await labeled(g, 'Unidad', selectWith(unidad)));
}
if (ARGS.screen === 'inv-anadir' || ARGS.screen === 'inv-anadir-ajustes') {
  const open = ARGS.screen === 'inv-anadir-ajustes';
  const k = modalSlot(open ? 'Añadir producto · ajustes adicionales' : 'Añadir producto'); const b = body(k);
  await invBase(b, open ? { nombre: 'Yogur griego', categoria: 'Lácteos y huevos', cantidad: '4' } : {});
  const cb = await collapsible(b, open, 'Todo opcional: caducidad, ubicación, envase y avisos');
  if (cb) {
    await expiryPicker(cb, '07/10/2026');
    await labeled(cb, 'Ubicación', selectWith('Nevera'));
    await labeled(cb, 'Avísame cuando queden menos de', inputWith(null, 'p. ej. 2'));
    const env = stack('Envase (role=group)', cb, 16); padX(env, 'spacing/3'); padY(env, 'spacing/3'); rad(env, 'radius/lg'); env.strokeWeight = 1; env.strokeAlign = 'INSIDE'; setPaints(env, 'strokes', [['border']]);
    await text('Envase', 'Body/Small Medium', 'foreground', env, { fill: true });
    const cu = stack('Contenido de cada unidad', env, 8); const cl = inst(L2.label, 'state=default'); cu.appendChild(cl); cl.setProperties({ [P(L2.label, 'label')]: 'Contenido de cada unidad' });
    const g = grid2(cu, 'número y unidad'); g.appendChild(inputWith('125', 'p. ej. 500')); g.children[0].layoutSizingHorizontal = 'FILL'; const us = selectWith('g', 'Unidad'); g.appendChild(us); us.layoutSizingHorizontal = 'FILL'; us.name = 'Unidad del contenido (solo aria-label)';
    await note(cu, 'Cada unidad trae 125 g.', 'muted-foreground', 'Body/Small');
    const pm = stack('peso medio (min-h-11)', cu, 8, 'HORIZONTAL'); pm.counterAxisAlignItems = 'CENTER'; bind(pm, 'minHeight', 'spacing/11'); const ck = inst(L9.cb, 'state=default, checked=false'); pm.appendChild(ck); ck.rescale(20 / 16); await text('Es un peso medio (fruta, carne, pescado)', 'Body/Small', 'foreground', pm);
    const ps = await labeled(env, 'Unidades por compra', inputWith('4', 'p. ej. 30')); await note(ps, 'Cada compra repondrá 4 ud en el inventario.', 'muted-foreground', 'Body/Small');
  }
  actionsFooter(k, true, [['default', 'lg', 'Añadir al inventario'], ['ghost', 'default', 'Cancelar']]);
  const s = await sheetModal('inventario', open ? MO.invAnadirAjustes : MO.invAnadir, k, 'Añadir producto', 'Se añadirá a tu inventario. Si el producto ya existe, se suma a la cantidad.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
async function fichaTop(b) {
  const pf = stack('Producto', b, 8); const pl = inst(L2.label, 'state=default'); pf.appendChild(pl); pl.setProperties({ [P(L2.label, 'label')]: 'Producto' });
  const row = stack('icono y nombre (items-end gap-2)', pf, 8, 'HORIZONTAL'); row.counterAxisAlignItems = 'MAX';
  const ib = stack('Cambiar icono del producto', row, 0, 'HORIZONTAL'); ib.layoutSizingHorizontal = 'FIXED'; ib.resize(44, 44); ib.layoutSizingVertical = 'FIXED'; ib.primaryAxisAlignItems = 'CENTER'; ib.counterAxisAlignItems = 'CENTER'; rad(ib, 'radius/lg'); setPaints(ib, 'fills', [['muted']]); ib.strokeWeight = 1; ib.strokeAlign = 'INSIDE'; setPaints(ib, 'strokes', [['border']]); ib.clipsContent = false;
  ib.appendChild(product('leche', 26));
  const pen = stack('lápiz', ib, 0, 'HORIZONTAL'); pen.layoutPositioning = 'ABSOLUTE'; pen.resize(16, 16); pen.primaryAxisAlignItems = 'CENTER'; pen.counterAxisAlignItems = 'CENTER'; pen.x = 32; pen.y = 32; rad(pen, 'radius/full'); setPaints(pen, 'fills', [['background']]); pen.strokeWeight = 1; pen.strokeAlign = 'INSIDE'; setPaints(pen, 'strokes', [['border']]); pen.appendChild(icon('pencil', 10, 'muted-foreground', 'icon'));
  const ni = inputWith('Leche entera'); row.appendChild(ni); ni.layoutSizingHorizontal = 'FILL';
  await labeled(b, 'Categoría', selectWith('Lácteos y huevos'));
  const g = grid2(b, 'cantidad y unidad (grid-cols-2 gap-3)'); half(await labeled(g, 'Cantidad', inputWith('6'))); half(await labeled(g, 'Unidad', selectWith('Unidades')));
  const fs = stack('Ubicación (fieldset)', b, 8); await text('Ubicación', 'Body/Small Medium', 'foreground', fs);
  const gr = stack('rejilla grid-cols-2 gap-2', fs, 8);
  for (const pair of [[['🧊', 'Nevera', true], ['❄️', 'Congelador', false]], [['🧺', 'Despensa', false], ['📦', 'Otros', false]]]) { const r = stack('fila', gr, 8, 'HORIZONTAL'); for (const [e, u, on] of pair) { const c = inst(L9.ubic, 'marcado=' + on); r.appendChild(c); c.layoutSizingHorizontal = 'FILL'; c.setProperties({ [P(L9.ubic, 'emoji')]: e, [P(L9.ubic, 'ubicación')]: u }); } }
}
if (ARGS.screen === 'inv-ficha' || ARGS.screen === 'inv-ficha-ajustes') {
  const open = ARGS.screen === 'inv-ficha-ajustes';
  const k = modalSlot(open ? 'Ficha del producto · ajustes adicionales' : 'Ficha del producto'); const b = body(k);
  await fichaTop(b);
  if (!open) {
    const w = stack('Este producto está en más de un sitio', b, 8); padX(w, 'spacing/3'); padY(w, 'spacing/3'); rad(w, 'radius/xl'); setPaints(w, 'fills', [['muted', 0.5]]); w.strokeWeight = 1; w.strokeAlign = 'INSIDE'; setPaints(w, 'strokes', [['border']]);
    const t = stack('título', w, 6, 'HORIZONTAL'); t.counterAxisAlignItems = 'CENTER'; t.appendChild(icon('merge', 16, 'muted-foreground', 'icon')); await text('Este producto está en más de un sitio', 'Body/Small Medium', 'foreground', t);
    await note(w, 'Hay otra línea en Despensa (2 ud). Es el mismo producto repartido, no productos distintos: por eso no sale en «Fusionar con otro producto».', 'muted-foreground', 'Body/Small');
    const jb = BTN('outline', 'default', 'Juntarlo todo en nevera'); w.appendChild(jb); jb.layoutSizingHorizontal = 'FILL';
  }
  const cb = await collapsible(b, open, 'Todo opcional: caducidad, tienda, envase y avisos');
  if (cb) {
    await expiryPicker(cb, null);
    const tp = stack('Tienda preferida', cb, 8); const tl = stack('label', tp, 6, 'HORIZONTAL'); tl.counterAxisAlignItems = 'CENTER'; tl.appendChild(icon('store', 16, 'muted-foreground', 'icon')); await text('Tienda preferida', 'Body/Small Medium', 'foreground', tl);
    const ts = selectWith('Mercadona'); tp.appendChild(ts); ts.layoutSizingHorizontal = 'FILL';
    const sav = stack('ahorro (bg-chart-3/10 text-price)', tp, 6, 'HORIZONTAL'); sav.counterAxisAlignItems = 'MIN'; padX(sav, 'spacing/2'); padY(sav, 'spacing/2'); rad(sav, 'radius/lg'); setPaints(sav, 'fills', [['chart-3', 0.1]]); sav.appendChild(icon('trending-down', 16, 'price', 'icon'));
    const st = await text('En Lidl ahorras ~12% frente a Mercadona, según tus tickets.', 'Body/Small', 'price', sav, { fill: true }); st.setRangeFontName(3, 7, { family: 'Geist', style: 'SemiBold' });
    await labeled(cb, 'Avísame cuando queden menos de', inputWith('2'));
    for (const [on, ic, t, d, tone] of [[false, 'chef-hat', 'Consumir pronto', 'Priorízalo en los menús aunque no caduque', null], [true, 'star', 'Mis habituales', 'Ánclalo arriba en tu inventario', 'chart-3'], [false, 'shopping-cart', 'En la lista de la compra', 'Apúntalo aunque no se haya agotado', null]]) {
      const r = inst(L9.sw, 'activo=' + on); cb.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.setProperties({ [P(L9.sw, 'título')]: t, [P(L9.sw, 'descripción')]: d, [P(L9.sw, 'icono')]: iconComp(ic).id });
      if (tone) recolor(r.findOne((n) => n.type === 'INSTANCE' && n.name === 'icon'), tone);
    }
    const mt = stack('Mantenimiento del catálogo (border-t pt-4)', cb, 16); bind(mt, 'paddingTop', 'spacing/4'); mt.strokes = [solid('border')]; mt.strokeTopWeight = 1; mt.strokeBottomWeight = 0; mt.strokeLeftWeight = 0; mt.strokeRightWeight = 0; mt.strokeAlign = 'INSIDE';
    const nt = stack('Nombres en tickets', mt, 8); await text('Nombres en tickets', 'Body/Small Medium', 'foreground', nt, { fill: true });
    await note(nt, 'Cómo aparece en tus tickets, por tienda. Un nombre distinto en cada tienda es normal; dos en la misma suelen ser una etiqueta antigua. Bórralo si se asoció por error: no afecta a tu historial de precios.', 'muted-foreground', 'Body/Small');
    const gh = stack('Mercadona', nt, 6, 'HORIZONTAL'); gh.counterAxisAlignItems = 'CENTER'; await text('Mercadona', 'Caption/Medium', 'muted-foreground', gh);
    const wb = inst(L3.badge, 'variant=default'); gh.appendChild(wb); wb.setProperties({ [P(L3.badge, 'label')]: '2 nombres' }); setPaints(wb, 'fills', [['warning', 0.15]]); for (const tx of wb.findAll((n) => n.type === 'TEXT')) setPaints(tx, 'fills', [['warning']]);
    for (const [al, when] of [['LECHE ENTERA HACENDADO', 'hace 3 días'], ['LECHE ENT. 1L', 'hace 4 meses']]) {
      const r = stack(al, nt, 8, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; bind(r, 'paddingLeft', 'spacing/3'); bind(r, 'paddingRight', 'spacing/1'); padY(r, 'spacing/1'); rad(r, 'radius/lg'); r.strokeWeight = 1; r.strokeAlign = 'INSIDE'; setPaints(r, 'strokes', [['border']]);
      const tt = stack('texto', r, 6, 'HORIZONTAL'); tt.layoutSizingHorizontal = 'FILL'; tt.counterAxisAlignItems = 'CENTER'; await text(al, 'Body/Small', 'foreground', tt); await text(when, 'Caption/Default', 'muted-foreground', tt);
      const x = IB('ghost', 'icon', 'x'); r.appendChild(x); x.name = 'Borrar el nombre «' + al + '»';
    }
    const fu = stack('Fusionar con otro producto', mt, 8); await text('Fusionar con otro producto', 'Body/Small Medium', 'foreground', fu, { fill: true });
    await note(fu, 'Une este producto con otro: el historial de precios de ambos se juntará en el que elijas, y su stock se sumará donde las unidades coincidan. Esta acción no se puede deshacer.', 'muted-foreground', 'Body/Small');
    const cbx = BTN('outline', 'default', 'Elegir producto…'); fu.appendChild(cbx); cbx.layoutSizingHorizontal = 'FILL'; cbx.primaryAxisAlignItems = 'SPACE_BETWEEN'; cbx.setProperties({ [P(L.btn, 'icon inline-end#')]: true, [P(L.btn, 'icon inline-end ↳')]: iconComp('chevrons-up-down').id }); cbx.name = 'ProductCombobox';
  }
  actionsFooter(k, true, [['default', 'lg', 'Guardar cambios'], ['destructive', 'default', 'Eliminar del inventario', 'trash'], ['ghost', 'default', 'Cancelar']]);
  const s = await sheetModal('inventario', open ? MO.invFichaAjustes : MO.invFicha, k, 'Leche entera', '6 ud en existencias');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'inv-icono') {
  const k = modalSlot('Ficha · elegir icono'); const b = body(k);
  searchBox(b, 'Buscar icono…');
  const au = stack('Automático (seleccionado)', b, 12, 'HORIZONTAL'); au.counterAxisAlignItems = 'CENTER'; padX(au, 'spacing/3'); padY(au, 'spacing/3'); rad(au, 'radius/lg'); setPaints(au, 'fills', [['primary', 0.1]]); au.strokeWeight = 1; au.strokeAlign = 'INSIDE'; setPaints(au, 'strokes', [['primary']]);
  const ab = stack('icono', au, 0, 'HORIZONTAL'); ab.layoutSizingHorizontal = 'FIXED'; ab.resize(40, 40); ab.layoutSizingVertical = 'FIXED'; ab.primaryAxisAlignItems = 'CENTER'; ab.counterAxisAlignItems = 'CENTER'; rad(ab, 'radius/lg'); setPaints(ab, 'fills', [['muted']]); ab.appendChild(product('leche', 24));
  const at = stack('textos', au, 2); at.layoutSizingHorizontal = 'FILL'; const t1 = stack('título', at, 6, 'HORIZONTAL'); t1.counterAxisAlignItems = 'CENTER'; await text('Automático', 'Body/Small Medium', 'foreground', t1); t1.appendChild(icon('sparkles', 16, 'muted-foreground', 'icon'));
  await note(at, 'Se elige solo según el nombre del producto', 'muted-foreground', 'Body/Small'); au.appendChild(icon('check', 20, 'primary', 'check'));
  const SECS = [['Fruta', ['manzana', 'manzana-verde', 'platano', 'naranja', 'limon', 'fresa', 'uvas', 'sandia', 'pina', 'pera', 'melocoton', 'cerezas']], ['Verdura', ['zanahoria', 'tomate', 'patata', 'cebolla', 'ajo', 'pimiento', 'brocoli', 'maiz', 'pepino', 'lechuga', 'berenjena', 'champinon']], ['Lácteos y huevos', ['leche', 'queso', 'huevo', 'mantequilla', 'helado']]];
  for (const [title, slugs] of SECS) {
    const s = stack(title, b, 6); const h = await text(title, 'Caption/Medium', 'muted-foreground', s); h.fontName = { family: 'Geist', style: 'SemiBold' };
    const w = stack('iconos (flex-wrap gap-1.5)', s, 6, 'HORIZONTAL'); w.layoutWrap = 'WRAP'; w.counterAxisSpacing = 6;
    for (const sl of slugs) { if (!prodC(sl)) continue; const cell = stack(sl, w, 0, 'HORIZONTAL'); cell.layoutSizingHorizontal = 'FIXED'; cell.resize(44, 44); cell.layoutSizingVertical = 'FIXED'; cell.primaryAxisAlignItems = 'CENTER'; cell.counterAxisAlignItems = 'CENTER'; rad(cell, 'radius/lg'); cell.strokeWeight = 1; cell.strokeAlign = 'INSIDE'; setPaints(cell, 'strokes', [['transparent']]); cell.appendChild(product(sl, 26)); }
  }
  const f = slotFooter(k, false); const back = BTN('ghost', 'default', 'Volver', 'chevron-left'); f.appendChild(back); back.layoutSizingHorizontal = 'FILL';
  const s = await sheetModal('inventario', MO.invIcono, k, 'Elegir icono', 'Busca por nombre o elige de la lista. El automático se ajusta al nombre del producto.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

// ── Lista ──
async function pickerSearch(k, placeholder) {
  const f = stack('buscador (sticky top-0 border-b bg-popover)', k, 6); padX(f, 'spacing/4'); bind(f, 'paddingBottom', 'spacing/3'); setPaints(f, 'fills', [['popover']]); f.strokes = [solid('border')]; f.strokeBottomWeight = 1; f.strokeTopWeight = 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0; f.strokeAlign = 'INSIDE';
  const l = inst(L2.label, 'state=default'); f.appendChild(l); l.setProperties({ [P(L2.label, 'label')]: 'Buscar o crear producto' });
  searchBox(f, placeholder);
}
async function pickerBody(k) { const b = stack('cuerpo (gap-5 py-4)', k, 20); padX(b, 'spacing/4'); padY(b, 'spacing/4'); return b; }
async function listaAnadir(k) {
  await pickerSearch(k, 'Leche, 2 yogures, tomates 1 kg…');
  const b = await pickerBody(k);
  await chipGroup(b, 'Te puede faltar', icon('sparkles', 16, 'chart-3', 'icon'), [['marcado', 'Huevos', 'huevo', '2 packs'], ['normal', 'Café molido', 'cafe'], ['normal', 'Tomate triturado', 'tomate']]);
  await chipGroup(b, 'Lácteos y huevos', product('leche', 16), [['en-lista', 'Leche entera', 'leche', 'pack 6'], ['normal', 'Yogures naturales', 'yogur', 'pack 8'], ['normal', 'Mantequilla', 'mantequilla'], ['normal', 'Queso rallado', 'queso']]);
  await chipGroup(b, 'Fruta y verdura', product('tomate', 16), [['en-lista', 'Tomates', 'tomate'], ['marcado', 'Plátanos', 'platano'], ['normal', 'Manzanas', 'manzana'], ['normal', 'Cebollas', 'cebolla'], ['normal', 'Patatas', 'patata']]);
  actionsFooter(k, true, [['default', 'lg', 'Añadir 2 a la lista', 'shopping-cart']]);
}
if (ARGS.screen === 'ls-anadir') {
  const k = modalSlot('Añadir a la lista'); await listaAnadir(k);
  const s = await sheetModal('lista', MO.lsAnadir, k, 'Añadir a la lista', 'Marca todo lo que necesites y entra de una vez.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'ls-buscar') {
  const k = modalSlot('Añadir a la lista · buscando');
  await pickerSearch(k, 'Leche, 2 yogures, tomates 1 kg…');
  const sb = k.findOne((n) => n.type === 'INSTANCE' && n.name === 'Buscador'); sb.swapComponent(variant(L.search, 'filled=true'));
  const si = sb.findAll((n) => n.type === 'INSTANCE').find((n) => n.componentProperties && Object.keys(n.componentProperties).some((x) => x.startsWith('value'))); if (si) si.setProperties({ [Object.keys(si.componentProperties).find((x) => x.startsWith('value'))]: 'tomate triturado 2' });
  const b = await pickerBody(k);
  await chipGroup(b, 'Nuevos (1)', null, [['nuevo', 'Yogur griego', null, '2 ud']]);
  const cr = stack('crear', b, 6); const cbt = BTN('outline', 'default', 'Crear «Tomate triturado»', 'plus'); cr.appendChild(cbt); cbt.layoutSizingHorizontal = 'FILL'; cbt.primaryAxisAlignItems = 'MIN';
  const hint = stack('px-1', cr, 0); padX(hint, 'spacing/1'); await note(hint, 'Se añadirá 2 ud');
  await chipGroup(b, 'Resultados', null, [['en-lista', 'Tomates', 'tomate'], ['normal', 'Tomate frito', 'tomate']]);
  actionsFooter(k, true, [['default', 'lg', 'Añadir 1 a la lista', 'shopping-cart']]);
  const s = await sheetModal('lista', MO.lsBuscar, k, 'Añadir a la lista', 'Marca todo lo que necesites y entra de una vez.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'ls-editar') {
  const k = modalSlot('Editar producto de la lista'); const b = body(k);
  const pf = await labeled(b, 'Producto', inputWith('Leche entera')); await note(pf, 'Cambiarlo renombra el producto también en el inventario.');
  const g = grid2(b, 'cantidad y unidad (grid-cols-2 gap-3)');
  const cf = await field(g, 'Cantidad', { value: '2', optional: true }); half(cf); half(await labeled(g, 'Unidad', selectWith('Unidades')));
  const eq = stack('equivalencia (-mt-2)', b, 0); eq.layoutPositioning = 'AUTO'; await note(eq, '2 packs = 12 ud');
  actionsFooter(k, false, [['default', 'lg', 'Guardar cambios'], ['destructive', 'default', 'Quitar de la lista', 'trash'], ['ghost', 'default', 'Cancelar']]);
  const s = await sheetModal('lista', MO.lsEditar, k, 'Editar producto', null);
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'ls-orden') {
  const k = modalSlot('Orden de los pasillos'); const b = body(k);
  const sw = stack('Orden que editas', b, 8); const sl = stack('px-1', sw, 0); padX(sl, 'spacing/1'); await text('Orden que editas', 'Body/Small Medium', 'foreground', sl);
  const cr = stack('chips (role=group)', sw, 8, 'HORIZONTAL'); ['General', 'Mercadona', 'Lidl'].forEach((l, i) => { const c = inst(L9.chip, 'activo=' + (i === 0)); cr.appendChild(c); c.setProperties({ [P(L9.chip, 'label')]: l }); });
  const ex = stack('px-1', b, 0); padX(ex, 'spacing/1'); await note(ex, 'Es tu orden general: manda en la lista agrupada y en las tiendas que no tengan uno propio.', 'muted-foreground', 'Body/Small');
  const ul = stack('pasillos (gap-1.5)', b, 6);
  for (const [n, sl, st] of [['Fruta y verdura', 'tomate', 'default'], ['Panadería', 'pan', 'arrastrando'], ['Lácteos y huevos', 'leche', 'default'], ['Carne', 'carne', 'default'], ['Pescado y marisco', 'pescado', 'default'], ['Despensa', 'arroz', 'default']]) { const r = inst(L9.pasillo, 'estado=' + st); ul.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.setProperties({ [P(L9.pasillo, 'nombre')]: n, [P(L9.pasillo, 'icono')]: prodC(sl).id }); }
  actionsFooter(k, false, [['outline', 'default', 'Listo']]);
  const s = await sheetModal('lista', MO.lsOrden, k, 'Orden de los pasillos', 'Colócalos como los recorres en la tienda. Se guarda al mover y manda en la lista agrupada y en el modo compra.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'ls-escritorio') {
  // ≥ md: Dialog centrado de 512 px (sm:max-w-lg), cabecera a la izquierda y la X de 36 px
  const k = modalSlot('Añadir a la lista · escritorio', 510); await listaAnadir(k);
  const s = screen(MO.lsEscritorio, 1280, 'desktop'); const c = desktop(s); withActions(c, 'Lista de la compra', []); await listaContenido(c, true);
  s.resize(1280, 900); s.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('AppSidebar')).resize(256, 900); await activate(s, 1);
  const ov = figma.createFrame(); ov.name = 'overlay'; ov.resize(1280, 900); setPaints(ov, 'fills', [['component/modal/overlay']]); ov.effects = [{ type: 'BACKGROUND_BLUR', radius: 4, visible: true }]; s.appendChild(ov);
  const m = inst(L3.modal, 'viewport=desktop, footer=default'); s.appendChild(m);
  m.setProperties({ [P(L3.modal, 'title')]: 'Añadir a la lista', [P(L3.modal, 'description')]: 'Marca todo lo que necesites y entra de una vez.' });
  m.findOne((n) => n.type === 'INSTANCE' && n.name === 'content').swapComponent(k); m.children.find((n) => n.name === 'footer').visible = false;
  m.x = (1280 - m.width) / 2; m.y = Math.max(24, (900 - m.height) / 2);
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

// ── Menús ──
function tileGrid3(parent, tiles) {
  const g = stack('acciones (grid-cols-3 gap-2)', parent, 8);
  for (let i = 0; i < tiles.length; i += 3) { const r = stack('fila', g, 8, 'HORIZONTAL'); for (const [estado, et, ic] of tiles.slice(i, i + 3)) { const t = inst(L9.accion, 'estado=' + estado); r.appendChild(t); t.layoutSizingHorizontal = 'FILL'; t.setProperties({ [P(L9.accion, 'etiqueta')]: et, [P(L9.accion, 'icono')]: iconComp(ic).id }); } }
  return g;
}
if (ARGS.screen === 'mn-nuevo') {
  const k = modalSlot('Plato nuevo'); const b = body(k);
  const ai = inst(L.ai, 'size=lg, state=default'); b.appendChild(ai); ai.layoutSizingHorizontal = 'FILL'; ai.setProperties({ [P(L.ai, 'label')]: 'Generar este hueco con IA' });
  await labeled(b, 'Plato', inputWith('Crema', 'p. ej. Lentejas con verduras'));
  const ul = stack('sugerencias del recetario (max-h-56)', b, 6);
  for (const n of ['Crema de calabacín', 'Crema de verduras']) { const r = BTN('outline', 'default', n, 'chef-hat'); ul.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.primaryAxisAlignItems = 'MIN'; r.name = n + ' · receta'; }
  const lib = BTN('outline', 'default', 'Añadir «Crema» · texto libre', 'plus'); b.appendChild(lib); lib.layoutSizingHorizontal = 'FILL'; lib.primaryAxisAlignItems = 'MIN';
  actionsFooter(k, false, [['ghost', 'default', 'Cancelar']]);
  const s = await sheetModal('menus', MO.mnNuevo, k, 'Cena · Martes', 'Genéralo con IA, elige una receta de tu recetario o escríbelo.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mn-plato') {
  const k = modalSlot('Editar un plato'); const b = body(k);
  await labeled(b, 'Plato', inputWith('Crema de calabacín'));
  tileGrid3(b, [['default', 'Cómo se cocina', 'chef-hat'], ['default', 'Otra idea', 'refresh-cw'], ['default', 'Fijar', 'pin'], ['default', 'Mover a…', 'move-right'], ['default', 'Duplicar en…', 'copy'], ['destructiva', 'Quitar del menú', 'trash']]);
  actionsFooter(k, false, [['default', 'lg', 'Guardar'], ['ghost', 'default', 'Cancelar']]);
  const s = await sheetModal('menus', MO.mnPlato, k, 'Cena · Martes', 'Edita o quita este plato.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mn-mover') {
  const k = modalSlot('Mover a…'); const b = body(k, 12);
  const g = stack('SlotPickerGrid (grid-cols-3 gap-2)', b, 8);
  const cells = []; for (const d of ['Lun 28', 'Mar 29', 'Mié 30', 'Jue 1', 'Vie 2', 'Sáb 3', 'Dom 4']) for (const h of ['Comida', 'Cena']) cells.push([d, h]);
  for (let i = 0; i < cells.length; i += 3) { const r = stack('fila', g, 8, 'HORIZONTAL'); for (const [d, h] of cells.slice(i, i + 3)) { const origen = d === 'Mar 29' && h === 'Cena'; const st = origen ? 'origen' : d === 'Lun 28' && h === 'Comida' ? 'bloqueada' : 'libre'; const c = inst(L9.hueco, 'estado=' + st); r.appendChild(c); c.layoutSizingHorizontal = 'FILL'; c.setProperties({ [P(L9.hueco, 'día')]: d, [P(L9.hueco, 'hueco')]: origen ? 'Aquí' : h }); } const row = r; for (let f = row.children.length; f < 3; f++) { const e = figma.createFrame(); e.name = '(hueco de la rejilla)'; e.fills = []; e.resize(10, 10); row.appendChild(e); e.layoutSizingHorizontal = 'FILL'; } }
  const f = slotFooter(k, false); const back = BTN('ghost', 'default', 'Volver', 'chevron-left'); f.appendChild(back); back.layoutSizingHorizontal = 'FILL';
  const s = await sheetModal('menus', MO.mnMover, k, 'Mover a…', 'Elige el día y el hueco de destino.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mn-faltan') {
  const k = modalSlot('Añadir a la lista lo que falte'); const b = body(k, 8);
  for (const [n, tipo, prod] of [['Calabacín', 'catalogo', 'Calabacín'], ['Nata para cocinar', 'aproximada', 'Nata'], ['Garbanzos cocidos', 'catalogo', 'Garbanzos'], ['Puerros', 'texto-libre', null]]) {
    const r = inst(L9.casilla, 'coincidencia=' + tipo); b.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.setProperties({ [P(L9.casilla, 'nombre')]: n });
    if (prod) { const bi = r.exposedInstances.find((x) => x.name === 'producto'); if (bi) bi.setProperties({ [P(L3.badge, 'label')]: prod }); }
  }
  actionsFooter(k, false, [['default', 'lg', 'Añadir 4 a la lista', 'shopping-cart'], ['ghost', 'default', 'Cancelar']]);
  const s = await sheetModal('menus', MO.mnFaltan, k, 'Añadir a la lista', 'Revisa lo que falta para el menú. Desmarca lo que no quieras.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mn-descontar') {
  const k = modalSlot('Descontar del inventario'); const b = body(k, 12);
  const ul = stack('descontables (gap-3)', b, 12);
  for (const [n, t, q, u] of [['Lentejas', 'Tienes 1 kg', '160', 'g'], ['Zanahorias', 'Tienes 5 ud', '1', 'ud'], ['Cebollas', 'Tienes 3 ud', '1', 'ud']]) {
    const r = inst(L9.desc, 'tipo=descontable'); ul.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.setProperties({ [P(L9.desc, 'nombre')]: n, [P(L9.desc, 'tienes')]: t, [P(L9.desc, 'unidad')]: u });
    const i = r.exposedInstances[0]; if (i) i.setProperties({ [P(L2.input, 'value')]: q });
  }
  const nd = stack('No se descuenta', b, 6); await text('No se descuenta', 'Caption/Medium', 'muted-foreground', nd);
  for (const [n, why] of [['Comino', 'La receta no indica cantidad'], ['Pimentón de la Vera', 'No está en tu catálogo']]) { const r = inst(L9.desc, 'tipo=no-se-descuenta'); nd.appendChild(r); r.layoutSizingHorizontal = 'FILL'; r.setProperties({ [P(L9.desc, 'nombre')]: n, [P(L9.desc, 'tienes')]: why }); }
  actionsFooter(k, false, [['default', 'lg', 'Descontar 3 ingredientes', 'check'], ['ghost', 'default', 'No descontar']]);
  const s = await sheetModal('menus', MO.mnDescontar, k, 'Descontar del inventario', 'Ajusta lo que has gastado de «Lentejas estofadas». Se descuenta del lote que caduca antes. Desmarcar «cocinado» no repone el stock.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mn-hoy') {
  const k = modalSlot('¿Qué hago hoy?'); const b = body(k, 8);
  for (const [t, n, m] of [['todo', 'Tortilla de patatas', 'Los huevos caducan mañana'], ['todo', 'Crema de calabacín', 'Conviene gastar Calabacín pronto'], ['falta', 'Arroz con pollo', 'Hace 3 semanas que no la haces']]) { const c = inst(L9.idea, 'tienes=' + t); b.appendChild(c); c.layoutSizingHorizontal = 'FILL'; c.setProperties({ [P(L9.idea, 'nombre')]: n, [P(L9.idea, 'motivo')]: m }); }
  actionsFooter(k, false, [['ghost', 'default', 'Cerrar']]);
  const s = await sheetModal('menus', MO.mnHoy, k, '¿Qué hago hoy?', 'Ideas cocinables ahora mismo con lo que tienes.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mn-ajustes') {
  const k = modalSlot('Ajustes del menú'); const b = body(k);
  const ob = stack('Objetivo del menú (fieldset)', b, 8); await text('Objetivo del menú', 'Body/Small Medium', 'foreground', ob);
  const og = stack('grid-cols-2 gap-2', ob, 8);
  for (const pair of [[['Equilibrado', 'Variado y sano', true], ['Ligero', 'Platos y cenas suaves', false]], [['Proteico', 'Más proteína en cada plato', false], ['Energético', 'Raciones contundentes', false]]]) { const r = stack('fila', og, 8, 'HORIZONTAL'); for (const [t, d, on] of pair) { const c = inst(L9.objetivo, 'activo=' + on); r.appendChild(c); c.layoutSizingHorizontal = 'FILL'; c.setProperties({ [P(L9.objetivo, 'título')]: t, [P(L9.objetivo, 'descripción')]: d }); } }
  const di = stack('Estilo de dieta (fieldset)', b, 8); await text('Estilo de dieta', 'Body/Small Medium', 'foreground', di);
  const dg = stack('grid-cols-2 gap-2', di, 8);
  for (const pair of [[['De todo', true], ['Vegetariano', false]], [['Vegano', false], ['Sin gluten', false]]]) { const r = stack('fila', dg, 8, 'HORIZONTAL'); for (const [t, on] of pair) { const x = BTN(on ? 'default' : 'outline', 'default', t); r.appendChild(x); x.layoutSizingHorizontal = 'FILL'; } }
  const ra = await labeled(b, 'Raciones por plato', inputWith('2')); ra.children[1].layoutSizingHorizontal = 'FIXED'; ra.children[1].resize(96, ra.children[1].height);
  const swRow = async (label, on, help) => { const w = stack(label, b, 4); const r = stack('fila', w, 12, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; const t = await text(label, 'Body/Small Medium', 'foreground', r); t.layoutGrow = 1; r.appendChild(inst(L9.switchC, `size=default, state=default, checked=${on}`)); if (help) await note(w, help); };
  await swRow('Planificar también el desayuno', false);
  await swRow('Repaso de platos pasados', true, 'Te preguntamos si llegaste a cocinar lo planificado cuando vuelvas a la app. Marcar un plato como cocinado descuenta sus ingredientes del inventario.');
  const ev = await labeled(b, 'Evitar ingredientes', (() => { const t = inst(L9.ta, 'state=default, filled=false'); t.setProperties({ [P(L9.ta, 'placeholder')]: 'p. ej. cilantro, marisco, hígado' }); return t; })());
  await note(ev, 'Es una preferencia para los menús generados, no una garantía frente a alergias o intolerancias.');
  const sep = figma.createFrame(); sep.name = 'Separator'; sep.resize(358, 1); setPaints(sep, 'fills', [['border']]); b.appendChild(sep); sep.layoutSizingHorizontal = 'FILL';
  const rl = stack('Reglas del menú', b, 12);
  const rh = stack('cabecera', rl, 4); const rt = stack('h3', rh, 6, 'HORIZONTAL'); rt.counterAxisAlignItems = 'CENTER'; rt.appendChild(icon('list-checks', 16, 'foreground', 'icon')); await text('Reglas del menú', 'Body/Small Medium', 'foreground', rt);
  await note(rh, 'Cada cuánto quieres una receta, huecos que no se planifican o instrucciones libres.');
  const ul = stack('reglas', rl, 8);
  for (const [t, on] of [['Lentejas estofadas · al menos 1 vez/semana', true], ['Viernes · no planificar la cena', true], ['Los domingos, algo especial', false]]) {
    const r = stack(t, ul, 8, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; padX(r, 'spacing/2'); padY(r, 'spacing/2'); rad(r, 'radius/lg'); r.strokeWeight = 1; r.strokeAlign = 'INSIDE'; setPaints(r, 'strokes', [['border']]);
    r.appendChild(inst(L9.switchC, `size=default, state=default, checked=${on}`));
    const tx = await text(t, 'Body/Small', on ? 'foreground' : 'muted-foreground', r); tx.layoutGrow = 1; if (!on) tx.textDecoration = 'STRIKETHROUGH';
    const del = IB('ghost', 'icon', 'trash'); r.appendChild(del); recolor(del.findAll((q) => q.type === 'INSTANCE')[0], 'muted-foreground');
  }
  rl.appendChild(BTN('outline', 'default', 'Añadir regla', 'plus'));
  actionsFooter(k, false, [['default', 'lg', 'Guardar preferencias'], ['ghost', 'default', 'Cerrar']]);
  const s = await sheetModal('menus', MO.mnAjustes, k, 'Ajustes del menú', 'Lo que la IA tiene en cuenta al generar tus menús.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}
if (ARGS.screen === 'mn-rehacer') {
  const k = modalSlot('Rehacer todo el menú');
  actionsFooter(k, false, [['destructive', 'lg', 'Rehacer todo', 'sparkles'], ['ghost', 'default', 'Cancelar']]);
  const s = await sheetModal('menus', MO.mnRehacer, k, 'Rehacer todo el menú', 'Se borrará lo que queda de semana —incluidos tus platos fijados y los que has editado o añadido a mano— y se generará un menú nuevo. Los días que ya han pasado se quedan como están. Esta acción no se puede deshacer.');
  return { screen: s.id, fixedIcons: await fixIconColors(s) };
}

if (ARGS.screen === 'indice') {
  // Colocar las pantallas en una rejilla con títulos
  const order = [['Inventario · móvil', 'Inventario · móvil · oscuro', 'Lista de la compra · móvil', 'Menús · móvil'], ['Inventario · escritorio', 'Lista de la compra · escritorio', RC.escritorio], [PU.crear, PU.pregunta, PU.invitar, PU.lista, PU.inventario, PU.unirse], [PT.aviso, PT.escanear, PT.analizando, PT.revisar, PT.celebracion, PT.caducidades], [RP.dTarjeta, RP.dPreguntas, RP.dLista, RP.pTarjeta, RP.pPreguntas, RP.pDescontar, RP.pPorQue], [RC.vacio, RC.lista, RC.receta, RC.antes, RC.paso, RC.final], [PP.prVacio, PP.prLista, PP.prProducto, PP.rsCerrado, PP.rsPrimer, PP.pfNuevo, PP.pfAhorro], [AL.ajIndice, AL.ajHogar, AL.lgMovil, AL.ldMovil], [AL.lgEscritorio, AL.ldEscritorio], [ES.abriendo, ES.encuadre, ES.detectado, ES.ajuste, ES.sinCamara], [MC.comprando, MC.quitar, MC.todo, MC.vacia, MC.escritorio], [MO.invAnadir, MO.invAnadirAjustes, MO.invFicha, MO.invFichaAjustes, MO.invIcono], [MO.lsAnadir, MO.lsBuscar, MO.lsEditar, MO.lsOrden, MO.lsEscritorio], [MO.mnNuevo, MO.mnPlato, MO.mnMover, MO.mnFaltan, MO.mnDescontar, MO.mnHoy, MO.mnAjustes, MO.mnRehacer], [PT.escanear, PT.revisar, RC.lista, PP.prLista].map((n) => n + ' · escritorio'), [PP.prProducto, PP.rsCerrado, PP.pfAhorro, AL.ajIndice].map((n) => n + ' · escritorio')];
  let y = 0; const out = [];
  // Solo los hijos directos: con findOne/findAll sobre el árbol entero (decenas de miles de
  // nodos), cada búsqueda de las ~90 del bucle recorría la página y el plugin se bloqueaba minutos.
  const oldT = page.children.filter((n) => n.name.startsWith('título · ')); for (const t of oldT) t.remove();
  for (const rowNames of order) { let x = 0, h = 0; for (const n of rowNames) { const s = page.children.find((k) => k.name === n); if (!s) continue; s.x = x; s.y = y + 48; const t = await text(n, 'Title/Section', 'foreground', page); t.name = 'título · ' + n; t.x = x; t.y = y; x += s.width + 120; h = Math.max(h, s.height); out.push(n); } y += h + 48 + 200; }
  return out;
}
