// build-d.js — P4.d. ARGS.part: avatar|card|tabs|command|tooltip-popover|dropdown|toast|doc-contenido|doc-nav|doc-overlays
const ES = async (n) => (await figma.getLocalEffectStylesAsync()).find((s) => s.name === n).id;
const ring10 = (c) => { setPaints(c, 'strokes', [['foreground', 0.1]]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; };

if (ARGS.part === 'avatar') {
  const page = await pageByName('05 · Contenido');
  const add = stager(page, 'staging · Avatar');
  const SZ = { sm: ['spacing/6', 'Caption/Default', 8], default: ['spacing/8', 'Body/Small', 10], lg: ['spacing/10', 'Body/Small', 12] };
  for (const [size, [s, style, dot]] of Object.entries(SZ)) {
    const c = comp('size=' + size); c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED'; c.resize(32, 32); bind(c, 'width', s); bind(c, 'height', s);
    rad(c, 'radius/full'); setPaints(c, 'fills', [['muted']]); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE';
    add(c);
    await text('JM', style, 'muted-foreground', c, { name: 'initials' });
    const b = figma.createEllipse(); b.name = 'badge'; b.resize(dot, dot); setPaints(b, 'fills', [['primary']]); setPaints(b, 'strokes', [['background']]); b.strokeWeight = 2; b.strokeAlign = 'OUTSIDE';
    c.appendChild(b); b.layoutPositioning = 'ABSOLUTE'; b.x = c.width - dot; b.y = c.height - dot; b.constraints = { horizontal: 'MAX', vertical: 'MAX' }; b.visible = false;
  }
  const { cs } = await combine(page, 'staging · Avatar', 'Avatar', { size: ['sm', 'default', 'lg'] }, 'size', [], 'Avatar (src/components/ui/avatar.tsx): redondo, 24/32/40 px. Sin imagen muestra el fallback: iniciales en text-sm (text-xs en sm) sobre bg-muted. El borde es un after:border-border con mix-blend (darken en claro, lighten en oscuro); aquí, un trazo interior de border. El badge opcional es un punto bg-primary con ring-2 ring-background.');
  const ki = cs.addComponentProperty('initials', 'TEXT', 'JM'); const kb = cs.addComponentProperty('badge', 'BOOLEAN', false);
  for (const c of cs.children) { c.findOne((n) => n.name === 'initials').componentPropertyReferences = { characters: ki }; c.findOne((n) => n.name === 'badge').componentPropertyReferences = { visible: kb }; }
  return { set: cs.id, n: cs.children.length, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'card') {
  const page = await pageByName('05 · Contenido');
  const add = stager(page, 'staging · Card');
  for (const size of ['default', 'sm']) {
    const sp = size === 'default' ? 'spacing/4' : 'spacing/3';
    const c = comp('size=' + size, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(360, 100);
    bind(c, 'itemSpacing', sp); padY(c, sp); rad(c, 'radius/xl'); setPaints(c, 'fills', [['card']]); ring10(c);
    add(c);
    const h = stack('header', c, 4); padX(h, sp);
    await text('Yogur natural', 'Title/Card', 'card-foreground', h, { fill: true, name: 'title' }).then((t) => { if (size === 'sm') bind(t, 'fontSize', 'font-size/sm'); });
    await text('Nevera · 4 ud', 'Body/Small', 'muted-foreground', h, { fill: true, name: 'description' });
    const ct = stack('content', c, 0); padX(ct, sp);
    await text('Contenido de la tarjeta', 'Body/Small', 'card-foreground', ct, { fill: true, name: 'content' });
    const f = stack('footer', c, 8, 'HORIZONTAL'); f.counterAxisAlignItems = 'CENTER'; padX(f, sp); padY(f, sp); setPaints(f, 'fills', [['muted', 0.5]]);
    f.strokes = [solid('border')]; f.strokeTopWeight = 1; f.strokeBottomWeight = 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0;
    await text('Pie de la tarjeta', 'Body/Small', 'muted-foreground', f, { name: 'footer-text' });
    f.visible = false;
  }
  const { cs } = await combine(page, 'staging · Card', 'Card', { size: ['default', 'sm'] }, 'size', [], 'Card (src/components/ui/card.tsx): rounded-xl, bg-card, text-sm y SIN borde ni sombra: ring-1 ring-foreground/10, aquí un trazo interior de foreground al 10 %. Espaciado --card-spacing: 16 px (default) o 12 px (sm), igual para gap, padding vertical y horizontal. CardTitle en font-heading text-base font-medium leading-snug. El footer lleva border-t y bg-muted/50, y cuando existe la tarjeta pierde el padding inferior (has-data-[slot=card-footer]:pb-0).');
  const kt = cs.addComponentProperty('title', 'TEXT', 'Yogur natural'), kd = cs.addComponentProperty('description', 'TEXT', 'Nevera · 4 ud'), kf = cs.addComponentProperty('footer', 'BOOLEAN', false);
  for (const c of cs.children) { c.findOne((n) => n.name === 'title').componentPropertyReferences = { characters: kt }; c.findOne((n) => n.name === 'description').componentPropertyReferences = { characters: kd }; c.findOne((n) => n.name === 'footer').componentPropertyReferences = { visible: kf }; }
  return { set: cs.id, n: cs.children.length, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'tabs') {
  const page = await pageByName('03 · Navegación');
  await compVar('component/tabs/trigger-text', tint('foreground', '4:1', 0.6), aliasOf('muted-foreground'), ['TEXT_FILL', 'STROKE_COLOR'], 'text-foreground/60 dark:text-muted-foreground', 'Tabs: texto de la pestaña inactiva. Claro = foreground al 60 %; oscuro = muted-foreground.');
  await compVar('component/tabs/active-bg', aliasOf('background'), tint('input', '4:2', 0.3), ['FRAME_FILL', 'SHAPE_FILL'], 'data-active:bg-background dark:data-active:bg-input/30', 'Tabs: fondo de la pestaña activa. Claro = background; oscuro = input al 30 %.');
  await compVar('component/tabs/active-border', { r: 1, g: 1, b: 1, a: 0 }, aliasOf('input'), ['STROKE_COLOR'], 'border-transparent dark:data-active:border-input', 'Tabs: borde de la pestaña activa. Transparente en claro, input en oscuro.');
  const add = stager(page, 'staging · Tabs trigger');
  for (const variant of ['default', 'line']) for (const st of ['default', 'hover', 'active', 'focus', 'disabled']) {
    const c = comp(`variant=${variant}, state=${st}`); c.counterAxisSizingMode = 'FIXED'; c.resize(80, 25);
    padX(c, 'spacing/1_5'); padY(c, 'spacing/0_5'); bind(c, 'itemSpacing', 'spacing/1_5'); rad(c, 'radius/md');
    const active = st === 'active';
    c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; c.strokesIncludedInLayout = true;
    setPaints(c, 'strokes', [[st === 'focus' ? 'ring' : variant === 'default' && active ? 'component/tabs/active-border' : 'border', st === 'focus' || (variant === 'default' && active) ? 1 : 0]]);
    setPaints(c, 'fills', variant === 'default' && active ? [['component/tabs/active-bg']] : []);
    if (variant === 'default' && active) await c.setEffectStyleIdAsync(await ES('Shadow/sm'));
    if (st === 'disabled') c.opacity = 0.5;
    add(c);
    await text('Nevera', 'Body/Small Medium', active || st === 'hover' ? 'foreground' : 'component/tabs/trigger-text', c, { name: 'label' });
    if (variant === 'line' && active) { const u = figma.createRectangle(); u.name = 'indicator'; setPaints(u, 'fills', [['foreground']]); c.appendChild(u); u.layoutPositioning = 'ABSOLUTE'; u.resize(c.width, 2); u.x = 0; u.y = 25 + 5 - 2; u.constraints = { horizontal: 'STRETCH', vertical: 'MAX' }; }
    if (st === 'focus') focusRing(c, 'effect/ring-50', 'radius/md');
  }
  const r = await combine(page, 'staging · Tabs trigger', 'Tabs · Trigger', { variant: ['default', 'line'], state: ['default', 'hover', 'active', 'focus', 'disabled'] }, 'state', ['variant'], 'TabsTrigger (src/components/ui/tabs.tsx): text-sm font-medium, px-1.5, rounded-md, alto = el de la lista menos 1 px. Inactiva en foreground/60 (muted-foreground en oscuro); activa en variant default = bg-background + shadow-sm (en oscuro border-input y bg-input/30); en line = sin fondo y una raya de 2 px de foreground 5 px por debajo.');
  const kl = r.cs.addComponentProperty('label', 'TEXT', 'Nevera');
  for (const c of r.cs.children) c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kl };
  // Lista (composición)
  const listAdd = stager(page, 'staging · Tabs list');
  for (const variant of ['default', 'line']) {
    const l = comp('variant=' + variant); l.counterAxisSizingMode = 'FIXED'; l.resize(100, 32); bind(l, 'height', 'spacing/8');
    rad(l, 'radius/lg'); l.paddingLeft = l.paddingRight = l.paddingTop = l.paddingBottom = 3; // p-[3px]: arbitrario
    setPaints(l, 'fills', variant === 'default' ? [['muted']] : []); if (variant === 'line') bind(l, 'itemSpacing', 'spacing/1');
    listAdd(l);
    const insts = [];
    for (const [lab, st] of [['Despensa', 'default'], ['Nevera', 'active'], ['Congelador', 'default']]) { const i = r.cs.children.find((c) => c.name === `variant=${variant}, state=${st}`).createInstance(); l.appendChild(i); i.setProperties({ [kl]: lab }); insts.push(i); }
    // flex-1: todas las pestañas miden lo que la más ancha (w-fit en la lista)
    const w = Math.max(...insts.map((i) => i.width)); const gap = variant === 'line' ? 4 : 0;
    l.primaryAxisSizingMode = 'FIXED'; l.resize(w * insts.length + gap * (insts.length - 1) + 6, l.height);
    for (const i of insts) i.layoutGrow = 1;
  }
  const r2 = await combine(page, 'staging · Tabs list', 'Tabs · List', { variant: ['default', 'line'] }, 'variant', [], 'TabsList: h-8, p-[3px] (arbitrario), rounded-lg y bg-muted (default) o sin fondo con gap-1 (line). Es una composición de Tabs · Trigger: cambia labels y la pestaña activa en las instancias.');
  return { trigger: r.cs.id, list: r2.cs.id, unbound: unboundPaints(r.cs).length + unboundPaints(r2.cs).length };
}

if (ARGS.part === 'command') {
  const page = await pageByName('03 · Navegación');
  const add = stager(page, 'staging · Command item');
  for (const st of ['default', 'selected', 'disabled']) {
    const c = comp('state=' + st); c.primaryAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.resize(360, 32);
    padX(c, 'spacing/2'); padY(c, 'spacing/1_5'); bind(c, 'itemSpacing', 'spacing/2'); rad(c, 'radius/sm');
    setPaints(c, 'fills', st === 'selected' ? [['muted']] : []); if (st === 'disabled') c.opacity = 0.5;
    add(c);
    c.appendChild(icon('shopping-cart', 16, st === 'selected' ? 'foreground' : 'muted-foreground', 'icon'));
    const t = await text('Ir a la lista', 'Body/Small', 'foreground', c, { name: 'label' }); t.layoutSizingHorizontal = 'FILL';
    const sc = await text('G L', 'Caption/Default', st === 'selected' ? 'foreground' : 'muted-foreground', c, { name: 'shortcut' }); sc.letterSpacing = { value: 10, unit: 'PERCENT' };
  }
  const r = await combine(page, 'staging · Command item', 'Command · Item', { state: ['default', 'selected', 'disabled'] }, 'state', [], 'CommandItem (src/components/ui/command.tsx): gap-2, px-2 py-1.5, rounded-sm (rounded-lg dentro de un diálogo), text-sm; seleccionado = bg-muted. El atajo va en text-xs tracking-widest muted-foreground.');
  const kl = r.cs.addComponentProperty('label', 'TEXT', 'Ir a la lista'), ksc = r.cs.addComponentProperty('shortcut', 'BOOLEAN', true), ksw = r.cs.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('shopping-cart').id);
  for (const c of r.cs.children) { c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kl }; c.findOne((n) => n.name === 'shortcut').componentPropertyReferences = { visible: ksc }; c.findOne((n) => n.name === 'icon').componentPropertyReferences = { mainComponent: ksw }; }
  // Paleta completa (composición): Command dentro de un diálogo
  const old = page.findOne((n) => n.type === 'COMPONENT' && n.name === 'Command'); if (old) old.remove();
  const cmd = figma.createComponent(); cmd.name = 'Command'; cmd.layoutMode = 'VERTICAL'; cmd.primaryAxisSizingMode = 'AUTO'; cmd.counterAxisSizingMode = 'FIXED'; cmd.resize(384, 100); cmd.clipsContent = true;
  rad(cmd, 'radius/xl'); padX(cmd, 'spacing/1'); padY(cmd, 'spacing/1'); setPaints(cmd, 'fills', [['popover']]); ring10(cmd);
  await cmd.setEffectStyleIdAsync(await ES('Shadow/lg'));
  page.appendChild(cmd); cmd.x = 3000; cmd.y = 800;
  const top = stack('input-wrapper', cmd, 0); top.paddingLeft = top.paddingRight = top.paddingTop = 4; top.paddingBottom = 0;
  const ig = stack('input-group', top, 8, 'HORIZONTAL'); ig.counterAxisAlignItems = 'CENTER'; ig.layoutSizingVertical = 'FIXED'; ig.resize(ig.width, 32); bind(ig, 'height', 'spacing/8'); rad(ig, 'radius/lg'); padX(ig, 'spacing/2');
  setPaints(ig, 'fills', [['input', 0.3]]); setPaints(ig, 'strokes', [['input', 0.3]]); ig.strokeWeight = 1; ig.strokeAlign = 'INSIDE';
  const si = icon('search', 16, 'foreground', 'search'); ig.appendChild(si); si.opacity = 0.5;
  const ph = await text('Buscar pantallas y acciones…', 'Body/Small', 'muted-foreground', ig, { name: 'placeholder' }); ph.layoutSizingHorizontal = 'FILL';
  const list = stack('list', cmd, 0); padX(list, 'spacing/1'); padY(list, 'spacing/1');
  const hd = stack('heading', list, 0); padX(hd, 'spacing/2'); padY(hd, 'spacing/1_5');
  await text('Ir a', 'Caption/Medium', 'muted-foreground', hd, { fill: true });
  const ITEMS = [['Inventario', 'package', 'selected', 'G I'], ['Lista de la compra', 'shopping-cart', 'default', 'G L'], ['Menús', 'calendar-days', 'default', 'G M'], ['Escanear ticket', 'scan-line', 'default', '']];
  for (const [lab, ic, st, sc] of ITEMS) { const i = r.cs.children.find((c) => c.name === 'state=' + st).createInstance(); list.appendChild(i); i.layoutSizingHorizontal = 'FILL'; i.setProperties({ [kl]: lab, [ksw]: iconComp(ic).id, [ksc]: !!sc }); if (sc) { const t = i.findOne((n) => n.name === 'shortcut'); t.characters = sc; } }
  cmd.description = 'CommandPalette (src/components/layout/command-palette.tsx sobre ui/command.tsx): rounded-xl, bg-popover, p-1. El buscador es un InputGroup h-8 con bg-input/30 y border-input/30 (este es el ÚNICO uso de InputGroup en la app, por eso vive aquí y no suelto) y la lupa al 50 %. Los grupos llevan cabecera en text-xs font-medium muted-foreground. En escritorio se abre con Ctrl/Cmd+K.';
  return { item: r.cs.id, command: cmd.id, unbound: unboundPaints(cmd).length + unboundPaints(r.cs).length };
}

if (ARGS.part === 'tooltip-popover') {
  const page = await pageByName('04 · Overlays');
  // Tooltip
  const add = stager(page, 'staging · Tooltip');
  for (const side of ['top', 'bottom']) {
    const c = comp('side=' + side, 'VERTICAL'); c.itemSpacing = 0; c.fills = [];
    add(c);
    const body = stack('body', c, 6, 'HORIZONTAL'); body.layoutSizingHorizontal = 'HUG'; body.counterAxisAlignItems = 'CENTER'; padX(body, 'spacing/3'); padY(body, 'spacing/1_5'); rad(body, 'radius/md'); setPaints(body, 'fills', [['foreground']]);
    await text('Añadir producto', 'Caption/Default', 'background', body, { name: 'label' });
    // flecha: size-2.5 girada 45° en código; aquí un triángulo de 12 × 6 del mismo color
    const tri = figma.createPolygon(); tri.name = 'arrow'; tri.pointCount = 3; tri.resize(12, 6); setPaints(tri, 'fills', [['foreground']]);
    if (side === 'top') { c.appendChild(tri); tri.rotation = 180; } else c.insertChild(0, tri);
  }
  let r = await combine(page, 'staging · Tooltip', 'Tooltip', { side: ['top', 'bottom'] }, 'side', [], 'TooltipContent (src/components/ui/tooltip.tsx): bg-foreground con texto text-xs en background (el tema invertido), px-3 py-1.5, rounded-md, max-w-xs. Flecha de 10 px girada 45°. Solo en escritorio: en táctil no hay hover, así que la información no puede vivir solo aquí.');
  const kt = r.cs.addComponentProperty('label', 'TEXT', 'Añadir producto');
  for (const c of r.cs.children) c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kt };
  // Popover
  const old = page.findOne((n) => n.type === 'COMPONENT' && n.name === 'Popover'); if (old) old.remove();
  const p = figma.createComponent(); p.name = 'Popover'; p.layoutMode = 'VERTICAL'; p.primaryAxisSizingMode = 'AUTO'; p.counterAxisSizingMode = 'FIXED'; p.resize(288, 100); p.clipsContent = false;
  // w-72 = 288 px: ancho fijo (el paso 72 no llega a 5 usos y no está en la escala)
  padX(p, 'spacing/2_5'); padY(p, 'spacing/2_5'); bind(p, 'itemSpacing', 'spacing/2_5'); rad(p, 'radius/lg'); setPaints(p, 'fills', [['popover']]); ring10(p);
  await p.setEffectStyleIdAsync(await ES('Shadow/md'));
  page.appendChild(p); p.x = 3000; p.y = 400;
  const hd = stack('header', p, 2);
  await text('Caduca pronto', 'Body/Small Medium', 'popover-foreground', hd, { fill: true, name: 'title' });
  await text('3 productos caducan en los próximos dos días.', 'Body/Small', 'muted-foreground', hd, { fill: true, name: 'description' });
  const kpt = p.addComponentProperty('title', 'TEXT', 'Caduca pronto'), kpd = p.addComponentProperty('description', 'TEXT', '3 productos caducan en los próximos dos días.');
  p.findOne((n) => n.name === 'title').componentPropertyReferences = { characters: kpt }; p.findOne((n) => n.name === 'description').componentPropertyReferences = { characters: kpd };
  p.description = 'PopoverContent (src/components/ui/popover.tsx): w-72 (288 px), p-2.5, gap-2.5, rounded-lg, bg-popover, shadow-md y ring-1 ring-foreground/10. PopoverHeader: gap-0.5, text-sm. En móvil, si el contenido es una tarea, va en ResponsiveModal y no en un popover.';
  return { tooltip: r.cs.id, popover: p.id, unbound: unboundPaints(r.cs).length + unboundPaints(p).length };
}

if (ARGS.part === 'dropdown') {
  const page = await pageByName('04 · Overlays');
  const add = stager(page, 'staging · Dropdown item');
  for (const variant of ['default', 'destructive']) for (const st of ['default', 'focus', 'disabled']) {
    const c = comp(`variant=${variant}, state=${st}`); c.primaryAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.resize(208, 28);
    padX(c, 'spacing/1_5'); padY(c, 'spacing/1'); bind(c, 'itemSpacing', 'spacing/1_5'); rad(c, 'radius/md');
    const focus = st === 'focus'; const destr = variant === 'destructive';
    setPaints(c, 'fills', focus ? [[destr ? 'component/destructive/bg' : 'accent']] : []);
    if (st === 'disabled') c.opacity = 0.5;
    add(c);
    const col = destr ? 'destructive' : focus ? 'accent-foreground' : 'popover-foreground';
    c.appendChild(icon(destr ? 'trash' : 'pencil', 16, destr ? 'destructive' : focus ? 'accent-foreground' : 'muted-foreground', 'icon'));
    const t = await text(destr ? 'Eliminar' : 'Editar', 'Body/Small', col, c, { name: 'label' }); t.layoutSizingHorizontal = 'FILL';
  }
  const r = await combine(page, 'staging · Dropdown item', 'DropdownMenu · Item', { variant: ['default', 'destructive'], state: ['default', 'focus', 'disabled'] }, 'state', ['variant'], 'DropdownMenuItem (src/components/ui/dropdown-menu.tsx): gap-1.5, px-1.5 py-1, rounded-md, text-sm, iconos a 16 px. focus = bg-accent; destructive = text-destructive y, con foco, bg-destructive/10 (/20 en oscuro). Alto 28 px: es un menú de escritorio; en móvil las acciones van en bottom sheet.');
  const kl = r.cs.addComponentProperty('label', 'TEXT', 'Editar'), ki = r.cs.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('pencil').id);
  for (const c of r.cs.children) { c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kl }; c.findOne((n) => n.name === 'icon').componentPropertyReferences = { mainComponent: ki }; }
  const old = page.findOne((n) => n.type === 'COMPONENT' && n.name === 'DropdownMenu · Content'); if (old) old.remove();
  const m = figma.createComponent(); m.name = 'DropdownMenu · Content'; m.layoutMode = 'VERTICAL'; m.primaryAxisSizingMode = 'AUTO'; m.counterAxisSizingMode = 'FIXED'; m.resize(216, 100); m.clipsContent = false;
  padX(m, 'spacing/1'); padY(m, 'spacing/1'); rad(m, 'radius/lg'); setPaints(m, 'fills', [['popover']]); ring10(m);
  await m.setEffectStyleIdAsync(await ES('Shadow/md'));
  page.appendChild(m); m.x = 3000; m.y = 700;
  const lab = stack('label', m, 0); padX(lab, 'spacing/1_5'); padY(lab, 'spacing/1'); await text('Leche entera', 'Caption/Medium', 'muted-foreground', lab, { fill: true });
  for (const [l, ic, v, st] of [['Editar', 'pencil', 'default', 'focus'], ['Mover a la nevera', 'refrigerator', 'default', 'default'], ['Añadir a la lista', 'shopping-cart', 'default', 'default']]) { const i = r.cs.children.find((c) => c.name === `variant=${v}, state=${st}`).createInstance(); m.appendChild(i); i.layoutSizingHorizontal = 'FILL'; i.setProperties({ [kl]: l, [ki]: iconComp(ic).id }); }
  const sepw = stack('separator', m, 0); sepw.paddingTop = sepw.paddingBottom = 4; sepw.paddingLeft = sepw.paddingRight = 0; const sep = figma.createRectangle(); sep.resize(208, 1); setPaints(sep, 'fills', [['border']]); sepw.appendChild(sep); sep.layoutSizingHorizontal = 'FILL';
  const d = r.cs.children.find((c) => c.name === 'variant=destructive, state=default').createInstance(); m.appendChild(d); d.layoutSizingHorizontal = 'FILL'; d.setProperties({ [kl]: 'Eliminar', [ki]: iconComp('trash').id });
  m.description = 'DropdownMenuContent: min-w-32, p-1, rounded-lg, bg-popover, shadow-md, ring-1 ring-foreground/10. Label en text-xs (font-medium) muted-foreground; separador -mx-1 my-1 h-px bg-border. Composición de DropdownMenu · Item.';
  return { item: r.cs.id, content: m.id, unbound: unboundPaints(m).length + unboundPaints(r.cs).length };
}

if (ARGS.part === 'toast') {
  const page = await pageByName('04 · Overlays');
  const add = stager(page, 'staging · Toast');
  const T = { default: null, success: 'circle-check', info: 'info', warning: 'triangle-alert', error: 'octagon-x', loading: 'loader-circle' };
  const MSG = { default: 'Añadido a la lista', success: 'Compra guardada', info: 'Menú copiado de la semana pasada', warning: 'Sin conexión: se guardará al volver', error: 'No se pudo guardar el ticket', loading: 'Generando menú…' };
  for (const [type, ic] of Object.entries(T)) {
    const c = comp('type=' + type); c.primaryAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.resize(356, 52); c.counterAxisSizingMode = 'AUTO';
    c.paddingLeft = c.paddingRight = c.paddingTop = c.paddingBottom = 16; c.itemSpacing = 6; // interno de sonner
    rad(c, 'radius/base'); setPaints(c, 'fills', [['popover']]); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE';
    await c.setEffectStyleIdAsync(await ES('Shadow/md'));
    add(c);
    if (ic) c.appendChild(icon(ic, 16, 'popover-foreground', 'icon'));
    const body = stack('content', c, 2); body.layoutSizingHorizontal = 'FILL';
    const t = await text(MSG[type], 'Body/Small Medium', 'popover-foreground', body, { fill: true, name: 'title' }); t.fontSize = 13;
    const d = await text('Toca para deshacer', 'Body/Small', 'popover-foreground', body, { fill: true, name: 'description' }); d.fontSize = 13; d.opacity = 0.9; d.visible = false;
  }
  const r = await combine(page, 'staging · Toast', 'Toast', { type: Object.keys(T) }, 'type', [], 'Toaster (src/components/ui/sonner.tsx, sobre la librería sonner). Del repo salen solo los colores y el radio: --normal-bg: popover, --normal-text: popover-foreground, --normal-border: border y --border-radius: --radius; los iconos son lucide a 16 px (CircleCheck, Info, TriangleAlert, OctagonX, LoaderCircle). Ancho 356 px, padding 16, gap 6, texto de 13 px y sombra son INTERNOS de sonner: aquí se reproducen, sin token (la sombra se aproxima con Shadow/md). Sin richColors: el icono va en el color del texto.');
  const kt = r.cs.addComponentProperty('title', 'TEXT', 'Añadido a la lista'), kd = r.cs.addComponentProperty('description', 'BOOLEAN', false), kdt = r.cs.addComponentProperty('description text', 'TEXT', 'Toca para deshacer');
  for (const c of r.cs.children) { c.findOne((n) => n.name === 'title').componentPropertyReferences = { characters: kt }; const d = c.findOne((n) => n.name === 'description'); d.componentPropertyReferences = { visible: kd, characters: kdt }; }
  return { set: r.cs.id, unbound: unboundPaints(r.cs).length };
}

// Documentación por página
async function docPage(pageName, eyebrow, title, lead, entries) {
  const page = await pageByName(pageName);
  const doc = await pageDoc(page, eyebrow, title, lead);
  const out = [];
  for (const [name, axes, colAxis, rowAxes, extra] of entries) {
    const node = page.findOne((n) => (n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent.type !== 'COMPONENT_SET')) && n.name === name);
    if (!node) { out.push(name + ': falta'); continue; }
    const s = await docSection(doc, name, [node.description, ...(extra || [])]);
    if (node.type === 'COMPONENT_SET') { const g = gridLayout(node, axes, colAxis, rowAxes, 24, 32, 72); await board(s, node, rowAxes.length ? g : { ...g, rows: [name] }, name + ' · variantes'); }
    else { s.appendChild(node); }
    out.push(name);
  }
  return { doc: doc.id, out, unbound: unboundPaints(doc).length };
}
if (ARGS.part === 'doc-contenido') return await docPage('05 · Contenido', 'COMPONENTES · 05', 'Contenido', '', [
  ['Card', { size: ['default', 'sm'] }, 'size', []], ['Avatar', { size: ['sm', 'default', 'lg'] }, 'size', []]]);
if (ARGS.part === 'doc-nav') return await docPage('03 · Navegación', 'COMPONENTES · 03', 'Navegación', 'Tabs y la paleta de comandos. La navegación principal (BottomNav y AppSidebar) es del shell y se construye con él.', [
  ['Tabs · Trigger', { variant: ['default', 'line'], state: ['default', 'hover', 'active', 'focus', 'disabled'] }, 'state', ['variant']],
  ['Tabs · List', { variant: ['default', 'line'] }, 'variant', []],
  ['Command · Item', { state: ['default', 'selected', 'disabled'] }, 'state', []],
  ['Command', null, null, null]]);
if (ARGS.part === 'doc-overlays') return await docPage('04 · Overlays', 'COMPONENTES · 04', 'Overlays', 'Todo overlay de una feature va por ResponsiveModal (bottom sheet en móvil, diálogo centrado desde md). Tooltip, Popover y DropdownMenu son capas ligeras de escritorio; Toast avisa sin interrumpir.', [
  ['Tooltip', { side: ['top', 'bottom'] }, 'side', []], ['Popover', null, null, null],
  ['DropdownMenu · Item', { variant: ['default', 'destructive'], state: ['default', 'focus', 'disabled'] }, 'state', ['variant']], ['DropdownMenu · Content', null, null, null],
  ['Toast', { type: ['default', 'success', 'info', 'warning', 'error', 'loading'] }, null, ['type']]]);
