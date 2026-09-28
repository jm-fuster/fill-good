// build-modal.js — P4.e en 04 · Overlays: ResponsiveModal (Drawer <md / Dialog ≥md), Sheet y documentación.
const page = await pageByName('04 · Overlays');
const acc = figma.root.children.find((p) => p.name === '01 · Acciones'); await acc.loadAsync();
const btnSet = acc.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Button');
const ibtnSet = acc.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Button · Icon');
const BP = (p) => Object.keys(btnSet.componentPropertyDefinitions).find((k) => k.startsWith(p));
const btn = (v, label) => { const i = btnSet.children.find((c) => c.name === `variant=${v}, size=default, state=default`).createInstance(); i.setProperties({ [BP('label')]: label }); return i; };
const ES = async (n) => (await figma.getLocalEffectStylesAsync()).find((s) => s.name === n).id;
const ring10 = (c) => { setPaints(c, 'strokes', [['foreground', 0.1]]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; };

if (ARGS.part === 'modal') {
  await compVar('component/modal/overlay', { r: 0, g: 0, b: 0, a: 0.1 }, { r: 0, g: 0, b: 0, a: 0.1 }, ['FRAME_FILL'], 'bg-black/10 backdrop-blur-xs', 'Overlay de Dialog, Drawer y Sheet: negro al 10 % (black no es un token del sistema, es el de Tailwind) con desenfoque de 4 px.');
  // Hueco de contenido
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === '_Modal · Contenido')) n.remove();
  const slot = figma.createComponent(); slot.name = '_Modal · Contenido'; slot.layoutMode = 'VERTICAL'; slot.primaryAxisSizingMode = 'AUTO'; slot.counterAxisSizingMode = 'FIXED'; slot.resize(358, 10); slot.primaryAxisSizingMode = 'AUTO'; slot.fills = [];
  padX(slot, 'spacing/4'); padY(slot, 'spacing/2');
  const box = stack('placeholder', slot, 0); box.primaryAxisAlignItems = 'CENTER'; box.counterAxisAlignItems = 'CENTER'; box.layoutSizingVertical = 'FIXED'; box.resize(box.width, 160); rad(box, 'radius/lg'); setPaints(box, 'strokes', [['border']]); box.dashPattern = [6, 4]; setPaints(box, 'fills', [['muted', 0.5]]);
  await text('Contenido: el <form> del panel, con px-4', 'Caption/Default', 'muted-foreground', box);
  page.appendChild(slot); slot.x = 3000; slot.y = 2000;
  slot.description = 'Hueco del cuerpo de ResponsiveModal. Cámbialo (instance swap) por el contenido real: campos, listas… En código es el <form> con px-4 dentro de ResponsiveModalContent.';
  const add = stager(page, 'staging · ResponsiveModal');
  for (const viewport of ['mobile', 'desktop']) for (const footer of ['default', 'sticky']) {
    const mob = viewport === 'mobile';
    const c = figma.createComponent(); c.name = `viewport=${viewport}, footer=${footer}`;
    c.layoutMode = 'VERTICAL'; c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'FIXED'; c.resize(mob ? 390 : 512, 100); c.itemSpacing = 0; c.clipsContent = true;
    setPaints(c, 'fills', [['popover']]);
    if (mob) { bind(c, 'topLeftRadius', 'radius/xl'); bind(c, 'topRightRadius', 'radius/xl'); c.strokes = [solid('border')]; c.strokeTopWeight = 1; c.strokeBottomWeight = 0; c.strokeLeftWeight = 0; c.strokeRightWeight = 0; c.strokeAlign = 'INSIDE'; }
    else { rad(c, 'radius/xl'); ring10(c); await c.setEffectStyleIdAsync(await ES('Shadow/lg')); }
    add(c);
    if (mob) { const hw = stack('handle', c, 0); hw.counterAxisAlignItems = 'CENTER'; bind(hw, 'paddingTop', 'spacing/4'); const h = figma.createFrame(); h.name = 'handle-bar'; h.resize(100, 4); rad(h, 'radius/full'); setPaints(h, 'fills', [['muted']]); hw.appendChild(h); }
    const head = stack('header', c, mob ? 2 : 4); padX(head, 'spacing/4'); padY(head, 'spacing/4'); if (mob) head.counterAxisAlignItems = 'CENTER';
    const title = await text('Añadir producto', 'Body/Base Medium', 'foreground', head, { fill: true, name: 'title' }); title.lineHeight = { value: 100, unit: 'PERCENT' }; if (mob) title.textAlignHorizontal = 'CENTER';
    const desc = await text('Se guarda en el inventario del hogar.', 'Body/Small', 'muted-foreground', head, { fill: true, name: 'description' }); if (mob) desc.textAlignHorizontal = 'CENTER';
    const body = slot.createInstance(); body.name = 'content'; c.appendChild(body); body.layoutSizingHorizontal = 'FILL'; body.layoutSizingVertical = 'HUG';
    const foot = stack('footer', c, 8); padX(foot, 'spacing/4'); padY(foot, 'spacing/4');
    if (footer === 'sticky') { foot.strokes = [solid('border')]; foot.strokeTopWeight = 1; foot.strokeBottomWeight = 0; foot.strokeLeftWeight = 0; foot.strokeRightWeight = 0; setPaints(foot, 'fills', [['popover']]); }
    for (const [v, l] of [['default', 'Guardar'], ['outline', 'Cancelar']]) { const b = btn(v, l); foot.appendChild(b); b.layoutSizingHorizontal = 'FILL'; }
    if (mob) { const safe = figma.createFrame(); safe.name = 'safe-area (pb-safe-sheet)'; safe.fills = []; safe.resize(390, 34); c.appendChild(safe); safe.layoutSizingHorizontal = 'FILL'; }
    else { const x = ibtnSet.children.find((ch) => ch.name === 'variant=ghost, size=icon-sm, state=default').createInstance(); x.name = 'close'; x.setProperties({ [Object.keys(ibtnSet.componentPropertyDefinitions).find((k) => k.startsWith('icon'))]: iconComp('x').id }); c.appendChild(x); x.layoutPositioning = 'ABSOLUTE'; x.x = 512 - 8 - x.width; x.y = 8; x.constraints = { horizontal: 'MAX', vertical: 'MIN' }; }
  }
  const { cs } = await combine(page, 'staging · ResponsiveModal', 'ResponsiveModal', { viewport: ['mobile', 'desktop'], footer: ['default', 'sticky'] }, 'viewport', ['footer'], 'ResponsiveModal (src/components/ui/responsive-modal.tsx): TODO overlay de una feature. < md = Drawer (vaul): bottom sheet con rounded-t-xl, border-t, asa de 100 × 4 en bg-muted, cabecera centrada, max-h 80dvh y pb-safe-sheet (la barra de gestos; se descuenta el teclado). ≥ md = Dialog: centrado, sm:max-w-lg (512), rounded-xl, ring-1 ring-foreground/10, max-h 85vh con scroll interno, cabecera a la izquierda y botón de cerrar (ghost icon-sm) arriba a la derecha. Footer: botones apilados a ancho completo en los dos; sticky = border-t y bg-popover para que guardar y eliminar se vean sin scroll. Nunca Drawer ni Dialog sueltos, y nunca un modal encima de otro (el cierre por historial cierra los dos): se usan vistas dentro del mismo modal. El overlay (bg-black/10 + blur) es de la pantalla, no del componente.');
  const kt = cs.addComponentProperty('title', 'TEXT', 'Añadir producto'), kd = cs.addComponentProperty('description', 'TEXT', 'Se guarda en el inventario del hogar.'), kc = cs.addComponentProperty('content', 'INSTANCE_SWAP', slot.id);
  for (const c of cs.children) { c.findOne((n) => n.name === 'title').componentPropertyReferences = { characters: kt }; c.findOne((n) => n.name === 'description').componentPropertyReferences = { characters: kd }; c.findOne((n) => n.name === 'content').componentPropertyReferences = { mainComponent: kc }; }
  return { set: cs.id, slot: slot.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'sheet') {
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === 'Sheet')) n.remove();
  const s = figma.createComponent(); s.name = 'Sheet'; s.layoutMode = 'VERTICAL'; s.primaryAxisSizingMode = 'FIXED'; s.counterAxisSizingMode = 'FIXED'; s.resize(384, 600); bind(s, 'itemSpacing', 'spacing/4'); s.clipsContent = true;
  setPaints(s, 'fills', [['popover']]); s.strokes = [solid('border')]; s.strokeLeftWeight = 1; s.strokeTopWeight = 0; s.strokeRightWeight = 0; s.strokeBottomWeight = 0; s.strokeAlign = 'INSIDE';
  await s.setEffectStyleIdAsync(await ES('Shadow/lg'));
  page.appendChild(s); s.x = 3000; s.y = 2400;
  const h = stack('header', s, 2); padX(h, 'spacing/4'); padY(h, 'spacing/4');
  await text('Menú', 'Body/Base Medium', 'foreground', h, { fill: true, name: 'title' });
  await text('Navegación lateral', 'Body/Small', 'muted-foreground', h, { fill: true, name: 'description' });
  s.description = 'Sheet (src/components/ui/sheet.tsx): panel lateral w-3/4 sm:max-w-sm (384), bg-popover, border-l, shadow-lg, gap-4, header y footer con p-4. SIN USO VISIBLE en la app: solo lo usa ui/sidebar en móvil, y la sidebar de la app se oculta por debajo de md. Se mantiene por paridad; para overlays de features, ResponsiveModal.';
  return { sheet: s.id, unbound: unboundPaints(s).length };
}

if (ARGS.part === 'doc') {
  const doc = await pageDoc(page, 'COMPONENTES · 04', 'Overlays', '');
  const cs = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'ResponsiveModal');
  const s = await docSection(doc, 'ResponsiveModal', [cs.description, 'Dialog y Drawer no existen aquí como componentes sueltos a propósito: son los dos renders de ResponsiveModal, igual que en el código las features nunca los importan.']);
  doc.insertChild(1, s);
  const g = gridLayout(cs, { viewport: ['mobile', 'desktop'], footer: ['default', 'sticky'] }, 'viewport', ['footer'], 40, 32, 72);
  await board(s, cs, g, 'ResponsiveModal · variantes');
  // Ejemplo en pantalla: overlay + bottom sheet (móvil) y overlay + diálogo (escritorio)
  const ex = stack('Ejemplo en pantalla', s, 32, 'HORIZONTAL'); ex.counterAxisAlignItems = 'MAX';
  for (const [vp, w, h] of [['mobile', 390, 780], ['desktop', 960, 640]]) {
    const scr = figma.createFrame(); scr.name = vp === 'mobile' ? 'Móvil · 390' : 'Escritorio · 960'; scr.resize(w, h); setPaints(scr, 'fills', [['background']]); rad(scr, 'radius/xl'); setPaints(scr, 'strokes', [['border']]); scr.clipsContent = true;
    ex.appendChild(scr);
    const ov = figma.createFrame(); ov.name = 'overlay'; ov.resize(w, h); setPaints(ov, 'fills', [['component/modal/overlay']]); ov.effects = [{ type: 'BACKGROUND_BLUR', radius: 4, visible: true }]; scr.appendChild(ov);
    const inst = cs.children.find((c) => c.name === `viewport=${vp}, footer=default`).createInstance(); scr.appendChild(inst);
    if (vp === 'mobile') { inst.x = 0; inst.y = h - inst.height; } else { inst.x = (w - inst.width) / 2; inst.y = (h - inst.height) / 2; }
  }
  const sh = page.findOne((n) => n.type === 'COMPONENT' && n.name === 'Sheet');
  const s2 = await docSection(doc, 'Sheet', [sh.description]); s2.appendChild(sh);
  return { doc: doc.id, order: doc.children.map((c) => c.name), unbound: unboundPaints(doc).length };
}
