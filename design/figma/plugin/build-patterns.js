// build-patterns.js — Fase 6: patrones de las features, montados con instancias de
// la librería (nunca copias). Página «◆ PATRONES». ARGS.part:
//   estado | buscador | chip | stepper | card | row | sugerencia | ai | seccion | dia | seleccion | fila-ajustes | selector-producto | linea-ticket | celebracion | tarjeta-repaso | pregunta-despensa | pregunta-plato | coste | tarjeta-receta
//   receta-pack | valoracion | ingrediente-cocina | temporizador | plato-apilado | doc
const ES = async (n) => (await figma.getLocalEffectStylesAsync()).find((s) => s.name === n).id;
async function setOf(pageName, name) { const p = figma.root.children.find((x) => x.name === pageName); await p.loadAsync(); const n = p.findOne((k) => (k.type === 'COMPONENT_SET' || (k.type === 'COMPONENT' && k.parent.type !== 'COMPONENT_SET')) && k.name === name); if (!n) throw new Error('Falta ' + name); return n; }
const P = (cs, p) => Object.keys(cs.componentPropertyDefinitions).find((k) => k.startsWith(p));
const variant = (cs, name) => { const v = cs.children.find((c) => c.name === name); if (!v) throw new Error('Variante ' + name + ' en ' + cs.name); return v; };
const iconsPage = figma.root.children.find((p) => p.name === '06 · Iconografía'); await iconsPage.loadAsync();
function product(slug, size) { const c = iconsPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'product/' + slug); const i = c.createInstance(); i.rescale(size / c.width); i.name = 'product-icon'; return i; }
function textFill(inst, token) { for (const t of inst.findAll((n) => n.type === 'TEXT')) setPaints(t, 'fills', [[token]]); }
const page = await pageByName('◆ PATRONES');
function single(name) { for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === name && n.parent.type !== 'COMPONENT_SET')) n.remove(); const c = figma.createComponent(); c.name = name; c.clipsContent = false; c.fills = []; page.appendChild(c); c.x = 3000; c.y = 0; return c; }

// Estados de caducidad y existencias: la fila de badges de la tarjeta de inventario
const ESTADOS = {
  'caduca-en-dias': ['success', 'Caduca en 6 días'], 'caduca-pronto': ['warning', 'Caduca mañana'], caducado: ['destructive', 'Caducó ayer'],
  'quedan-pocas': ['warning', 'Quedan pocas'], 'consumir-pronto': ['warning', 'Consumir pronto'], agotado: [null, 'Agotado'],
};
if (ARGS.part === 'estado') {
  const badge = await setOf('05 · Contenido', 'Badge');
  const add = stager(page, 'staging · Estado');
  for (const [k, [tone, label]] of Object.entries(ESTADOS)) {
    const c = comp('estado=' + k); add(c);
    const b = variant(badge, tone ? 'variant=default' : 'variant=outline').createInstance(); c.appendChild(b); b.setProperties({ [P(badge, 'label')]: label });
    // el Badge ya trae border-transparent: NO se sobrescribe el trazo (en una instancia,
    // un trazo enlazado a `transparent` se pinta negro: la alfa no se aplica en overrides)
    if (tone) { setPaints(b, 'fills', [[tone, 0.15]]); textFill(b, tone); }
  }
  const { cs } = await combine(page, 'staging · Estado', 'Estado de producto', { estado: Object.keys(ESTADOS) }, 'estado', [], 'La fila de badges de la tarjeta de inventario (inventory-item-card.tsx + inventory/status.ts): Badge con className, NO variantes nuevas del componente. Caducidad (getExpiryStatus, aviso a 3 días): < 0 «Caducó ayer / hace N días» en destructive; 0–3 «Caduca hoy / mañana / en N días» en warning; > 3 «Caduca en N días» en success. «Quedan pocas» (≤ mínimo) y «Consumir pronto» en warning. Todos con tinte /15 y border-transparent. «Agotado» es outline: sin existencias se calla toda la escala de frescura. OJO: /styleguide los enseña con borde /30–/40; la tarjeta real usa border-transparent. Aquí manda la tarjeta.');
  // El texto vive dentro del Badge: se expone la instancia para editar su label desde aquí
  for (const c of cs.children) { const b = c.children[0]; if (b && b.type === 'INSTANCE') b.isExposedInstance = true; }
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'buscador') {
  const input = await setOf('02 · Formularios', 'Input');
  const add = stager(page, 'staging · Buscador');
  for (const filled of ['false', 'true']) {
    const c = comp('filled=' + filled); c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'AUTO'; c.resize(358, 44); add(c);
    const i = variant(input, `state=default, filled=${filled}`).createInstance(); c.appendChild(i); i.layoutSizingHorizontal = 'FILL';
    i.setProperties({ [P(input, 'placeholder')]: 'Buscar producto o categoría', [P(input, 'value')]: 'yogur' });
    bind(i, 'paddingLeft', 'spacing/9'); bind(i, 'paddingRight', 'spacing/9');
    const s = icon('search', 16, 'muted-foreground', 'search'); c.appendChild(s); s.layoutPositioning = 'ABSOLUTE'; s.x = 12; s.y = 14; s.constraints = { horizontal: 'MIN', vertical: 'CENTER' };
    if (filled === 'true') { const x = figma.createFrame(); x.name = 'clear'; x.layoutMode = 'HORIZONTAL'; x.primaryAxisAlignItems = 'CENTER'; x.counterAxisAlignItems = 'CENTER'; x.resize(36, 36); rad(x, 'radius/md'); x.fills = []; x.appendChild(icon('x', 16, 'muted-foreground', 'icon')); c.appendChild(x); x.layoutPositioning = 'ABSOLUTE'; x.x = 358 - 4 - 36; x.y = 4; x.constraints = { horizontal: 'MAX', vertical: 'CENTER' }; }
  }
  const { cs } = await combine(page, 'staging · Buscador', 'Buscador', { filled: ['false', 'true'] }, 'filled', [], 'Buscador (inventario, historial, recetas, selector de iconos): Input con pl-9 pr-9, lupa de 16 px en muted-foreground (absolute left-3) y, con texto, botón de borrar de 36 px (absolute right-1, aria-label «Borrar búsqueda»). ES LA ÚNICA EXCEPCIÓN A LA ETIQUETA VISIBLE: la etiqueta va en sr-only con el mismo texto que el placeholder. Lo que dice de qué va el campo cuando ya escribes es la lupa, que sigue ahí. Fuera de un buscador, un placeholder como única etiqueta es un error.');
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'chip') {
  const add = stager(page, 'staging · Chip');
  const V = { inactivo: [[], 'border', 'foreground', 'muted-foreground'], 'activo-aviso': [[['warning', 0.15]], null, 'warning', 'warning'], 'activo-caducados': [[['destructive', 0.15]], null, 'destructive', 'destructive'], tienda: [[['primary']], 'primary', 'primary-foreground', 'primary-foreground'] };
  for (const [k, [fill, stroke, fg, countFg]] of Object.entries(V)) {
    const c = comp('estado=' + k); c.counterAxisSizingMode = 'FIXED'; c.resize(120, 44); bind(c, 'height', 'spacing/11'); bind(c, 'paddingLeft', 'spacing/3_5'); bind(c, 'paddingRight', 'spacing/3_5'); bind(c, 'itemSpacing', 'spacing/1_5'); rad(c, 'radius/full');
    setPaints(c, 'fills', fill); border(c, stroke, 1); add(c);
    await text(k === 'tienda' ? 'Mercadona' : k === 'activo-caducados' ? 'Caducados' : 'Caducan pronto', 'Body/Small Medium', fg, c, { name: 'label' });
    if (k !== 'tienda') await text('3', 'Body/Small Medium', countFg, c, { name: 'count' });
  }
  const { cs } = await combine(page, 'staging · Chip', 'Chip de filtro', { estado: Object.keys(V) }, 'estado', [], 'Chips de filtro del inventario (inventory-list.tsx): h-11, rounded-full, px-3.5, text-sm font-medium, con el recuento en tabular-nums. Inactivo = borde y texto normal (el número en muted); activo = tinte /15 sin borde, destructive para «Caducados» y warning para el resto. En móvil van en una fila con scroll horizontal (no-scrollbar); desde md se envuelven. «tienda» es ChainChip (src/components/chain-chip.tsx), el selector de pasillos de /lista: activo = bg-primary.');
  const kl = cs.addComponentProperty('label', 'TEXT', 'Caducan pronto'), kc = cs.addComponentProperty('count', 'TEXT', '3');
  for (const c of cs.children) { c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kl }; const t = c.findOne((n) => n.name === 'count'); if (t) t.componentPropertyReferences = { characters: kc }; }
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'stepper') {
  const ib = await setOf('01 · Acciones', 'Button · Icon');
  const IK = P(ib, 'icon');
  const add = stager(page, 'staging · Stepper');
  for (const [k, btnVariant, val, weight, minus] of [['lista', 'ghost', '2', 'Body/Small', 'default'], ['lista-peso', 'ghost', '0,75 kg', 'Body/Small', 'default'], ['lista-minimo', 'ghost', '1', 'Body/Small', 'disabled'], ['inventario', 'outline', '4', 'Body/Small Medium', 'default']]) {
    const c = comp('uso=' + k); add(c);
    const m = variant(ib, `variant=${btnVariant}, size=icon, state=${minus}`).createInstance(); c.appendChild(m); m.setProperties({ [IK]: iconComp('minus').id }); m.name = 'restar';
    const v = figma.createFrame(); v.name = 'valor'; v.layoutMode = 'HORIZONTAL'; v.primaryAxisAlignItems = 'CENTER'; v.counterAxisAlignItems = 'CENTER'; v.fills = []; v.primaryAxisSizingMode = 'AUTO'; v.counterAxisSizingMode = 'AUTO';
    bind(v, 'minWidth', k === 'lista-peso' ? 'spacing/10' : k === 'inventario' ? 'spacing/8' : 'spacing/6'); c.appendChild(v);
    const t = await text(val, weight, 'foreground', v, { name: 'value' }); if (k === 'inventario') t.fontName = { family: 'Geist', style: 'SemiBold' };
    const p = variant(ib, `variant=${btnVariant}, size=icon, state=default`).createInstance(); c.appendChild(p); p.setProperties({ [IK]: iconComp('plus').id }); p.name = 'sumar';
    if (btnVariant === 'ghost') for (const b of [m, p]) recolor(b.findAll((n) => n.type === 'INSTANCE')[0], 'muted-foreground');
  }
  const { cs } = await combine(page, 'staging · Stepper', 'QuantityStepper', { uso: ['lista', 'lista-peso', 'lista-minimo', 'inventario'] }, 'uso', [], 'QuantityStepper (shopping-list/components/quantity-stepper.tsx): Button ghost size icon (44 px) con Minus y Plus en muted-foreground y el valor en text-sm tabular-nums (min-w-6 si se cuenta en unidades, min-w-10 con unidad). Paso: 1 ud, o ¼ kg, ½ l, 100 g/ml. El «−» se deshabilita en el paso mínimo; el «+» nunca. aria-label «Restar/Sumar {paso} a {nombre}» y el número en una región aria-live; entra con zoom-in-50 en cada cambio. En la tarjeta de inventario el stepper es otro: Button OUTLINE y valor font-semibold min-w-8 (uso=inventario).');
  const kv = cs.addComponentProperty('value', 'TEXT', '2');
  // El valor por defecto de una propiedad de TEXTO es UNO para todo el set: escribir el texto
  // variante a variante lo pisa (gana la última). Cada instancia fija su valor.
  for (const c of cs.children) c.findOne((n) => n.name === 'value').componentPropertyReferences = { characters: kv };
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'card') {
  const estado = await setOf('◆ PATRONES', 'Estado de producto');
  const stepper = await setOf('◆ PATRONES', 'QuantityStepper');
  const btn = await setOf('01 · Acciones', 'Button');
  const add = stager(page, 'staging · Tarjeta');
  const V = { 'en-stock': 'caduca-en-dias', 'caduca-pronto': 'caduca-pronto', caducado: 'caducado', 'quedan-pocas': 'quedan-pocas', agotado: null, 'agotado-en-lista': null };
  for (const [k, est] of Object.entries(V)) {
    const out = k.startsWith('agotado');
    const c = comp('estado=' + k, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(358, 10); c.primaryAxisSizingMode = 'AUTO'; c.itemSpacing = 0;
    rad(c, 'radius/xl'); setPaints(c, 'fills', [['card']]); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; c.clipsContent = true; add(c);
    const row = stack('fila', c, 12, 'HORIZONTAL'); row.counterAxisAlignItems = 'CENTER'; padX(row, 'spacing/3'); padY(row, 'spacing/3');
    const info = stack('info', row, 12, 'HORIZONTAL'); info.layoutSizingHorizontal = 'FILL'; info.counterAxisAlignItems = 'MIN';
    const iw = figma.createFrame(); iw.name = 'icono'; iw.fills = []; iw.clipsContent = false; iw.resize(32, 32); info.appendChild(iw);
    const pi = product('yogur', 32); iw.appendChild(pi); pi.x = 0; pi.y = 0; if (out) pi.opacity = 0.5;
    const chip = figma.createFrame(); chip.name = 'en-la-lista'; chip.layoutMode = 'HORIZONTAL'; chip.primaryAxisAlignItems = 'CENTER'; chip.counterAxisAlignItems = 'CENTER'; chip.resize(18, 18); rad(chip, 'radius/full'); setPaints(chip, 'fills', [['primary']]); setPaints(chip, 'strokes', [['card']]); chip.strokeWeight = 2; chip.strokeAlign = 'OUTSIDE';
    chip.appendChild(icon('shopping-cart', 12, 'primary-foreground', 'icon')); iw.appendChild(chip); chip.x = 32 - 18 + 4; chip.y = 32 - 18 + 4; chip.visible = false;
    const txt = stack('textos', info, 2); txt.layoutSizingHorizontal = 'FILL';
    await text('Yogur natural', 'Body/Base Medium', out ? 'muted-foreground' : 'foreground', txt, { fill: true, name: 'name' });
    const badges = stack('badges', txt, 6, 'HORIZONTAL'); badges.layoutWrap = 'WRAP'; badges.counterAxisSpacing = 6; badges.counterAxisAlignItems = 'CENTER';
    if (out) { const b = variant(estado, 'estado=agotado').createInstance(); badges.appendChild(b); }
    else { await text('4 ud · 500 g', 'Body/Small', 'muted-foreground', badges, { name: 'qty' }); const b = variant(estado, 'estado=' + est).createInstance(); badges.appendChild(b); }
    const st = variant(stepper, 'uso=inventario').createInstance(); row.appendChild(st); st.setProperties({ [P(stepper, 'value')]: out ? '0' : '4' });
    if (out) { // disabled={qty <= 0}: el «−» agotado va deshabilitado
      const ib = await setOf('01 · Acciones', 'Button · Icon');
      const m = st.findOne((n) => n.name === 'restar'); m.swapComponent(variant(ib, 'variant=outline, size=icon, state=disabled')); m.setProperties({ [P(ib, 'icon')]: iconComp('minus').id });
    }
    if (out) {
      const foot = stack('pie', c, 0); foot.paddingLeft = foot.paddingRight = foot.paddingTop = foot.paddingBottom = 8; bind(foot, 'paddingLeft', 'spacing/2'); bind(foot, 'paddingRight', 'spacing/2'); bind(foot, 'paddingTop', 'spacing/2'); bind(foot, 'paddingBottom', 'spacing/2');
      foot.strokes = [solid('border')]; foot.strokeTopWeight = 1; foot.strokeBottomWeight = 0; foot.strokeLeftWeight = 0; foot.strokeRightWeight = 0; foot.strokeAlign = 'INSIDE';
      const inList = k === 'agotado-en-lista';
      const b = variant(btn, `variant=${inList ? 'secondary' : 'outline'}, size=default, state=default`).createInstance(); foot.appendChild(b); b.layoutSizingHorizontal = 'FILL';
      b.setProperties({ [P(btn, 'label')]: inList ? 'En la lista · quitar' : 'Añadir a la lista', [P(btn, 'icon inline-start#')]: true, [P(btn, 'icon inline-start ↳')]: iconComp(inList ? 'check' : 'shopping-cart').id });
    }
  }
  const { cs } = await combine(page, 'staging · Tarjeta', 'Tarjeta de inventario', { estado: Object.keys(V) }, 'estado', [], 'InventoryItemCard (features/inventory/components/inventory-item-card.tsx): rounded-xl border bg-card, fila p-3 gap-3. Icono de producto de 32 px (al 50 % si está agotado) con el chip «en la lista» en la esquina (18 px, bg-primary, ring-2 ring-card; nunca en agotados), nombre en font-medium (text-base, hasta 2 líneas) y debajo la cantidad en text-sm muted-foreground seguida de los badges de estado. A la derecha, el stepper de inventario (Button outline de 44 px, valor font-semibold). Agotado: el badge «Agotado» sustituye a la cantidad, se calla la escala de frescura y aparece un pie con border-t y un botón a ancho completo (outline «Añadir a la lista», o secondary «En la lista · quitar»). En móvil, deslizar a la derecha descubre «A la lista» / «Quitar» detrás de la tarjeta.');
  const K = { n: cs.addComponentProperty('name', 'TEXT', 'Yogur natural'), l: cs.addComponentProperty('en la lista', 'BOOLEAN', false), i: cs.addComponentProperty('producto', 'INSTANCE_SWAP', iconsPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'product/yogur').id), q: cs.addComponentProperty('qty', 'TEXT', '4 ud · 500 g') };
  for (const c of cs.children) { c.findOne((n) => n.name === 'name').componentPropertyReferences = { characters: K.n }; const ch = c.findOne((n) => n.name === 'en-la-lista'); if (!c.name.includes('agotado')) ch.componentPropertyReferences = { visible: K.l }; c.findOne((n) => n.name === 'product-icon').componentPropertyReferences = { mainComponent: K.i }; const q = c.findOne((n) => n.name === 'qty'); if (q) q.componentPropertyReferences = { characters: K.q }; }
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).filter((x) => !x.startsWith('product')).length };
}

if (ARGS.part === 'row') {
  const cb = await setOf('02 · Formularios', 'Checkbox');
  const stepper = await setOf('◆ PATRONES', 'QuantityStepper');
  const ib = await setOf('01 · Acciones', 'Button · Icon');
  const add = stager(page, 'staging · Fila');
  for (const checked of ['false', 'true']) for (const chip of ['ninguno', 'tienda', 'ahorro']) {
    const on = checked === 'true';
    const c = comp(`checked=${checked}, chip=${chip}`); c.primaryAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.resize(358, 48); bind(c, 'itemSpacing', 'spacing/1'); rad(c, 'radius/lg'); setPaints(c, 'fills', [['background']]); add(c);
    const lab = stack('check', c, 0, 'HORIZONTAL'); lab.layoutSizingHorizontal = 'HUG'; lab.counterAxisAlignItems = 'CENTER'; bind(lab, 'minHeight', 'spacing/12'); bind(lab, 'paddingLeft', 'spacing/1'); bind(lab, 'paddingRight', 'spacing/3'); padY(lab, 'spacing/1');
    const box = variant(cb, `state=default, checked=${checked}`).createInstance(); lab.appendChild(box); box.rescale(20 / 16);
    const iw = stack('icono', c, 0, 'HORIZONTAL'); iw.layoutSizingHorizontal = 'FIXED'; iw.resize(20, 18); iw.primaryAxisAlignItems = 'CENTER'; iw.appendChild(product('leche', 18));
    const name = stack('nombre', c, 6, 'HORIZONTAL'); name.layoutSizingHorizontal = 'FILL'; name.counterAxisAlignItems = 'CENTER'; name.layoutWrap = 'WRAP'; name.counterAxisSpacing = 2; bind(name, 'minHeight', 'spacing/12');
    const n = await text('Leche entera', 'Body/Small', on ? 'muted-foreground' : 'foreground', name, { name: 'name' }); n.textDecoration = on ? 'STRIKETHROUGH' : 'NONE';
    await text('= 6 ud', 'Body/Small', 'muted-foreground', name, { name: 'total' });
    if (chip !== 'ninguno') {
      const ch = stack('chip', name, 2, 'HORIZONTAL'); ch.layoutSizingHorizontal = 'HUG'; ch.counterAxisAlignItems = 'CENTER'; padX(ch, 'spacing/1_5'); padY(ch, 'spacing/0_5'); rad(ch, 'radius/md');
      const sav = chip === 'ahorro'; setPaints(ch, 'fills', [[sav ? 'chart-3' : 'muted', sav ? 0.1 : 1]]);
      ch.appendChild(icon(sav ? 'trending-down' : 'store', 12, sav ? 'price' : 'muted-foreground', 'icon'));
      const t = await text(sav ? 'Alipende −12%' : 'Mercadona', 'Caption/Medium', sav ? 'price' : 'muted-foreground', ch); bind(t, 'fontSize', 'font-size/arbitrary-11px');
    }
    const st = variant(stepper, 'uso=lista').createInstance(); c.appendChild(st); st.setProperties({ [P(stepper, 'value')]: '2' });
    const del = variant(ib, 'variant=ghost, size=icon, state=default').createInstance(); c.appendChild(del); del.setProperties({ [P(ib, 'icon')]: iconComp('trash').id }); recolor(del.findAll((x) => x.type === 'INSTANCE')[0], 'muted-foreground');
  }
  const { cs } = await combine(page, 'staging · Fila', 'Fila de la lista', { checked: ['false', 'true'], chip: ['ninguno', 'tienda', 'ahorro'] }, 'chip', ['checked'], 'ListRow (shopping-list/components/shopping-list-view.tsx): fila de min-h-12 con Checkbox de 20 px (size-5), icono de producto de 18 px, nombre en text-sm con subrayado punteado (abre la edición) y el total «= 6 ud» en muted-foreground, QuantityStepper y papelera ghost (en escritorio solo aparece con hover o foco). Marcado = nombre tachado en muted-foreground y la fila pasa a «En el carro». Como mucho un chip: el de AHORRO (bg-chart-3/10, text-price, TrendingDown, text-[11px]) gana al de tienda (bg-muted, Store). No hay precio por fila. En móvil, deslizar a la izquierda descubre «Quitar» en destructive.');
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).filter((x) => !x.startsWith('product')).length };
}

if (ARGS.part === 'sugerencia') {
  const ib = await setOf('01 · Acciones', 'Button · Icon');
  const s = single('Te puede faltar');
  s.layoutMode = 'VERTICAL'; s.primaryAxisSizingMode = 'AUTO'; s.counterAxisSizingMode = 'FIXED'; s.resize(358, 10); s.primaryAxisSizingMode = 'AUTO'; s.itemSpacing = 4;
  padX(s, 'spacing/3'); padY(s, 'spacing/3'); rad(s, 'radius/xl'); setPaints(s, 'strokes', [['border']]); s.strokeWeight = 1; s.strokeAlign = 'INSIDE'; s.dashPattern = [4, 4];
  await text('Te puede faltar', 'Body/Small Medium', 'foreground', s, { fill: true, name: 'title' });
  for (const [n, reason, qty] of [['Huevos', 'Se ha agotado', '12 ud'], ['Tomate triturado', 'Sueles comprarlo cada ~9 días', '1 ud'], ['Café molido', 'Bajo tu mínimo', '250 g']]) {
    const li = stack(n, s, 4, 'HORIZONTAL'); li.counterAxisAlignItems = 'CENTER';
    const b = stack('añadir', li, 12, 'HORIZONTAL'); b.layoutSizingHorizontal = 'FILL'; b.counterAxisAlignItems = 'CENTER'; bind(b, 'minHeight', 'spacing/12'); padX(b, 'spacing/1'); rad(b, 'radius/lg');
    const cc = figma.createFrame(); cc.name = 'plus'; cc.layoutMode = 'HORIZONTAL'; cc.primaryAxisAlignItems = 'CENTER'; cc.counterAxisAlignItems = 'CENTER'; cc.resize(32, 32); rad(cc, 'radius/full'); setPaints(cc, 'fills', [['primary', 0.1]]); cc.appendChild(icon('plus', 16, 'primary', 'icon')); b.appendChild(cc);
    const tx = stack('textos', b, 0); tx.layoutSizingHorizontal = 'FILL';
    await text(n, 'Body/Small Medium', 'foreground', tx, { fill: true, name: 'name' }); await text(reason, 'Caption/Default', 'muted-foreground', tx, { fill: true, name: 'reason' });
    await text(qty, 'Body/Small', 'muted-foreground', b, { name: 'qty' });
    const x = variant(ib, 'variant=ghost, size=icon, state=default').createInstance(); li.appendChild(x); x.setProperties({ [P(ib, 'icon')]: iconComp('x').id }); recolor(x.findAll((q) => q.type === 'INSTANCE')[0], 'muted-foreground');
  }
  s.description = '«Te puede faltar» (sugerencias de /lista): caja rounded-xl con borde discontinuo y p-3. Cada fila: círculo de 32 px bg-primary/10 con Plus en primary, nombre en text-sm font-medium, motivo en text-xs muted-foreground y cantidad a la derecha; X ghost para descartar. Hasta 8 y luego «Ver todas (n)». El motivo lo decide suggestion-reason.ts (check:motivos): «Se te ha caducado», «Se ha agotado», «Sueles comprarlo cada ~N días», «Toca reponer», «Bajo tu mínimo».';
  return { id: s.id, fixedIcons: await fixIconColors(s), unbound: unboundPaints(s).length };
}

if (ARGS.part === 'ai') {
  const aiFill = (await figma.getLocalPaintStylesAsync()).find((p) => p.name === 'AI fill');
  const add = stager(page, 'staging · IA');
  for (const size of ['default', 'lg']) for (const st of ['default', 'loading']) {
    const lg = size === 'lg';
    const c = comp(`size=${size}, state=${st}`); c.counterAxisSizingMode = 'FIXED'; c.primaryAxisSizingMode = 'FIXED'; c.resize(320, lg ? 48 : 44); bind(c, 'height', lg ? 'spacing/12' : 'spacing/11'); padX(c, lg ? 'spacing/5' : 'spacing/4'); bind(c, 'itemSpacing', 'spacing/2'); rad(c, 'radius/lg');
    setPaints(c, 'fills', [['primary']]); border(c, null, 1); if (st === 'loading') c.opacity = 0.5; add(c);
    const glow = figma.createFrame(); glow.name = 'ai-fill (::before)'; c.appendChild(glow); glow.layoutPositioning = 'ABSOLUTE'; glow.x = 0; glow.y = 0; glow.resize(320, lg ? 48 : 44); glow.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' }; rad(glow, 'radius/lg'); await glow.setFillStyleIdAsync(aiFill.id);
    c.appendChild(icon(st === 'loading' ? 'loader-circle' : 'sparkles', 16, 'primary-foreground', st === 'loading' ? 'spinner' : 'icon'));
    await text(st === 'loading' ? 'Mirando lo que tienes en casa…' : 'Generar menú con IA', lg ? 'Body/Base Medium' : 'Body/Small Medium', 'primary-foreground', c, { name: 'label' });
  }
  const { cs } = await combine(page, 'staging · IA', 'Botón de IA', { size: ['default', 'lg'], state: ['default', 'loading'] }, 'state', ['size'], 'AiGenerateButton (features/menus/components/ai-generate-button.tsx): un Button por defecto con un ::before que lleva --ai-fill (estilo AI fill: verde de marca → ámbar, 115°) y LATE con animate-ai-breathe (opacidad 0,45 ↔ 1 en 3,5 s) mientras no está cargando ni deshabilitado; aquí se ve en su punto de máxima opacidad. Es la única animación permanente de la app y solo existe donde se entra a la IA. lg (48 px) cuando el botón va arriba (quedan huecos libres), default si la semana está completa; ocupa el ancho (flex-1) junto a los ajustes del menú. Texto: «Generar menú con IA» o «Completar menú con IA» si ya hay platos fijados. Cargando: spinner en lugar de Sparkles y un mensaje que avanza cada 1,8 s («Mirando lo que tienes en casa…», «Contando lo que ya está en la lista…», «Repasando qué habéis cocinado hace poco…», «Cuadrando el presupuesto de la semana…», «Escribiendo la semana…»).');
  const kl = cs.addComponentProperty('label', 'TEXT', 'Generar menú con IA');
  for (const c of cs.children) if (c.name.endsWith('default')) c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kl };
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'seccion') {
  const badge = await setOf('05 · Contenido', 'Badge');
  const s = single('Cabecera de sección');
  s.layoutMode = 'HORIZONTAL'; s.counterAxisAlignItems = 'CENTER'; s.primaryAxisSizingMode = 'FIXED'; s.counterAxisSizingMode = 'FIXED'; s.resize(358, 56); bind(s, 'itemSpacing', 'spacing/2'); bind(s, 'paddingBottom', 'spacing/3');
  setPaints(s, 'fills', [['background', 0.95]]); s.strokes = [solid('border')]; s.strokeBottomWeight = 1; s.strokeTopWeight = 0; s.strokeLeftWeight = 0; s.strokeRightWeight = 0; s.strokeAlign = 'INSIDE';
  const e = await text('🧊', 'Body/Base', 'foreground', s, { name: 'emoji' });
  await text('Nevera', 'Title/Base', 'foreground', s, { name: 'title' });
  await text('(12)', 'Body/Small', 'muted-foreground', s, { name: 'count' });
  for (const [tone, ic, n] of [['destructive', 'triangle-alert', '1'], ['warning', 'clock', '3']]) {
    const b = variant(badge, 'variant=default').createInstance(); s.appendChild(b); b.setProperties({ [P(badge, 'label')]: n, [P(badge, 'icon inline-start#')]: true, [P(badge, 'icon inline-start ↳')]: iconComp(ic).id });
    setPaints(b, 'fills', [[tone, 0.12]]); textFill(b, tone); recolor(b.findAll((x) => x.type === 'INSTANCE')[0], tone);
  }
  const sp = figma.createFrame(); sp.name = 'spacer'; sp.fills = []; sp.resize(1, 1); s.appendChild(sp); sp.layoutGrow = 1;
  s.appendChild(icon('chevron-down', 20, 'muted-foreground', 'chevron'));
  s.description = 'Cabecera de sección del inventario (inventory-section.tsx): h2 sticky (bajo la cabecera de escritorio, md:top-14) con bg-background/95 y backdrop-blur, text-base font-semibold. Emoji de la ubicación (🧊 Nevera, ❄️ Congelador, 🧺 Despensa, 📦 Otros; «Mis habituales» lleva una estrella chart-3), título, recuento en muted y, si hay urgencias, badges /12 de caducados (TriangleAlert) y por caducar (Clock). Pliega la sección (ChevronDown, rotate-180 abierta). El borde inferior solo se ve cuando está pegada arriba.';
  return { id: s.id, unbound: unboundPaints(s).length };
}

if (ARGS.part === 'dia') {
  const badge = await setOf('05 · Contenido', 'Badge');
  // Hueco con plato
  const add = stager(page, 'staging · Plato');
  for (const st of ['pendiente', 'marcar', 'cocinado', 'no-se-hizo']) {
    const c = comp('estado=' + st); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.resize(160, 44); c.counterAxisSizingMode = 'AUTO'; bind(c, 'minHeight', 'spacing/11'); rad(c, 'radius/lg'); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; c.strokesIncludedInLayout = true; c.itemSpacing = 0; add(c);
    const nb = stack('nombre', c, 6, 'HORIZONTAL'); nb.layoutSizingHorizontal = 'FILL'; nb.counterAxisAlignItems = 'MIN'; bind(nb, 'minHeight', 'spacing/11'); padX(nb, 'spacing/2'); padY(nb, 'spacing/2');
    await text('Lentejas con verduras', 'Body/Small', st === 'cocinado' || st === 'no-se-hizo' ? 'muted-foreground' : 'foreground', nb, { fill: true, name: 'name' });
    if (st === 'marcar') { const z = stack('marcar', c, 0, 'HORIZONTAL'); z.layoutSizingHorizontal = 'FIXED'; z.resize(44, 44); z.layoutSizingVertical = 'FILL'; z.primaryAxisAlignItems = 'CENTER'; z.counterAxisAlignItems = 'CENTER'; z.strokes = [solid('border')]; z.strokeLeftWeight = 1; z.strokeTopWeight = 0; z.strokeRightWeight = 0; z.strokeBottomWeight = 0; z.appendChild(icon('circle-check', 20, 'muted-foreground', 'icon')); }
    if (st === 'cocinado' || st === 'no-se-hizo') { const z = stack('resuelto', c, 0, 'HORIZONTAL'); z.layoutSizingHorizontal = 'FIXED'; z.resize(28, 44); z.layoutSizingVertical = 'FILL'; z.primaryAxisAlignItems = 'CENTER'; z.counterAxisAlignItems = 'CENTER'; z.appendChild(icon(st === 'cocinado' ? 'check' : 'calendar-off', 16, st === 'cocinado' ? 'success' : 'muted-foreground', 'icon')); }
  }
  const r = await combine(page, 'staging · Plato', 'Plato del menú', { estado: ['pendiente', 'marcar', 'cocinado', 'no-se-hizo'] }, 'estado', [], 'Plato de un hueco del menú (menu-view.tsx): caja rounded-lg border, nombre en text-sm (2 líneas) que abre el plato. Hoy o antes y sin resolver, zona de marcado rápido (CircleCheck de 20 px, 44 px) a la derecha desde 9 rem de ancho y debajo si es más estrecho (container query). Resuelto: Check en success (cocinado) o CalendarOff (no se hizo) y el nombre atenuado, no tachado. El par recipe_id + cooked_at de este plato es la única prueba de lo cocinado (check:guardas).');
  const kn = r.cs.addComponentProperty('name', 'TEXT', 'Lentejas con verduras');
  for (const c of r.cs.children) c.findOne((n) => n.name === 'name').componentPropertyReferences = { characters: kn };
  const plato = r.cs;
  // Tarjeta de día
  const d = single('Día del menú');
  d.layoutMode = 'VERTICAL'; d.primaryAxisSizingMode = 'AUTO'; d.counterAxisSizingMode = 'FIXED'; d.resize(358, 10); d.primaryAxisSizingMode = 'AUTO'; d.itemSpacing = 8; padX(d, 'spacing/3'); padY(d, 'spacing/3'); rad(d, 'radius/xl'); setPaints(d, 'strokes', [['primary']]); d.strokeWeight = 1; d.strokeAlign = 'INSIDE';
  const hd = stack('cabecera', d, 8, 'HORIZONTAL'); hd.counterAxisAlignItems = 'CENTER';
  await text('Lunes 28', 'Body/Small Medium', 'foreground', hd, { name: 'day' }).then((t) => { t.fontName = { family: 'Geist', style: 'SemiBold' }; });
  const hoy = variant(badge, 'variant=default').createInstance(); hd.appendChild(hoy); hoy.setProperties({ [P(badge, 'label')]: 'Hoy' }); hoy.name = 'hoy';
  const slots = stack('huecos', d, 8, 'HORIZONTAL'); slots.counterAxisAlignItems = 'MIN';
  for (const [lab, dish, st] of [['Comida', 'Lentejas con verduras', 'marcar'], ['Cena', 'Tortilla de patatas', 'pendiente']]) {
    const col = stack(lab, slots, 6); col.layoutSizingHorizontal = 'FILL';
    await text(lab, 'Caption/Medium', 'muted-foreground', col, { fill: true });
    const i = variant(plato, 'estado=' + st).createInstance(); col.appendChild(i); i.layoutSizingHorizontal = 'FILL'; i.setProperties({ [kn]: dish });
    const empty = stack('añadir', col, 0, 'HORIZONTAL'); empty.primaryAxisAlignItems = 'CENTER'; empty.counterAxisAlignItems = 'CENTER'; bind(empty, 'minHeight', 'spacing/11'); rad(empty, 'radius/lg'); setPaints(empty, 'strokes', [['border']]); empty.strokeWeight = 1; empty.dashPattern = [4, 4]; empty.appendChild(icon('plus', 16, 'muted-foreground', 'icon'));
  }
  d.description = 'Tarjeta de día del menú: rounded-xl border p-3; hoy lleva border-primary y el Badge «Hoy». Día en text-sm font-semibold capitalizado («Lunes 28»). Huecos en columnas (Comida y Cena; con desayuno, 3) con su etiqueta en text-xs font-medium muted-foreground, los platos y debajo el botón de añadir (borde discontinuo, Plus). La semana: tarjetas apiladas en móvil y md, 2 columnas en lg, 3 en xl y 7 en 2xl. Tras generar, las tarjetas entran escalonadas (60 ms por día).';
  return { plato: plato.id, dia: d.id, fixedIcons: await fixIconColors(page), unbound: unboundPaints(d).length + unboundPaints(plato).length };
}

if (ARGS.part === 'seleccion') {
  const add = stager(page, 'staging · Selección');
  for (const sel of ['false', 'true']) {
    const on = sel === 'true';
    const c = comp('selected=' + sel); bind(c, 'minHeight', 'spacing/11'); padX(c, 'spacing/3'); padY(c, 'spacing/2'); bind(c, 'itemSpacing', 'spacing/1_5'); rad(c, 'radius/lg');
    setPaints(c, 'fills', [[on ? 'primary' : 'background']]); border(c, on ? 'primary' : 'border', 1); add(c);
    if (on) c.appendChild(icon('check', 16, 'primary-foreground', 'icon'));
    await text('Plátanos', 'Body/Small Medium', on ? 'primary-foreground' : 'foreground', c, { name: 'label' });
  }
  const { cs } = await combine(page, 'staging · Selección', 'Chip de selección', { selected: ['false', 'true'] }, 'selected', [], 'Chip conmutable del alta rápida «¿Qué tienes ya en casa?» (inventory/components/starter-picker.tsx): un <button aria-pressed>, min-h-11, rounded-lg (no full: no es un filtro), border px-3 py-2, text-sm font-medium. Sin marcar: border-border bg-background (hover:bg-muted). Marcado: border-primary bg-primary text-primary-foreground y un Check de 16 px delante. Multiselección; lo marcado se crea de golpe en el inventario con «Añadir N productos».');
  const kl = cs.addComponentProperty('label', 'TEXT', 'Plátanos');
  for (const c of cs.children) c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kl };
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'fila-ajustes') {
  const add = stager(page, 'staging · Fila de ajustes');
  for (const tipo of ['enlace', 'accion', 'accion-destructiva']) {
    const bad = tipo === 'accion-destructiva';
    const c = comp('tipo=' + tipo); c.primaryAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.resize(358, 56); bind(c, 'minHeight', 'spacing/14'); padX(c, 'spacing/4'); padY(c, 'spacing/3'); bind(c, 'itemSpacing', 'spacing/3'); rad(c, 'radius/xl'); add(c);
    c.appendChild(icon(bad ? 'trash' : 'settings', 20, bad ? 'destructive' : 'muted-foreground', 'icon'));
    const tx = stack('textos', c, 0); tx.layoutSizingHorizontal = 'FILL';
    await text(bad ? 'Borrar cuenta' : 'Ajustes del hogar', 'Body/Small Medium', bad ? 'destructive' : 'foreground', tx, { fill: true, name: 'label' });
    const h = await text('Nombre, miembros e invitación', 'Caption/Default', 'muted-foreground', tx, { fill: true, name: 'hint' });
    if (tipo === 'enlace') c.appendChild(icon('chevron-right', 16, 'muted-foreground', 'chevron'));
  }
  const { cs } = await combine(page, 'staging · Fila de ajustes', 'Fila de ajustes', { tipo: ['enlace', 'accion', 'accion-destructiva'] }, 'tipo', [], 'Fila de Ajustes (settings/components/settings-list.tsx): min-h-14, px-4 py-3, gap-3, text-sm font-medium. Icono de 20 px en muted-foreground, etiqueta y, si hace falta, una segunda línea (hint) en text-xs muted-foreground; a la derecha el valor actual o, si navega, ChevronRight de 16 px. Sin fondo propio: vive dentro de SettingsGroup (rounded-xl bg-card ring-1 ring-foreground/10, divide-y) y solo la primera y la última redondean sus esquinas (first:/last:rounded-xl); aquí va redondeada entera, como sola. Hover: bg-muted. Destructiva (Borrar cuenta, Salir del hogar): icono y etiqueta en destructive; la confirmación fuerte vive en el modal, no en la fila. SettingsLinkRow = enlace, SettingsButtonRow = acción; SettingsControlRow (un Switch a la derecha) no está aquí.');
  const K = { l: cs.addComponentProperty('label', 'TEXT', 'Ajustes del hogar'), h: cs.addComponentProperty('hint', 'BOOLEAN', true), ht: cs.addComponentProperty('hint text', 'TEXT', 'Nombre, miembros e invitación'), i: cs.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('settings').id) };
  for (const c of cs.children) { c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: K.l }; c.findOne((n) => n.name === 'hint').componentPropertyReferences = { characters: K.ht, visible: K.h }; c.findOne((n) => n.name === 'icon').componentPropertyReferences = { mainComponent: K.i }; }
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'selector-producto') {
  const add = stager(page, 'staging · Selector de producto');
  for (const st of ['nuevo', 'asociado']) {
    const on = st === 'asociado';
    // El trigger es un Button outline (mismos tokens) con font-normal y justify-between
    const c = comp('estado=' + st); c.primaryAxisSizingMode = 'FIXED'; c.resize(320, 44); c.primaryAxisAlignItems = 'SPACE_BETWEEN'; bind(c, 'height', 'spacing/11'); padX(c, 'spacing/4'); rad(c, 'radius/lg');
    setPaints(c, 'fills', [['component/button/outline-bg']]); border(c, 'component/button/outline-border', 1); add(c);
    const v = stack('valor', c, 8, 'HORIZONTAL'); v.layoutSizingHorizontal = 'HUG'; v.counterAxisAlignItems = 'CENTER';
    if (on) await text('🧺', 'Body/Small', 'foreground', v, { name: 'ubicacion' }); else v.appendChild(icon('plus', 16, 'muted-foreground', 'icon'));
    await text(on ? 'Plátanos' : 'Producto nuevo', 'Body/Small', on ? 'foreground' : 'muted-foreground', v, { name: 'label' });
    const ch = icon('chevrons-up-down', 16, on ? 'foreground' : 'muted-foreground', 'chevron'); ch.opacity = 0.5; c.appendChild(ch); // opacity-50 sobre currentColor
  }
  const { cs } = await combine(page, 'staging · Selector de producto', 'Selector de producto', { estado: ['nuevo', 'asociado'] }, 'estado', [], 'Trigger de ProductCombobox (src/components/product-combobox.tsx): un Button outline a todo el ancho con font-normal y justify-between, role="combobox". Sin producto y con allowCreateNew: Plus y «Producto nuevo» en muted-foreground (la línea se creará como producto nuevo al confirmar). Asociado: el emoji de su ubicación por defecto (🧺 Despensa, 🧊 Nevera, ❄️ Congelador, 📦 Otros) y el nombre en foreground. ChevronsUpDown al 50 %. Abre un Popover con Command: buscador, productos con su recuento de compras y, al final, «Producto nuevo».');
  const kl = cs.addComponentProperty('label', 'TEXT', 'Producto nuevo');
  for (const c of cs.children) c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kl };
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'linea-ticket') {
  const cb = await setOf('02 · Formularios', 'Checkbox'), input = await setOf('02 · Formularios', 'Input'), badge = await setOf('05 · Contenido', 'Badge'), btn = await setOf('01 · Acciones', 'Button'), sel = await setOf('◆ PATRONES', 'Selector de producto');
  const add = stager(page, 'staging · Línea del ticket');
  const chip = async (parent, label, active) => { const k = stack(label, parent, 0, 'HORIZONTAL'); k.layoutSizingHorizontal = 'HUG'; k.counterAxisAlignItems = 'CENTER'; bind(k, 'minHeight', 'spacing/8'); padX(k, 'spacing/3'); rad(k, 'radius/full'); setPaints(k, 'fills', [[active ? 'primary' : 'background']]); border(k, active ? 'primary' : 'border', 1); await text(label, 'Caption/Medium', active ? 'primary-foreground' : 'muted-foreground', k, { name: 'label' }); return k; };
  for (const estado of ['elegir', 'duplicado', 'asociada']) for (const peso of ['false', 'true']) {
    const linked = estado === 'asociada', weighed = peso === 'true';
    const c = comp(`estado=${estado}, al-peso=${peso}`, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(358, 10); c.primaryAxisSizingMode = 'AUTO';
    bind(c, 'itemSpacing', 'spacing/2'); padX(c, 'spacing/3'); padY(c, 'spacing/3'); rad(c, 'radius/xl'); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; add(c);
    const top = stack('fila', c, 8, 'HORIZONTAL'); top.counterAxisAlignItems = 'MIN';
    const cw = stack('incluir', top, 0, 'HORIZONTAL'); cw.layoutSizingHorizontal = 'HUG'; bind(cw, 'paddingTop', 'spacing/1'); // mt-1
    const box = variant(cb, 'state=default, checked=true').createInstance(); cw.appendChild(box); box.rescale(20 / 16); // size-5
    const mid = stack('texto', top, 4); mid.layoutSizingHorizontal = 'FILL';
    const nameIn = variant(input, 'state=default, filled=true').createInstance(); mid.appendChild(nameIn); nameIn.layoutSizingHorizontal = 'FILL'; nameIn.name = 'nombre';
    nameIn.setProperties({ [P(input, 'value')]: weighed ? 'Plátano de Canarias' : linked ? 'Huevos' : estado === 'duplicado' ? 'Leche entera Hacendado' : 'Tomate triturado' });
    await text(weighed ? 'PLATANO CANARIAS · 2,23 €' : linked ? 'HUEVOS L 12U · 2,35 €' : estado === 'duplicado' ? 'LECHE ENT. HACEND. 1L · 0,89 €' : 'TOMATE TRITURADO 800G · 0,95 €', 'Caption/Default', 'muted-foreground', mid, { fill: true, name: 'raw' });
    const q = variant(input, 'state=default, filled=true').createInstance(); top.appendChild(q); q.layoutSizingHorizontal = 'FIXED'; q.resize(64, q.height); q.name = 'cantidad'; q.setProperties({ [P(input, 'value')]: weighed ? '1,12' : '1' }); // w-16
    const sec = stack('catalogo', c, 6);
    const hd = stack('cabecera', sec, 8, 'HORIZONTAL'); hd.primaryAxisAlignItems = 'SPACE_BETWEEN'; hd.counterAxisAlignItems = 'CENTER';
    await text('Producto del catálogo', 'Caption/Medium', 'muted-foreground', hd);
    const b = variant(badge, 'variant=default').createInstance(); hd.appendChild(b); b.name = 'estado';
    const tone = linked ? 'success' : 'warning';
    const pr = { [P(badge, 'label')]: linked ? 'Asociado automáticamente' : 'Elegir producto' }; if (linked) { pr[P(badge, 'icon inline-start#')] = true; pr[P(badge, 'icon inline-start ↳')] = iconComp('check').id; }
    b.setProperties(pr); setPaints(b, 'fills', [[tone, 0.15]]); textFill(b, tone); if (linked) recolor(b.findAll((x) => x.type === 'INSTANCE')[0], tone);
    const s = variant(sel, 'estado=' + (linked ? 'asociado' : 'nuevo')).createInstance(); sec.appendChild(s); s.layoutSizingHorizontal = 'FILL'; s.name = 'producto';
    if (linked) s.setProperties({ [P(sel, 'label')]: weighed ? 'Plátanos' : 'Huevos' });
    if (estado === 'duplicado') {
      const w = stack('posible-duplicado', sec, 8, 'HORIZONTAL'); w.counterAxisAlignItems = 'CENTER'; padX(w, 'spacing/2'); padY(w, 'spacing/2'); rad(w, 'radius/lg'); setPaints(w, 'fills', [['warning', 0.1]]);
      await text(weighed ? 'Ya tienes «Plátanos», ¿es el mismo producto?' : 'Ya tienes «Leche», ¿es el mismo producto?', 'Caption/Default', 'warning', w, { fill: true, name: 'hint' });
      const a = variant(btn, 'variant=outline, size=sm, state=default').createInstance(); w.appendChild(a); a.setProperties({ [P(btn, 'label')]: 'Asociar', [P(btn, 'icon inline-start#')]: true, [P(btn, 'icon inline-start ↳')]: iconComp('link-2').id });
    }
    if (weighed) {
      const r = stack('al-inventario', sec, 6, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; r.layoutWrap = 'WRAP'; r.counterAxisSpacing = 6;
      await text('Al inventario:', 'Caption/Default', 'muted-foreground', r);
      // Sin producto manda el ticket (kg); asociado a un producto que se cuenta por ud, pasa a ud solo
      await chip(r, '1,12 kg', !linked); await chip(r, '1 ud', linked);
    }
  }
  const { cs } = await combine(page, 'staging · Línea del ticket', 'Línea del ticket', { estado: ['elegir', 'duplicado', 'asociada'], 'al-peso': ['false', 'true'] }, 'estado', ['al-peso'], 'Línea de la revisión del ticket (receipts/components/receipt-review.tsx, renderRow): rounded-xl border p-3. Arriba, Checkbox de 20 px («Incluir este producto»), el nombre editable (Input) con el texto impreso y el importe debajo en text-xs muted, y la cantidad (Input w-16). Debajo, «Producto del catálogo» con su Badge (/15, border-transparent: warning «Elegir producto» sin asociar; success «Asociado automáticamente» si casó por nombre aprendido o por nombre exacto del catálogo, «Asociado» si lo eligió el usuario) y el selector de producto. NUNCA se asocia sola por parecido: el parecido solo se OFRECE, en la caja bg-warning/10 «Ya tienes «X», ¿es el mismo producto?» con «Asociar». Al peso (kg, l…): «Al inventario:» con dos chips aria-pressed (min-h-8, rounded-full, text-xs) para entrar como el peso del ticket o como 1 ud; si el producto asociado se cuenta por unidades, pasa a ud solo. Otros avisos de la misma caja que no están aquí: el pack («2 × pack de 6 → entran 12 ud»), el nombre renombrado en la misma cadena y «ya entró al finalizar la compra».');
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'celebracion') {
  const s = single('Celebración del ticket');
  s.layoutMode = 'VERTICAL'; s.primaryAxisSizingMode = 'AUTO'; s.counterAxisSizingMode = 'FIXED'; s.resize(390, 10); s.primaryAxisSizingMode = 'AUTO'; s.itemSpacing = 0; padX(s, 'spacing/4');
  const h = stack('cabecera', s, 2); h.counterAxisAlignItems = 'CENTER'; padY(h, 'spacing/4');
  const ic = stack('icono', h, 0, 'HORIZONTAL'); ic.layoutSizingHorizontal = 'FIXED'; ic.resize(48, 48); ic.layoutSizingVertical = 'FIXED'; ic.primaryAxisAlignItems = 'CENTER'; ic.counterAxisAlignItems = 'CENTER'; rad(ic, 'radius/full'); setPaints(ic, 'fills', [['accent']]); ic.appendChild(icon('piggy-bank', 24, 'accent-foreground', 'icon'));
  const gap = figma.createFrame(); gap.name = 'mb-1'; gap.fills = []; gap.resize(1, 4); h.appendChild(gap);
  const t = await text('A la hucha: 1,35 €', 'Body/Base Medium', 'foreground', h, { fill: true, name: 'title' }); t.textAlignHorizontal = 'CENTER';
  const d = await text('Lo que esta compra le ha ahorrado al hogar.', 'Body/Small', 'muted-foreground', h, { fill: true, name: 'description' }); d.textAlignHorizontal = 'CENTER';
  const body = stack('desglose', s, 12);
  const li = stack('Descuentos del ticket', body, 12, 'HORIZONTAL'); li.primaryAxisAlignItems = 'SPACE_BETWEEN'; li.counterAxisAlignItems = 'CENTER';
  const l = stack('concepto', li, 6, 'HORIZONTAL'); l.layoutSizingHorizontal = 'HUG'; l.counterAxisAlignItems = 'CENTER'; l.appendChild(icon('tag', 16, 'muted-foreground', 'icon')); await text('Descuentos del ticket', 'Body/Small', 'muted-foreground', l);
  await text('+1,35 €', 'Body/Small Medium', 'foreground', li, { name: 'importe' });
  s.description = 'Cuerpo de SavingsCelebration (receipts/components/savings-celebration.tsx) para ir en el hueco de ResponsiveModal, con la cabecera propia porque lleva el icono ENCIMA del título: círculo de 48 px bg-accent con PiggyBank (o ListChecks si la noticia es la compra perfecta) y zoom-in-75 al abrir, título «A la hucha: X» o «Compra perfecta» y el desglose SIEMPRE visible: «Mejor precio que de costumbre» (TrendingDown) o «Precio algo por encima de lo habitual» (TrendingUp), «Descuentos del ticket» (Tag), «Donde más has ganado», el recuento de la lista en success y los extras en tono neutro. Este es el caso de un PRIMER ticket: sin historial no hay precio con qué comparar, así que solo puede salir por los descuentos impresos en el ticket. Solo se abre si hay algo bueno que contar (ahorro > 0 o compra perfecta); si no, se navega sin modal. Pie: un único «Continuar».';
  return { id: s.id, unbound: unboundPaints(s).length };
}

// Copia los tokens de una variante de Button (fondo, borde y radio) a un frame
// que el código monta como Button con clases propias (EntryActionTile, chips…)
async function likeButton(node, variantName) {
  const bs = await setOf('01 · Acciones', 'Button'); const v = variant(bs, variantName);
  node.fills = v.fills; node.strokes = v.strokes; node.strokeWeight = v.strokeWeight; node.strokeAlign = v.strokeAlign; node.strokesIncludedInLayout = true; rad(node, 'radius/lg');
  const lab = v.findOne((n) => n.type === 'TEXT'); return lab.fills[0].boundVariables.color.id;
}
const varName = async (id) => (await figma.variables.getVariableByIdAsync(id)).name;

if (ARGS.part === 'tarjeta-repaso') {
  const btn = await setOf('01 · Acciones', 'Button'), ib = await setOf('01 · Acciones', 'Button · Icon');
  const add = stager(page, 'staging · Tarjeta de repaso');
  const T = { despensa: ['package-search', '¿Repasamos la despensa?', '8 productos que llevan tiempo sin mirarse. Un toque cada uno.'], platos: ['chef-hat', '¿Qué tal estos días?', 'Tenías 3 platos planificados.'] };
  for (const [k, [ic, title, desc]] of Object.entries(T)) {
    const c = comp('tipo=' + k); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.resize(358, 80); bind(c, 'itemSpacing', 'spacing/3'); padX(c, 'spacing/3'); padY(c, 'spacing/3'); rad(c, 'radius/xl'); setPaints(c, 'fills', [['card']]); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; add(c);
    const b = stack('icono', c, 0, 'HORIZONTAL'); b.layoutSizingHorizontal = 'FIXED'; b.resize(36, 36); b.layoutSizingVertical = 'FIXED'; b.primaryAxisAlignItems = 'CENTER'; b.counterAxisAlignItems = 'CENTER'; rad(b, 'radius/lg'); setPaints(b, 'fills', [['accent']]); b.appendChild(icon(ic, 20, 'accent-foreground', 'icon'));
    const col = stack('texto', c, 8); col.layoutSizingHorizontal = 'FILL'; col.counterAxisAlignItems = 'MIN';
    const tx = stack('titulos', col, 2); await text(title, 'Body/Small Medium', 'foreground', tx, { fill: true, name: 'title' }); await text(desc, 'Caption/Default', 'muted-foreground', tx, { fill: true, name: 'description' });
    const r = variant(btn, 'variant=default, size=sm, state=default').createInstance(); col.appendChild(r); r.setProperties({ [P(btn, 'label')]: 'Repasar' }); r.name = 'Repasar';
    const x = variant(ib, 'variant=ghost, size=icon, state=default').createInstance(); c.appendChild(x); x.setProperties({ [P(ib, 'icon')]: iconComp('x').id }); recolor(x.findAll((q) => q.type === 'INSTANCE')[0], 'muted-foreground'); x.name = 'Recordármelo mañana';
    c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'AUTO';
  }
  const { cs } = await combine(page, 'staging · Tarjeta de repaso', 'Tarjeta de repaso', { tipo: ['despensa', 'platos'] }, 'tipo', [], 'Tarjeta del shell que abre un repaso semanal (inventory/components/pantry-review-card.tsx y menus/components/cooked-checkin-card.tsx, la misma pieza dos veces): rounded-xl border bg-card p-3 gap-3, mb-4 encima del <h1> de CUALQUIER página de la app (el repaso de platos no sale en /menus, que tiene su propia puerta). Icono de 20 px en un cuadro de 36 bg-accent (PackageSearch o ChefHat), título en text-sm font-medium, una línea de coste en text-xs muted («8 productos… Un toque cada uno»; en platos «¿Qué tal ayer?» si todo es de ayer, y el nombre del plato si solo hay uno), «Repasar» y la X ghost que aparta la pregunta HASTA MAÑANA (cookie por dispositivo, no niega nada). Nunca salen las dos a la vez: cede la de despensa, y solo hasta YIELD_MAX_DAYS. OJO: «Repasar» va en size="sm" (h-9, 36 px), por debajo de los 44 px táctiles que pide el sistema.');
  const K = { t: cs.addComponentProperty('title', 'TEXT', '¿Repasamos la despensa?'), d: cs.addComponentProperty('description', 'TEXT', '8 productos que llevan tiempo sin mirarse. Un toque cada uno.') };
  for (const c of cs.children) { c.findOne((n) => n.name === 'title').componentPropertyReferences = { characters: K.t }; c.findOne((n) => n.name === 'description').componentPropertyReferences = { characters: K.d }; }
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'pregunta-despensa') {
  const btn = await setOf('01 · Acciones', 'Button');
  const add = stager(page, 'staging · Pregunta de despensa');
  for (const st of ['pendiente', 'contestada']) {
    const done = st === 'contestada';
    const c = comp('estado=' + st, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(358, 10); c.primaryAxisSizingMode = 'AUTO'; bind(c, 'itemSpacing', 'spacing/2'); padX(c, 'spacing/3'); padY(c, 'spacing/3'); rad(c, 'radius/xl'); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; add(c);
    const top = stack('producto', c, 8, 'HORIZONTAL'); top.counterAxisAlignItems = 'CENTER';
    const pi = product('yogur', 20); top.appendChild(pi); if (done) pi.opacity = 0.5;
    await text('Yogures', 'Body/Small Medium', 'foreground', top, { fill: true, name: 'name' });
    await text('4 ud', 'Caption/Default', 'muted-foreground', top, { name: 'qty' });
    if (done) { const r = stack('respuesta', c, 6, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; r.appendChild(icon('check', 16, 'success', 'icon')); await text('Te queda poco', 'Caption/Default', 'muted-foreground', r, { name: 'recap' }); }
    else { const g = stack('respuestas (grid-cols-3)', c, 8, 'HORIZONTAL'); for (const l of ['Queda', 'Poco', 'Se acabó']) { const b = variant(btn, 'variant=outline, size=default, state=default').createInstance(); g.appendChild(b); b.setProperties({ [P(btn, 'label')]: l }); b.layoutSizingHorizontal = 'FILL'; } }
  }
  const { cs } = await combine(page, 'staging · Pregunta de despensa', 'Pregunta de despensa', { estado: ['pendiente', 'contestada'] }, 'estado', [], 'Una pregunta del repaso de despensa (inventory/components/pantry-review-modal.tsx): rounded-xl border p-3. Icono de producto de 20 px, nombre en text-sm font-medium y la cantidad que la app cree que hay, en text-xs muted. Tres respuestas outline a partes iguales (grid-cols-3): «Queda», «Poco», «Se acabó», con aria-label «Yogures: poco» para que un lector de pantalla no anuncie ocho veces los mismos tres botones. Cada respuesta se guarda en el momento (quien lo deja a la cuarta no pierde las tres anteriores) y la fila pasa a contestada: icono al 50 % y Check success con el resumen («Queda», «Te queda poco», «Se ha agotado»). Las filas van agrupadas por ubicación (Nevera, Congelador, Despensa, Otros): un paseo por la casa, no un formulario.');
  const K = { n: cs.addComponentProperty('name', 'TEXT', 'Yogures'), q: cs.addComponentProperty('qty', 'TEXT', '4 ud'), i: cs.addComponentProperty('producto', 'INSTANCE_SWAP', iconsPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'product/yogur').id) };
  for (const c of cs.children) { c.findOne((n) => n.name === 'name').componentPropertyReferences = { characters: K.n }; c.findOne((n) => n.name === 'qty').componentPropertyReferences = { characters: K.q }; c.findOne((n) => n.name === 'product-icon').componentPropertyReferences = { mainComponent: K.i }; }
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).filter((x) => !x.startsWith('product')).length };
}

if (ARGS.part === 'pregunta-plato') {
  const btn = await setOf('01 · Acciones', 'Button'), input = await setOf('02 · Formularios', 'Input');
  const add = stager(page, 'staging · Pregunta de plato');
  const B = (v, size, label, ic) => { const b = variant(btn, `variant=${v}, size=${size}, state=default`).createInstance(); const pr = { [P(btn, 'label')]: label }; if (ic) { pr[P(btn, 'icon inline-start#')] = true; pr[P(btn, 'icon inline-start ↳')] = iconComp(ic).id; } b.setProperties(pr); return b; };
  for (const st of ['pendiente', 'no-abierto', 'descontar', 'por-que']) {
    const c = comp('estado=' + st, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(358, 10); c.primaryAxisSizingMode = 'AUTO'; bind(c, 'itemSpacing', 'spacing/2'); padX(c, 'spacing/3'); padY(c, 'spacing/3'); rad(c, 'radius/xl'); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; add(c);
    const hd = stack('plato', c, 2); await text('Cena', 'Caption/Default', 'muted-foreground', hd, { fill: true, name: 'slot' }); await text('Crema de calabacín', 'Body/Base Medium', 'foreground', hd, { fill: true, name: 'name' });
    if (st === 'pendiente' || st === 'no-abierto') {
      const r = stack('respuestas', c, 8, 'HORIZONTAL');
      const y = B('default', 'default', 'Lo cocinamos', 'chef-hat'); r.appendChild(y); y.layoutSizingHorizontal = 'FILL';
      const n = B('outline', 'default', 'No'); r.appendChild(n); n.layoutSizingHorizontal = 'FILL';
      if (st === 'no-abierto') {
        const g = stack('salidas del no (grid-cols-3)', c, 8, 'HORIZONTAL');
        for (const [ic, l, bad] of [['calendar-off', 'No se hizo'], ['move-right', 'Mover a…'], ['trash', 'Quitar del menú', true]]) {
          const t = stack(l, g, 4); t.layoutSizingHorizontal = 'FILL'; t.counterAxisAlignItems = 'CENTER'; t.primaryAxisAlignItems = 'CENTER'; bind(t, 'minHeight', 'spacing/16'); padX(t, 'spacing/1'); padY(t, 'spacing/2');
          const fg = await varName(await likeButton(t, `variant=${bad ? 'destructive' : 'outline'}, size=default, state=default`));
          t.appendChild(icon(ic, 16, fg, 'icon'));
          const lt = await text(l, 'Caption/Medium', fg, t, { fill: true }); lt.textAlignHorizontal = 'CENTER'; bind(lt, 'fontSize', 'font-size/arbitrary-0_7rem');
        }
      }
    } else if (st === 'descontar') {
      await text('Ajusta lo que has gastado. Se descuenta del lote que caduca antes.', 'Caption/Default', 'muted-foreground', c, { fill: true });
      const ul = stack('descontables', c, 8);
      for (const [n, have, q, u] of [['Calabacines', 'Tienes 3 ud', '2', 'ud'], ['Cebollas', 'Tienes 1 kg', '0,15', 'kg'], ['Nata para cocinar', 'Tienes 200 ml', '100', 'ml']]) {
        const li = stack(n, ul, 12, 'HORIZONTAL'); li.primaryAxisAlignItems = 'SPACE_BETWEEN'; li.counterAxisAlignItems = 'CENTER'; padX(li, 'spacing/3'); padY(li, 'spacing/3'); rad(li, 'radius/xl'); setPaints(li, 'strokes', [['border']]); li.strokeWeight = 1; li.strokeAlign = 'INSIDE';
        const tx = stack('texto', li, 0); tx.layoutSizingHorizontal = 'FILL'; await text(n, 'Body/Small Medium', 'foreground', tx, { fill: true }); await text(have, 'Caption/Default', 'muted-foreground', tx, { fill: true });
        const qb = stack('cantidad', li, 6, 'HORIZONTAL'); qb.layoutSizingHorizontal = 'HUG'; qb.counterAxisAlignItems = 'CENTER';
        const i = variant(input, 'state=default, filled=true').createInstance(); qb.appendChild(i); i.layoutSizingHorizontal = 'FIXED'; i.resize(80, i.height); i.setProperties({ [P(input, 'value')]: q }); const it = i.findOne((x) => x.type === 'TEXT' && x.visible); it.textAlignHorizontal = 'RIGHT'; it.layoutSizingHorizontal = 'FILL'; // w-20 text-right
        const ut = await text(u, 'Body/Small', 'muted-foreground', qb); ut.textAutoResize = 'HEIGHT'; ut.resize(28, ut.height); // w-7
      }
      const inf = stack('no se descuenta', c, 6); await text('No se descuenta', 'Caption/Medium', 'muted-foreground', inf, { fill: true });
      const r = stack('Aceite de oliva', inf, 8, 'HORIZONTAL'); r.primaryAxisAlignItems = 'SPACE_BETWEEN'; r.counterAxisAlignItems = 'CENTER'; padX(r, 'spacing/2'); padY(r, 'spacing/2'); rad(r, 'radius/lg'); setPaints(r, 'strokes', [['border']]); r.strokeWeight = 1; r.strokeAlign = 'INSIDE'; r.dashPattern = [4, 4];
      await text('Aceite de oliva', 'Body/Small', 'foreground', r); await text('La receta no indica cantidad', 'Caption/Default', 'muted-foreground', r);
      const a = stack('acciones', c, 8); for (const b of [B('default', 'default', 'Descontar 3 ingredientes', 'check'), B('ghost', 'default', 'No descontar')]) { a.appendChild(b); b.layoutSizingHorizontal = 'FILL'; }
    } else {
      const fs = stack('¿Por qué no?', c, 6); await text('¿Por qué no?', 'Caption/Default', 'muted-foreground', fs, { fill: true, name: 'legend' });
      const w = stack('motivos', fs, 6, 'HORIZONTAL'); w.layoutWrap = 'WRAP'; w.counterAxisSpacing = 6;
      for (const l of ['Comimos fuera', 'Pedimos algo', 'No nos apetecía', 'Faltaban ingredientes']) w.appendChild(B('outline', 'default', l));
      const n = B('ghost', 'default', 'Ahora no'); c.appendChild(n); n.layoutSizingHorizontal = 'FILL';
    }
  }
  const { cs } = await combine(page, 'staging · Pregunta de plato', 'Pregunta de plato', { estado: ['pendiente', 'no-abierto', 'descontar', 'por-que'] }, 'estado', [], 'Un plato del repaso de platos (menus/components/cooked-checkin-modal.tsx): rounded-xl border p-3, el hueco en text-xs muted y el plato en font-medium. Pendiente: «Lo cocinamos» (ChefHat) y «No», a partes iguales. «No» despliega tres celdas (EntryActionTile: Button outline con min-h-16, flex-col, texto de 0,7rem): «No se hizo», «Mover a…» (una vista con el selector de día, de hoy en adelante) y «Quitar del menú» en destructive. Las dos respuestas largas NO retiran la fila, la convierten en su siguiente pregunta, para no perder de vista de qué plato se habla. «Lo cocinamos» con receta y stock → el descuento: lo propuesto por ingrediente en la unidad de la receta (Input w-20 a la derecha), lo que no se puede descontar aparte con su motivo, y «No descontar» (si algo se queda a cero, un paso más: «¿Lo apuntamos?»). «No se hizo» → «¿Por qué no?» con cuatro motivos (Comimos fuera, Pedimos algo, No nos apetecía, Faltaban ingredientes) y «Ahora no». Solo «No nos apetecía» tiene consecuencia: ese plato no se vuelve a proponer la semana siguiente (check:menu).');
  const K = { s: cs.addComponentProperty('slot', 'TEXT', 'Cena'), n: cs.addComponentProperty('name', 'TEXT', 'Crema de calabacín') };
  for (const c of cs.children) { c.findOne((n) => n.name === 'slot').componentPropertyReferences = { characters: K.s }; c.findOne((n) => n.name === 'name').componentPropertyReferences = { characters: K.n }; }
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'coste') {
  const add = stager(page, 'staging · Coste');
  for (const st of ['completo', 'parcial']) {
    const c = comp('estado=' + st); bind(c, 'itemSpacing', 'spacing/1'); padX(c, 'spacing/2'); padY(c, 'spacing/0_5'); rad(c, 'radius/lg'); setPaints(c, 'fills', [['chart-3', 0.1]]); add(c);
    c.appendChild(icon('coins', 14, 'price', 'icon'));
    await text(st === 'parcial' ? '≥ 2,10 €' : '≈ 3,45 €', 'Caption/Medium', 'price', c, { name: 'importe' });
    if (st === 'parcial') await text(' (5 de 8)', 'Caption/Default', 'muted-foreground', c, { name: 'cobertura' });
  }
  const { cs } = await combine(page, 'staging · Coste', 'Coste de receta', { estado: ['completo', 'parcial'] }, 'estado', [], 'CostBadge (recipes/components/cost-badge.tsx): inline-flex gap-1, rounded-lg, bg-chart-3/10, px-2 py-0.5, text-xs font-medium text-price, con Coins de 14 px. Es el coste de la receta ENTERA para sus raciones, no por ración: «≈ 3,45 €» si todos los ingredientes tienen precio; «≥ 2,10 €» y «(5 de 8)» en muted si falta alguno (es un suelo). No se pinta si ningún ingrediente tiene precio, que es lo normal en un hogar nuevo. aria-label «Coste estimado 3,45 €» / «Coste estimado desde 2,10 €, 5 de 8 ingredientes con precio». text-price y no text-chart-3: el acento cálido como texto no llega a AA sobre su propio tinte.');
  const k = cs.addComponentProperty('importe', 'TEXT', '≈ 3,45 €');
  for (const c of cs.children) c.findOne((n) => n.name === 'importe').componentPropertyReferences = { characters: k };
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'tarjeta-receta') {
  const badge = await setOf('05 · Contenido', 'Badge'), coste = await setOf('◆ PATRONES', 'Coste de receta');
  const add = stager(page, 'staging · Tarjeta de receta');
  for (const h of ['false', 'true']) {
    const c = comp('historial=' + h, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(358, 10); c.primaryAxisSizingMode = 'AUTO'; bind(c, 'itemSpacing', 'spacing/2'); padX(c, 'spacing/3'); padY(c, 'spacing/3'); rad(c, 'radius/xl'); setPaints(c, 'fills', [['card']]); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; add(c);
    const r1 = stack('fila 1', c, 8, 'HORIZONTAL'); r1.counterAxisAlignItems = 'MIN';
    await text('Tortilla de patatas', 'Body/Base Medium', 'foreground', r1, { fill: true, name: 'name' });
    await text('5 ingredientes', 'Caption/Default', 'muted-foreground', r1, { name: 'ingredientes' });
    const r2 = stack('etiquetas', c, 6, 'HORIZONTAL'); r2.layoutWrap = 'WRAP'; r2.counterAxisSpacing = 6; r2.counterAxisAlignItems = 'CENTER';
    for (const [v, l] of [['secondary', 'Comida'], ['secondary', 'Cena'], ['outline', '🗓️ Todo el año']]) { const b = variant(badge, 'variant=' + v).createInstance(); r2.appendChild(b); b.setProperties({ [P(badge, 'label')]: l }); }
    r2.appendChild(variant(coste, 'estado=completo').createInstance());
    if (h === 'true') { const r3 = stack('historial', c, 12, 'HORIZONTAL'); r3.layoutWrap = 'WRAP'; r3.counterAxisSpacing = 4; await text('★ 4,5 · 3 votos', 'Caption/Default', 'muted-foreground', r3, { name: 'votos' }); await text('Hecha 2 veces · última vez hace 5 días', 'Caption/Default', 'muted-foreground', r3, { name: 'veces' }); }
  }
  const { cs } = await combine(page, 'staging · Tarjeta de receta', 'Tarjeta de receta', { historial: ['false', 'true'] }, 'historial', [], 'Receta en /recetas (recipes/components/recipes-list.tsx): un Link rounded-xl border bg-card p-3 gap-2, hover:bg-muted. SIN imagen ni icono. Nombre en font-medium y «{n} ingredientes» a la derecha en text-xs muted; debajo un Badge secondary por tipo de comida (Desayuno, Comida, Cena), la temporada en outline con su emoji («🗓️ Todo el año», «❄️ Invierno», «☀️ Verano») y el coste si algún ingrediente tiene precio. Con valoraciones o veces cocinada, una tercera línea: «★ 4,5 · 3 votos» y «Hecha 2 veces · última vez hace 5 días» (hoy / ayer; sin fecha se calla la segunda mitad). Lista a una columna en móvil, 2 en md y 3 en lg.');
  const K = { n: cs.addComponentProperty('name', 'TEXT', 'Tortilla de patatas'), i: cs.addComponentProperty('ingredientes', 'TEXT', '5 ingredientes') };
  for (const c of cs.children) { c.findOne((n) => n.name === 'name').componentPropertyReferences = { characters: K.n }; c.findOne((n) => n.name === 'ingredientes').componentPropertyReferences = { characters: K.i }; for (const b of c.findAll((n) => n.type === 'INSTANCE' && n.parent.name === 'etiquetas')) b.isExposedInstance = true; }
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'receta-pack') {
  const badge = await setOf('05 · Contenido', 'Badge'), btn = await setOf('01 · Acciones', 'Button');
  const add = stager(page, 'staging · Receta del pack');
  for (const st of ['añadir', 'guardada']) {
    const c = comp('estado=' + st, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(334, 10); c.primaryAxisSizingMode = 'AUTO'; bind(c, 'itemSpacing', 'spacing/2'); padX(c, 'spacing/3'); padY(c, 'spacing/3'); rad(c, 'radius/xl'); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; add(c);
    await text('Lentejas estofadas', 'Body/Base Medium', 'foreground', c, { fill: true, name: 'name' });
    const d = await text('Guiso de cuchara con lentejas y verduras, de toda la vida.', 'Body/Small', 'muted-foreground', c, { fill: true, name: 'description' }); d.maxLines = 2; d.textTruncation = 'ENDING';
    const r = stack('etiquetas', c, 6, 'HORIZONTAL'); r.layoutWrap = 'WRAP'; r.counterAxisSpacing = 6;
    for (const [v, l] of [['outline', 'Invierno'], ['secondary', 'Vegano'], ['secondary', 'Sin gluten']]) { const b = variant(badge, 'variant=' + v).createInstance(); r.appendChild(b); b.setProperties({ [P(badge, 'label')]: l }); b.isExposedInstance = true; }
    const b = variant(btn, `variant=outline, size=default, state=${st === 'guardada' ? 'disabled' : 'default'}`).createInstance(); c.appendChild(b); b.layoutSizingHorizontal = 'FILL';
    b.setProperties({ [P(btn, 'label')]: st === 'guardada' ? 'Ya en tu recetario' : 'Añadir a mi recetario', [P(btn, 'icon inline-start#')]: true, [P(btn, 'icon inline-start ↳')]: iconComp(st === 'guardada' ? 'check' : 'plus').id });
  }
  const { cs } = await combine(page, 'staging · Receta del pack', 'Receta del pack', { estado: ['añadir', 'guardada'] }, 'estado', [], 'Receta de «Explorar recetas» (recipes/components/explore-recipes.tsx): li rounded-xl border p-3 gap-2, SIN bg-card (va dentro de la sección, que ya es la tarjeta). Nombre en font-medium, descripción en text-sm muted a dos líneas y las etiquetas: temporada en outline solo si no es «todo el año», dieta en secondary (Vegano o Vegetariano) y «Sin gluten». El tipo de comida NO sale aquí (sí en Mis recetas). Botón outline a todo el ancho, «Añadir a mi recetario» («Añadiendo…» mientras guarda) o, ya importada, deshabilitado con Check «Ya en tu recetario». Las 43 del pack vienen para 2 raciones y SIN pasos.');
  const K = { n: cs.addComponentProperty('name', 'TEXT', 'Lentejas estofadas'), d: cs.addComponentProperty('description', 'TEXT', 'Guiso de cuchara con lentejas y verduras, de toda la vida.') };
  for (const c of cs.children) { c.findOne((n) => n.name === 'name').componentPropertyReferences = { characters: K.n }; c.findOne((n) => n.name === 'description').componentPropertyReferences = { characters: K.d }; }
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'valoracion') {
  const add = stager(page, 'staging · Valoración');
  for (const v of ['sin', 'con']) {
    const c = comp('votos=' + v, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(358, 10); c.primaryAxisSizingMode = 'AUTO'; bind(c, 'itemSpacing', 'spacing/2'); padX(c, 'spacing/4'); padY(c, 'spacing/4'); rad(c, 'radius/xl'); setPaints(c, 'fills', [['card']]); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; add(c);
    await text('Tu valoración', 'Body/Small Medium', 'foreground', c, { fill: true });
    const r = stack('estrellas (radiogroup)', c, 2, 'HORIZONTAL'); r.layoutSizingHorizontal = 'HUG';
    for (let i = 1; i <= 5; i++) {
      const on = v === 'con' && i <= 4;
      const s = stack(i === 1 ? '1 estrella' : `${i} estrellas`, r, 0, 'HORIZONTAL'); s.layoutSizingHorizontal = 'FIXED'; s.resize(44, 44); s.layoutSizingVertical = 'FIXED'; s.primaryAxisAlignItems = 'CENTER'; s.counterAxisAlignItems = 'CENTER'; rad(s, 'radius/lg');
      const st = icon('star', 24, on ? 'chart-3' : 'muted-foreground', 'icon'); s.appendChild(st);
      if (on) for (const vec of st.findAll((n) => n.type === 'VECTOR')) vec.fills = [solidFor('chart-3', vec)]; // fill-chart-3
    }
    await text(v === 'con' ? '★ 4,0 · 1 voto' : 'Aún sin valoraciones', 'Body/Small', 'muted-foreground', c, { fill: true, name: 'resumen' });
  }
  const { cs } = await combine(page, 'staging · Valoración', 'Valoración', { votos: ['sin', 'con'] }, 'votos', [], 'RecipeRating (recipes/components/recipe-rating.tsx): rounded-xl border bg-card p-4 gap-2, «Tu valoración» y un radiogroup de cinco botones de 44 px (rounded-lg, hover:bg-muted) con Star de 24: llena = fill-chart-3 text-chart-3, vacía = text-muted-foreground; aria-label «1 estrella» / «N estrellas». Debajo, la media del hogar en text-sm muted: «★ 4,0 · 1 voto» o «Aún sin valoraciones». Sale en la ficha de la receta y al terminar el modo cocinado. Las estrellas usan chart-3 como ICONO (3:1 basta); el texto de la media va en muted.');
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'ingrediente-cocina') {
  const cb = await setOf('02 · Formularios', 'Checkbox');
  const add = stager(page, 'staging · Ingrediente al cocinar');
  for (const st of ['pendiente', 'marcado', 'falta']) {
    const done = st === 'marcado';
    const c = comp('estado=' + st); c.primaryAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.resize(358, 44); bind(c, 'minHeight', 'spacing/11'); bind(c, 'itemSpacing', 'spacing/3'); padX(c, 'spacing/1'); rad(c, 'radius/lg'); add(c);
    const box = variant(cb, `state=default, checked=${done}`).createInstance(); c.appendChild(box); box.rescale(20 / 16);
    const q = await text('160 g', 'Body/Small', 'muted-foreground', c, { name: 'cantidad' }); q.textAutoResize = 'HEIGHT'; q.resize(64, q.height); // min-w-16
    const n = await text('Lentejas', 'Body/Small', done ? 'muted-foreground' : 'foreground', c, { fill: true, name: 'name' });
    if (done) { q.textDecoration = 'STRIKETHROUGH'; n.textDecoration = 'STRIKETHROUGH'; }
    if (st === 'falta') { const t = stack('no lo tienes', c, 0, 'HORIZONTAL'); t.layoutSizingHorizontal = 'HUG'; padX(t, 'spacing/1_5'); padY(t, 'spacing/0_5'); rad(t, 'radius/md'); setPaints(t, 'fills', [['warning', 0.15]]); setPaints(t, 'strokes', [['warning', 0.4]]); t.strokeWeight = 1; t.strokeAlign = 'INSIDE'; await text('no lo tienes', 'Caption/Default', 'warning', t); }
  }
  const { cs } = await combine(page, 'staging · Ingrediente al cocinar', 'Ingrediente al cocinar', { estado: ['pendiente', 'marcado', 'falta'] }, 'estado', [], 'Fila del repaso de ingredientes con el que arranca el modo cocinado (recipes/components/cooking-mode.tsx, CookingPrep): un Label que envuelve la fila entera, min-h-11, gap-3, rounded-lg px-1. Checkbox de 20 px, cantidad en text-sm tabular-nums muted (min-w-16) y el nombre. Marcar es el ritual del USUARIO («ya lo he sacado»): tacha la cantidad y apaga el nombre. «no lo tienes» es de la APP (computeMissingForRecipes, la misma cuenta que «añadir a la lista lo que falte»): rounded-md, border-warning/40 bg-warning/15, text-xs warning, y solo sale en lo que falta de verdad, nunca en lo que está sin marcar. OJO: aquí la cantidad se escribe en crudo («0.5 kg», con punto) y en los pasos con formatQuantity («0,5 kg»).');
  const K = { q: cs.addComponentProperty('cantidad', 'TEXT', '160 g'), n: cs.addComponentProperty('name', 'TEXT', 'Lentejas') };
  // MEDIDO (2026-09-30): los textos enlazados a una MISMA propiedad comparten el estilo
  // entre variantes: tachar el de «marcado» los tachaba en las tres. Por eso «marcado»
  // no se enlaza (cada pantalla escribe su texto directamente) y lleva su tachado.
  for (const c of cs.children) { if (c.name === 'estado=marcado') continue; c.findOne((x) => x.name === 'cantidad').componentPropertyReferences = { characters: K.q }; c.findOne((x) => x.name === 'name').componentPropertyReferences = { characters: K.n }; }
  for (const c of cs.children) for (const t of c.findAll((x) => x.type === 'TEXT' && x.name !== 'no lo tienes' && x.parent.name !== 'no lo tienes')) t.textDecoration = c.name === 'estado=marcado' ? 'STRIKETHROUGH' : 'NONE';
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'temporizador') {
  const ib = await setOf('01 · Acciones', 'Button · Icon');
  const add = stager(page, 'staging · Temporizador');
  for (const st of ['en-marcha', 'sonado']) {
    const rang = st === 'sonado';
    const c = comp('estado=' + st); bind(c, 'itemSpacing', 'spacing/2'); padX(c, 'spacing/2'); padY(c, 'spacing/1'); rad(c, 'radius/lg'); setPaints(c, 'strokes', [[rang ? 'warning' : 'border', rang ? 0.4 : 1]]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; if (rang) setPaints(c, 'fills', [['warning', 0.15]]); add(c);
    c.appendChild(icon(rang ? 'bell-ring' : 'timer', 16, rang ? 'warning' : 'muted-foreground', 'icon'));
    await text(rang ? '¡Tiempo! 8 min' : '34:12', 'Body/Small Medium', rang ? 'warning' : 'foreground', c, { name: 'tiempo' });
    const x = variant(ib, 'variant=ghost, size=icon, state=default').createInstance(); c.appendChild(x); x.setProperties({ [P(ib, 'icon')]: iconComp('x').id }); if (rang) recolor(x.findAll((q) => q.type === 'INSTANCE')[0], 'warning');
  }
  const { cs } = await combine(page, 'staging · Temporizador', 'Temporizador', { estado: ['en-marcha', 'sonado'] }, 'estado', [], 'Un temporizador de la barra del modo cocinado (cooking-mode.tsx, TimerBar): rounded-lg border px-2 py-1 gap-2, Timer de 16 px en muted y la cuenta atrás en text-sm font-medium tabular-nums («34:12», «1:29:59» desde una hora). Al sonar: border-warning/40 bg-warning/15 text-warning, BellRing y «¡Tiempo! 8 min» con aria-live assertive; además vibra, suena y sale un toast. La X (ghost icon, 44 px) cancela («Cancelar el tiempo de 35 min») o descarta el aviso. Como mucho tres a la vez; la barra va bajo la cabecera, con el botón de silenciar a la derecha, y sigue visible al terminar el plato.');
  const k = cs.addComponentProperty('tiempo', 'TEXT', '34:12');
  for (const c of cs.children) c.findOne((n) => n.name === 'tiempo').componentPropertyReferences = { characters: k };
  return { set: cs.id, fixedIcons: await fixIconColors(cs), unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'plato-apilado') {
  // Variante nueva del set existente (sin reconstruirlo: las instancias de Menús · móvil siguen vivas).
  const cs = await setOf('◆ PATRONES', 'Plato del menú');
  for (const o of cs.children.filter((c) => c.name === 'estado=marcar-apilado')) o.remove();
  const v = cs.children.find((c) => c.name === 'estado=marcar').clone(); cs.appendChild(v); v.name = 'estado=marcar-apilado';
  v.layoutMode = 'VERTICAL'; v.primaryAxisSizingMode = 'AUTO'; v.counterAxisSizingMode = 'FIXED'; v.resize(136, v.height); v.primaryAxisSizingMode = 'AUTO';
  const z = v.findOne((n) => n.name === 'marcar'); z.layoutSizingHorizontal = 'FILL'; z.layoutSizingVertical = 'FIXED'; z.resize(z.width, 44);
  z.strokeLeftWeight = 0; z.strokeTopWeight = 1;
  const nb = v.findOne((n) => n.name === 'nombre'); nb.layoutSizingHorizontal = 'FILL'; nb.layoutSizingVertical = 'HUG'; // en fila llenaba el alto; apilado tiene que sumarlo
  // MEDIDO: el clon pierde el enlace del texto con la propiedad del set
  v.findOne((n) => n.name === 'name').componentPropertyReferences = { characters: Object.keys(cs.componentPropertyDefinitions).find((k) => k.startsWith('name')) };
  cs.description = cs.description + ' marcar-apilado: la misma zona de marcado DEBAJO del nombre y a todo el ancho (border-t), cuando la columna del hueco mide menos de 9rem. Pasa en escritorio a 1280 px, con la semana en tres columnas.';
  // colocar la variante nueva en la rejilla del tablero
  const others = cs.children.filter((c) => c !== v); v.x = Math.max(...others.map((c) => c.x + c.width)) + 72; v.y = others[0].y;
  cs.resizeWithoutConstraints(v.x + v.width + 32, cs.height);
  return { id: v.id, w: v.width, h: v.height };
}

if (ARGS.part === 'doc') {
  const doc = await pageDoc(page, 'PATRONES', 'Patrones', 'Lo que se repite en las features, montado SOLO con instancias de la librería: si cambia un componente, cambian los patrones. Los nombres de variante describen estados de producto (no props de React), porque un patrón no es un componente del código: es una composición que el código repite. Cada descripción dice de qué archivo sale.');
  const ENTRIES = [['Tarjeta de inventario', { estado: ['en-stock', 'caduca-pronto', 'caducado', 'quedan-pocas', 'agotado', 'agotado-en-lista'] }, null, ['estado']], ['Estado de producto', { estado: Object.keys(ESTADOS) }, 'estado', []], ['Cabecera de sección'], ['Chip de filtro', { estado: ['inactivo', 'activo-aviso', 'activo-caducados', 'tienda'] }, 'estado', []], ['Buscador', { filled: ['false', 'true'] }, 'filled', []], ['Fila de la lista', { checked: ['false', 'true'], chip: ['ninguno', 'tienda', 'ahorro'] }, 'chip', ['checked']], ['QuantityStepper', { uso: ['lista', 'lista-peso', 'lista-minimo', 'inventario'] }, 'uso', []], ['Te puede faltar'], ['Botón de IA', { size: ['default', 'lg'], state: ['default', 'loading'] }, 'state', ['size']], ['Día del menú'], ['Plato del menú', { estado: ['pendiente', 'marcar', 'marcar-apilado', 'cocinado', 'no-se-hizo'] }, 'estado', []], ['Chip de selección', { selected: ['false', 'true'] }, 'selected', []], ['Fila de ajustes', { tipo: ['enlace', 'accion', 'accion-destructiva'] }, 'tipo', []], ['Selector de producto', { estado: ['nuevo', 'asociado'] }, 'estado', []], ['Línea del ticket', { estado: ['elegir', 'duplicado', 'asociada'], 'al-peso': ['false', 'true'] }, 'estado', ['al-peso']], ['Celebración del ticket'], ['Tarjeta de repaso', { tipo: ['despensa', 'platos'] }, 'tipo', []], ['Pregunta de despensa', { estado: ['pendiente', 'contestada'] }, 'estado', []], ['Pregunta de plato', { estado: ['pendiente', 'no-abierto', 'descontar', 'por-que'] }, 'estado', []], ['Coste de receta', { estado: ['completo', 'parcial'] }, 'estado', []], ['Tarjeta de receta', { historial: ['false', 'true'] }, 'historial', []], ['Receta del pack', { estado: ['añadir', 'guardada'] }, 'estado', []], ['Valoración', { votos: ['sin', 'con'] }, 'votos', []], ['Ingrediente al cocinar', { estado: ['pendiente', 'marcado', 'falta'] }, 'estado', []], ['Temporizador', { estado: ['en-marcha', 'sonado'] }, 'estado', []]];
  const out = [];
  for (const [name, axes, colAxis, rowAxes] of ENTRIES) {
    const node = page.findOne((n) => (n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent.type !== 'COMPONENT_SET')) && n.name === name);
    if (!node) { out.push(name + ': falta'); continue; }
    const s = await docSection(doc, name, [node.description]);
    if (node.type === 'COMPONENT_SET') { const g = gridLayout(node, axes, colAxis, rowAxes, 32, 32, 72); await board(s, node, rowAxes.length ? g : { ...g, rows: [name] }, name + ' · variantes'); } else s.appendChild(node);
    out.push(name);
  }
  return { doc: doc.id, out, unbound: unboundPaints(doc).filter((x) => !x.startsWith('product')).length };
}
