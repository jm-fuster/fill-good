// build-patterns.js — Fase 6: patrones de las features, montados con instancias de
// la librería (nunca copias). Página «◆ PATRONES». ARGS.part:
//   estado | buscador | chip | stepper | card | row | sugerencia | ai | seccion | dia | doc
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

if (ARGS.part === 'doc') {
  const doc = await pageDoc(page, 'PATRONES', 'Patrones', 'Lo que se repite en las features, montado SOLO con instancias de la librería: si cambia un componente, cambian los patrones. Los nombres de variante describen estados de producto (no props de React), porque un patrón no es un componente del código: es una composición que el código repite. Cada descripción dice de qué archivo sale.');
  const ENTRIES = [['Tarjeta de inventario', { estado: ['en-stock', 'caduca-pronto', 'caducado', 'quedan-pocas', 'agotado', 'agotado-en-lista'] }, null, ['estado']], ['Estado de producto', { estado: Object.keys(ESTADOS) }, 'estado', []], ['Cabecera de sección'], ['Chip de filtro', { estado: ['inactivo', 'activo-aviso', 'activo-caducados', 'tienda'] }, 'estado', []], ['Buscador', { filled: ['false', 'true'] }, 'filled', []], ['Fila de la lista', { checked: ['false', 'true'], chip: ['ninguno', 'tienda', 'ahorro'] }, 'chip', ['checked']], ['QuantityStepper', { uso: ['lista', 'lista-peso', 'lista-minimo', 'inventario'] }, 'uso', []], ['Te puede faltar'], ['Botón de IA', { size: ['default', 'lg'], state: ['default', 'loading'] }, 'state', ['size']], ['Día del menú'], ['Plato del menú', { estado: ['pendiente', 'marcar', 'cocinado', 'no-se-hizo'] }, 'estado', []]];
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
