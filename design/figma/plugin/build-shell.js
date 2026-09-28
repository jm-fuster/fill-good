// build-shell.js — Fase 5: el shell de la app (src/components/layout, stat-tile).
// ARGS.part: badge | bottomnav | fab | pageheader | content | header | appshell | doc-nav | doc-acciones | doc-contenido
const ES = async (n) => (await figma.getLocalEffectStylesAsync()).find((s) => s.name === n).id;
const NAV = [['Inventario', 'package'], ['Lista', 'shopping-cart'], ['Añadir ticket', 'scan-line', true], ['Menús', 'calendar-days'], ['Perfil', 'circle-user']];
async function setOf(pageName, name) { const p = figma.root.children.find((x) => x.name === pageName); await p.loadAsync(); const n = p.findOne((k) => (k.type === 'COMPONENT_SET' || k.type === 'COMPONENT') && k.name === name); if (!n) throw new Error('Falta ' + name); return n; }
const prop = (cs, p) => Object.keys((cs.type === 'COMPONENT_SET' ? cs : cs).componentPropertyDefinitions).find((k) => k.startsWith(p));
async function textStyle(name, family, style, sizeVar, lhVar, desc) {
  const ts = await figma.getLocalTextStylesAsync(); let s = ts.find((x) => x.name === name); if (!s) s = figma.createTextStyle();
  s.name = name; s.fontName = { family, style }; bind(s, 'fontSize', sizeVar); if (lhVar) bind(s, 'lineHeight', lhVar); bind(s, 'fontFamily', 'font-family/sans'); s.description = desc; __ts.push(s); return s;
}

if (ARGS.part === 'badge') {
  const page = await pageByName('03 · Navegación');
  const add = stager(page, 'staging · NavCountBadge');
  for (const variant of ['inline', 'floating']) {
    const c = comp('variant=' + variant); c.counterAxisSizingMode = 'FIXED'; c.resize(16, 16); bind(c, 'height', 'spacing/4'); bind(c, 'minWidth', 'spacing/4'); padX(c, 'spacing/1'); rad(c, 'radius/full');
    setPaints(c, 'fills', [['primary']]); if (variant === 'floating') await c.setEffectStyleIdAsync(await ES('Shadow/sm'));
    add(c);
    const t = await text('3', 'Caption/Medium', 'primary-foreground', c, { name: 'count' }); t.fontName = { family: 'Geist', style: 'SemiBold' }; bind(t, 'fontSize', 'font-size/arbitrary-10px'); t.lineHeight = { value: 100, unit: 'PERCENT' };
  }
  const { cs } = await combine(page, 'staging · NavCountBadge', 'NavCountBadge', { variant: ['inline', 'floating'] }, 'variant', [], 'NavCountBadge (src/components/layout/nav-count-badge.tsx): contador de pendientes de la lista. h-4, min-w-4, rounded-full, bg-primary, text-[10px] (FUERA DE ESCALA) font-semibold tabular-nums, «99+» como máximo. floating = sobre el icono de la bottom nav, con shadow-sm. Entra con zoom-in-50 y repite el pop en cada cambio de número.');
  const k = cs.addComponentProperty('count', 'TEXT', '3'); for (const c of cs.children) c.findOne((n) => n.name === 'count').componentPropertyReferences = { characters: k };
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'bottomnav') {
  const page = await pageByName('03 · Navegación');
  const badge = await setOf('03 · Navegación', 'NavCountBadge');
  // Item normal
  let add = stager(page, 'staging · BottomNav item');
  for (const st of ['default', 'hover', 'active']) {
    const c = comp('state=' + st, 'VERTICAL'); c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED'; c.resize(78, 64); bind(c, 'minHeight', 'spacing/12'); bind(c, 'itemSpacing', 'spacing/1');
    add(c);
    const col = st === 'active' ? 'primary' : st === 'hover' ? 'foreground' : 'muted-foreground';
    const wrap = figma.createFrame(); wrap.name = 'icon-wrap'; wrap.fills = []; wrap.clipsContent = false; wrap.resize(20, 20); c.appendChild(wrap);
    const ic = icon('package', 20, col, 'icon'); wrap.appendChild(ic); ic.x = 0; ic.y = 0;
    const b = badge.children.find((x) => x.name === 'variant=floating').createInstance(); b.name = 'badge'; wrap.appendChild(b); b.x = 10 + 6; b.y = -4; b.visible = false;
    await text('Inventario', 'Nav/Label', col, c, { name: 'label' });
  }
  let r = await combine(page, 'staging · BottomNav item', 'BottomNav · Item', { state: ['default', 'hover', 'active'] }, 'state', [], 'Destino de la bottom nav (src/components/layout/bottom-nav.tsx): columna de h-full y min-h-12 con icono de 20 px, gap-1 y label en text-[11px] font-medium (FUERA DE ESCALA). Activo = text-primary, sin fondo. El resaltado sigue a la navegación OPTIMISTA (se activa al tocar) y aria-current a la ruta real. El contador de Lista es NavCountBadge floating, anclado arriba a la derecha del icono.');
  const item = r.cs;
  const kl = item.addComponentProperty('label', 'TEXT', 'Inventario'), ki = item.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('package').id), kb = item.addComponentProperty('badge', 'BOOLEAN', false);
  for (const c of item.children) { c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: kl }; c.findOne((n) => n.name === 'icon').componentPropertyReferences = { mainComponent: ki }; c.findOne((n) => n.name === 'badge').componentPropertyReferences = { visible: kb }; }
  // Item principal (Añadir ticket): círculo flotante
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === 'BottomNav · Primary')) n.remove();
  const p = figma.createComponent(); p.name = 'BottomNav · Primary'; p.layoutMode = 'VERTICAL'; p.primaryAxisSizingMode = 'FIXED'; p.counterAxisSizingMode = 'FIXED'; p.resize(78, 64); p.primaryAxisAlignItems = 'MAX'; p.counterAxisAlignItems = 'CENTER'; p.fills = []; p.clipsContent = false; bind(p, 'paddingBottom', 'spacing/1_5');
  page.appendChild(p); p.x = 3000; p.y = 600;
  const circle = figma.createFrame(); circle.name = 'button'; circle.layoutMode = 'HORIZONTAL'; circle.primaryAxisAlignItems = 'CENTER'; circle.counterAxisAlignItems = 'CENTER'; circle.resize(56, 56); circle.primaryAxisSizingMode = 'FIXED'; circle.counterAxisSizingMode = 'FIXED'; bind(circle, 'width', 'spacing/14'); bind(circle, 'height', 'spacing/14'); rad(circle, 'radius/full'); setPaints(circle, 'fills', [['primary']]); await circle.setEffectStyleIdAsync(await ES('Shadow/lg')); circle.clipsContent = false;
  p.appendChild(circle); circle.layoutPositioning = 'ABSOLUTE'; circle.x = 11; circle.y = -20; circle.constraints = { horizontal: 'CENTER', vertical: 'MIN' };
  circle.appendChild(icon('scan-line', 24, 'primary-foreground', 'icon'));
  const pl = await text('Añadir ticket', 'Nav/Label', 'muted-foreground', p, { name: 'label' }); pl.textAlignHorizontal = 'CENTER';
  p.description = 'El destino principal de la bottom nav (primary en nav-items.ts, hoy «Añadir ticket»): círculo de 56 px (size-14) bg-primary con shadow-lg que sobresale 20 px por encima de la barra (-top-5), icono de 24 px. El label va abajo en muted-foreground y el nombre accesible es el aria-label del círculo. Solo en móvil: en la sidebar de escritorio este destino se ve como los demás.';
  // Barra
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === 'BottomNav')) n.remove();
  const bar = figma.createComponent(); bar.name = 'BottomNav'; bar.layoutMode = 'VERTICAL'; bar.primaryAxisSizingMode = 'AUTO'; bar.counterAxisSizingMode = 'FIXED'; bar.resize(390, 100); bar.primaryAxisSizingMode = 'AUTO'; bar.itemSpacing = 0; bar.clipsContent = false;
  setPaints(bar, 'fills', [['background', 0.95]]); bar.effects = [{ type: 'BACKGROUND_BLUR', radius: 8, visible: true }];
  bar.strokes = [solid('border')]; bar.strokeTopWeight = 1; bar.strokeBottomWeight = 0; bar.strokeLeftWeight = 0; bar.strokeRightWeight = 0; bar.strokeAlign = 'INSIDE';
  page.appendChild(bar); bar.x = 3000; bar.y = 800;
  const row = stack('items', bar, 0, 'HORIZONTAL'); row.layoutSizingVertical = 'FIXED'; row.resize(390, 64); bind(row, 'height', 'spacing/16');
  NAV.forEach(([label, ic, primary], i) => {
    const inst = primary ? p.createInstance() : item.children.find((c) => c.name === `state=${i === 0 ? 'active' : 'default'}`).createInstance();
    row.appendChild(inst); inst.layoutGrow = 1; inst.layoutSizingVertical = 'FILL';
    if (!primary) inst.setProperties({ [kl]: label, [ki]: iconComp(ic).id, [kb]: label === 'Lista' });
  });
  const safe = figma.createFrame(); safe.name = 'safe-area (pb-safe)'; safe.fills = []; safe.resize(390, 34); bar.appendChild(safe); safe.layoutSizingHorizontal = 'FILL';
  bar.description = 'BottomNav: navegación principal por debajo de md (md:hidden). fixed bottom-0, border-t, bg-background/95 con backdrop-blur-sm y pb-safe (aquí 34 px, la barra de gestos de un iPhone). Rejilla de 5 columnas de 64 px (h-16) y max-w-lg, con los mismos destinos que AppSidebar. El FAB se apoya 1 rem por encima (bottom-fab).';
  return { item: item.id, primary: p.id, bar: bar.id, unbound: unboundPaints(bar).length + unboundPaints(item).length + unboundPaints(p).length };
}

if (ARGS.part === 'fab') {
  const page = await pageByName('01 · Acciones');
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === 'FAB')) n.remove();
  const f = figma.createComponent(); f.name = 'FAB'; f.layoutMode = 'HORIZONTAL'; f.primaryAxisAlignItems = 'CENTER'; f.counterAxisAlignItems = 'CENTER'; f.resize(56, 56); f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED'; f.clipsContent = false;
  bind(f, 'width', 'spacing/14'); bind(f, 'height', 'spacing/14'); rad(f, 'radius/full'); setPaints(f, 'fills', [['primary']]); await f.setEffectStyleIdAsync(await ES('Shadow/lg'));
  page.appendChild(f); f.x = 3000; f.y = 1800;
  f.appendChild(icon('plus', 24, 'primary-foreground', 'icon'));
  const k = f.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('plus').id); f.findOne((n) => n.name === 'icon').componentPropertyReferences = { mainComponent: k };
  f.description = 'FAB (src/components/layout/fab.tsx + fabButtonClass): un Button por defecto con size-14 (56 px), rounded-full, shadow-lg, active:scale-95 e icono de 24 px. Solo en móvil: en escritorio la misma acción es un botón en el header y abre el MISMO modal. Posición (utilidades de globals.css): bottom-fab = safe + 4 rem + 1 rem sobre la bottom nav; bottom-fab-over-bar cuando hay una barra de acción encima; bottom-fab-flush y bottom-fab-stacked en el modo compra. La lista reserva pb-fab al final para que nunca tape la última tarjeta. Lleva siempre aria-label.';
  return { fab: f.id, unbound: unboundPaints(f).length };
}

if (ARGS.part === 'pageheader') {
  const page = await pageByName('03 · Navegación');
  const ib = await setOf('01 · Acciones', 'Button · Icon');
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === 'PageHeader')) n.remove();
  const h = figma.createComponent(); h.name = 'PageHeader'; h.layoutMode = 'VERTICAL'; h.primaryAxisSizingMode = 'AUTO'; h.counterAxisSizingMode = 'FIXED'; h.resize(358, 100); h.primaryAxisSizingMode = 'AUTO'; h.fills = []; h.itemSpacing = 0; h.clipsContent = false;
  bind(h, 'paddingBottom', 'spacing/6'); // mb-6
  page.appendChild(h); h.x = 3000; h.y = 1000;
  const back = stack('back', h, 4, 'HORIZONTAL'); back.layoutSizingHorizontal = 'HUG'; back.counterAxisAlignItems = 'CENTER'; back.layoutSizingVertical = 'FIXED'; back.resize(back.width, 44); bind(back, 'height', 'spacing/11'); bind(back, 'paddingBottom', 'spacing/0');
  back.appendChild(icon('arrow-left', 16, 'muted-foreground', 'icon'));
  await text('Volver', 'Body/Small', 'muted-foreground', back, { name: 'back-label' });
  back.visible = false;
  const row = stack('row', h, 16, 'HORIZONTAL'); row.counterAxisAlignItems = 'MIN';
  const titles = stack('titles', row, 4); titles.layoutSizingHorizontal = 'FILL';
  await text('Inventario', 'Title/Page', 'foreground', titles, { fill: true, name: 'title' });
  await text('Lo que hay en casa, por ubicación.', 'Body/Small', 'muted-foreground', titles, { fill: true, name: 'description' });
  const act = ib.children.find((c) => c.name === 'variant=outline, size=icon, state=default').createInstance(); act.name = 'action'; row.appendChild(act); act.visible = false;
  const K = { t: h.addComponentProperty('title', 'TEXT', 'Inventario'), d: h.addComponentProperty('description', 'TEXT', 'Lo que hay en casa, por ubicación.'), sd: h.addComponentProperty('show description', 'BOOLEAN', true), b: h.addComponentProperty('back', 'BOOLEAN', false), bl: h.addComponentProperty('back label', 'TEXT', 'Volver'), a: h.addComponentProperty('action', 'BOOLEAN', false), as: h.addComponentProperty('action ↳', 'INSTANCE_SWAP', (await act.getMainComponentAsync()).id) };
  h.findOne((n) => n.name === 'title').componentPropertyReferences = { characters: K.t };
  h.findOne((n) => n.name === 'description').componentPropertyReferences = { characters: K.d, visible: K.sd };
  back.componentPropertyReferences = { visible: K.b }; h.findOne((n) => n.name === 'back-label').componentPropertyReferences = { characters: K.bl };
  act.componentPropertyReferences = { visible: K.a, mainComponent: K.as };
  h.description = 'PageHeader (src/components/layout/page-header.tsx): título de página en font-heading text-2xl font-semibold tracking-tight (Title/Page) y descripción opcional en text-sm muted-foreground. Opcionales: enlace «Volver» arriba (min-h-11, flecha de 16 px) y una acción a la derecha (en escritorio, aquí va la acción primaria que en móvil es el FAB). Deja mb-6 debajo. El avatar opcional (perfil) no se modela.';
  return { header: h.id, unbound: unboundPaints(h).length };
}

if (ARGS.part === 'content') {
  const page = await pageByName('05 · Contenido');
  await textStyle('Title/Base', 'Geist', 'SemiBold', 'font-size/base', 'line-height/base', 'text-base font-semibold · título de EmptyState');
  const btn = await setOf('01 · Acciones', 'Button');
  // EmptyState
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === 'EmptyState')) n.remove();
  const e = figma.createComponent(); e.name = 'EmptyState'; e.layoutMode = 'VERTICAL'; e.counterAxisAlignItems = 'CENTER'; e.primaryAxisSizingMode = 'AUTO'; e.counterAxisSizingMode = 'FIXED'; e.resize(358, 100); e.primaryAxisSizingMode = 'AUTO'; e.itemSpacing = 0; e.clipsContent = false;
  padX(e, 'spacing/6'); padY(e, 'spacing/16'); rad(e, 'radius/xl'); setPaints(e, 'strokes', [['border']]); e.strokeWeight = 1; e.strokeAlign = 'INSIDE'; e.dashPattern = [4, 4]; e.fills = [];
  page.appendChild(e); e.x = 3000; e.y = 1400;
  const circle = figma.createFrame(); circle.name = 'icon-circle'; circle.layoutMode = 'HORIZONTAL'; circle.primaryAxisAlignItems = 'CENTER'; circle.counterAxisAlignItems = 'CENTER'; circle.resize(48, 48); circle.primaryAxisSizingMode = 'FIXED'; circle.counterAxisSizingMode = 'FIXED'; rad(circle, 'radius/full'); setPaints(circle, 'fills', [['accent']]); e.appendChild(circle);
  circle.appendChild(icon('package', 24, 'accent-foreground', 'icon'));
  const sp1 = figma.createFrame(); sp1.name = 'mb-4'; sp1.fills = []; sp1.resize(1, 16); e.appendChild(sp1); e.insertChild(1, sp1);
  const t = await text('Aún no hay productos', 'Title/Base', 'foreground', e, { name: 'title' }); t.textAlignHorizontal = 'CENTER';
  const d = await text('Escanea un ticket o añade lo que tengas en casa.', 'Body/Small', 'muted-foreground', e, { name: 'description' }); d.textAlignHorizontal = 'CENTER'; d.layoutSizingHorizontal = 'FILL'; d.textAutoResize = 'HEIGHT';
  const gap = figma.createFrame(); gap.name = 'mt-6'; gap.fills = []; gap.resize(1, 24); e.appendChild(gap);
  const a = btn.children.find((c) => c.name === 'variant=default, size=default, state=default').createInstance(); a.name = 'action'; e.appendChild(a); a.setProperties({ [prop(btn, 'label')]: 'Añadir producto' });
  const KE = { t: e.addComponentProperty('title', 'TEXT', 'Aún no hay productos'), d: e.addComponentProperty('description', 'TEXT', 'Escanea un ticket o añade lo que tengas en casa.'), i: e.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('package').id), a: e.addComponentProperty('action', 'BOOLEAN', true) };
  t.componentPropertyReferences = { characters: KE.t }; d.componentPropertyReferences = { characters: KE.d }; e.findOne((n) => n.name === 'icon').componentPropertyReferences = { mainComponent: KE.i }; a.componentPropertyReferences = { visible: KE.a }; gap.componentPropertyReferences = { visible: KE.a };
  e.description = 'EmptyState (src/components/layout/empty-state.tsx): rounded-xl con borde discontinuo, px-6 py-16, centrado. Icono de 24 px en un círculo de 48 bg-accent (entra con zoom-in-75), título text-base font-semibold, descripción text-sm muted-foreground (max-w-sm) y acción opcional con mt-6.';
  // StatTile
  const add = stager(page, 'staging · StatTile');
  for (const accent of ['none', 'success', 'warning', 'price']) {
    const c = comp('accent=' + accent, 'VERTICAL'); c.primaryAxisAlignItems = 'MIN'; c.counterAxisAlignItems = 'MIN'; c.counterAxisSizingMode = 'FIXED'; c.resize(170, 10); c.primaryAxisSizingMode = 'AUTO';
    bind(c, 'itemSpacing', 'spacing/1'); padX(c, 'spacing/3'); padY(c, 'spacing/3'); rad(c, 'radius/xl'); setPaints(c, 'strokes', [['border']]); c.strokeWeight = 1; c.strokeAlign = 'INSIDE';
    add(c);
    const lr = stack('label', c, 6, 'HORIZONTAL'); lr.counterAxisAlignItems = 'CENTER';
    lr.appendChild(icon('piggy-bank', 14, 'muted-foreground', 'icon'));
    await text('Ahorro del mes', 'Caption/Default', 'muted-foreground', lr, { name: 'label-text' });
    const v = await text('12,40 €', 'Title/Section', { none: 'foreground', success: 'success', warning: 'warning', price: 'price' }[accent], c, { name: 'value' });
    const hnt = await text('Frente al precio habitual', 'Caption/Default', 'muted-foreground', c, { fill: true, name: 'hint' });
  }
  const r = await combine(page, 'staging · StatTile', 'StatTile', { accent: ['none', 'success', 'warning', 'price'] }, 'accent', [], 'StatTile (src/components/stat-tile.tsx): rounded-xl, border, p-3, gap-1. Label en text-xs muted-foreground con icono de 14 px; valor en text-lg font-semibold tabular-nums; pista opcional en text-xs. accent pinta el valor y se llama como el token que usa: success, warning o price (el acento de precios como TEXTO; chart-3 no llega a AA como texto en claro).');
  const KS = { l: r.cs.addComponentProperty('label', 'TEXT', 'Ahorro del mes'), v: r.cs.addComponentProperty('value', 'TEXT', '12,40 €'), h: r.cs.addComponentProperty('hint', 'BOOLEAN', true), ht: r.cs.addComponentProperty('hint text', 'TEXT', 'Frente al precio habitual'), i: r.cs.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('piggy-bank').id) };
  for (const c of r.cs.children) { c.findOne((n) => n.name === 'label-text').componentPropertyReferences = { characters: KS.l }; c.findOne((n) => n.name === 'value').componentPropertyReferences = { characters: KS.v }; c.findOne((n) => n.name === 'hint').componentPropertyReferences = { visible: KS.h, characters: KS.ht }; c.findOne((n) => n.name === 'icon').componentPropertyReferences = { mainComponent: KS.i }; }
  return { empty: e.id, stat: r.cs.id, unbound: unboundPaints(e).length + unboundPaints(r.cs).length };
}

if (ARGS.part === 'header') {
  const page = await pageByName('03 · Navegación');
  for (const n of page.findAll((n) => n.type === 'COMPONENT' && n.name === 'AppHeader')) n.remove();
  const h = figma.createComponent(); h.name = 'AppHeader'; h.layoutMode = 'HORIZONTAL'; h.counterAxisAlignItems = 'CENTER'; h.primaryAxisSizingMode = 'FIXED'; h.counterAxisSizingMode = 'FIXED'; h.resize(1024, 56); bind(h, 'height', 'spacing/14'); padX(h, 'spacing/4'); bind(h, 'itemSpacing', 'spacing/2'); h.clipsContent = false;
  setPaints(h, 'fills', [['background', 0.95]]); h.effects = [{ type: 'BACKGROUND_BLUR', radius: 8, visible: true }];
  h.strokes = [solid('border')]; h.strokeBottomWeight = 1; h.strokeTopWeight = 0; h.strokeLeftWeight = 0; h.strokeRightWeight = 0; h.strokeAlign = 'INSIDE';
  page.appendChild(h); h.x = 3000; h.y = 1300;
  const trig = stack('CommandPalette trigger', h, 8, 'HORIZONTAL'); trig.layoutSizingHorizontal = 'HUG'; trig.counterAxisAlignItems = 'CENTER'; trig.layoutSizingVertical = 'FIXED'; trig.resize(trig.width, 36); bind(trig, 'height', 'spacing/9'); padX(trig, 'spacing/3'); rad(trig, 'radius/lg');
  setPaints(trig, 'fills', [['input', 0.3]]); border(trig, 'input', 1);
  trig.appendChild(icon('search', 16, 'muted-foreground', 'icon'));
  await text('Buscar…', 'Body/Small', 'muted-foreground', trig);
  const kbd = stack('kbd', trig, 0, 'HORIZONTAL'); kbd.layoutSizingHorizontal = 'HUG'; setPaints(kbd, 'fills', [['background']]); setPaints(kbd, 'strokes', [['border']]); kbd.strokeWeight = 1; kbd.cornerRadius = 4; kbd.paddingLeft = kbd.paddingRight = 6; kbd.paddingTop = kbd.paddingBottom = 2; bind(kbd, 'paddingLeft', 'spacing/1_5'); bind(kbd, 'paddingRight', 'spacing/1_5'); bind(kbd, 'paddingTop', 'spacing/0_5'); bind(kbd, 'paddingBottom', 'spacing/0_5');
  const kt = await text('Ctrl K', 'Caption/Medium', 'muted-foreground', kbd); bind(kt, 'fontSize', 'font-size/arbitrary-10px');
  trig.itemSpacing = 8; kbd.layoutPositioning = 'AUTO';
  const spacer = figma.createFrame(); spacer.name = 'spacer'; spacer.fills = []; spacer.resize(1, 1); h.appendChild(spacer); spacer.layoutGrow = 1;
  const hs = stack('HouseholdSwitcher', h, 6, 'HORIZONTAL'); hs.layoutSizingHorizontal = 'HUG'; hs.counterAxisAlignItems = 'CENTER'; padX(hs, 'spacing/3'); hs.layoutSizingVertical = 'FIXED'; hs.resize(hs.width, 36); rad(hs, 'radius/lg');
  hs.appendChild(icon('house', 16, 'foreground', 'icon')); await text('Casa', 'Body/Small Medium', 'foreground', hs); hs.appendChild(icon('chevrons-up-down', 16, 'muted-foreground', 'chevron'));
  const k = h.addComponentProperty('household switcher', 'BOOLEAN', true); hs.componentPropertyReferences = { visible: k };
  h.description = 'Cabecera de escritorio del AppShell (src/components/layout/app-shell.tsx): solo desde md, sticky top-0, h-14, border-b, bg-background/95 con backdrop-blur-sm y px-4. A la izquierda el disparador de la paleta de comandos (h-9, border-input, bg-input/30, «Buscar…» y la tecla ⌘/Ctrl K en text-[10px]); a la derecha el selector de hogar, que solo aparece si perteneces a más de uno. El toggle de la sidebar vive en la propia sidebar.';
  return { header: h.id, unbound: unboundPaints(h).length };
}

if (ARGS.part === 'appshell') {
  const page = await pageByName('03 · Navegación');
  const bar = await setOf('03 · Navegación', 'BottomNav');
  const side = await setOf('03 · Navegación', 'AppSidebar');
  const header = await setOf('03 · Navegación', 'AppHeader');
  const ph = await setOf('03 · Navegación', 'PageHeader');
  const fab = await setOf('01 · Acciones', 'FAB');
  const add = stager(page, 'staging · AppShell');
  for (const viewport of ['mobile', 'desktop']) {
    const mob = viewport === 'mobile';
    const W = mob ? 390 : 1280, H = mob ? 844 : 800;
    const c = figma.createComponent(); c.name = 'viewport=' + viewport; c.resize(W, H); c.clipsContent = true; setPaints(c, 'fills', [['background']]);
    add(c);
    const bpCol = (await figma.variables.getLocalVariableCollectionsAsync()).find((x) => x.name === 'Breakpoint');
    c.setExplicitVariableModeForCollection(bpCol, bpCol.modes[mob ? 0 : 1].modeId);
    if (mob) {
      const content = stack('contenido', null, 0); c.appendChild(content); content.x = 0; content.y = 0; content.resize(W, 10); content.layoutSizingVertical = 'HUG'; padX(content, 'spacing/4'); bind(content, 'paddingTop', 'spacing/4');
      const p = ph.createInstance(); content.appendChild(p); p.layoutSizingHorizontal = 'FILL';
      const slot = figma.createFrame(); slot.name = 'página'; slot.resize(358, 480); rad(slot, 'radius/xl'); setPaints(slot, 'strokes', [['border']]); slot.dashPattern = [6, 4]; setPaints(slot, 'fills', [['muted', 0.5]]); content.appendChild(slot); slot.layoutSizingHorizontal = 'FILL';
      const b = bar.createInstance(); c.appendChild(b); b.x = 0; b.y = H - b.height; b.constraints = { horizontal: 'STRETCH', vertical: 'MAX' };
      const f = fab.createInstance(); c.appendChild(f); f.x = W - 16 - 56; f.y = H - 34 - 64 - 16 - 56; f.constraints = { horizontal: 'MAX', vertical: 'MAX' };
    } else {
      const s = side.children.find((x) => x.name === 'state=expanded').createInstance(); c.appendChild(s); s.x = 0; s.y = 0; s.resize(256, H);
      const hd = header.createInstance(); c.appendChild(hd); hd.x = 256; hd.y = 0; hd.resize(W - 256, 56);
      const content = stack('contenido', null, 0); c.appendChild(content); content.x = 256; content.y = 56; content.resize(W - 256, 10); content.layoutSizingVertical = 'HUG'; padX(content, 'spacing/8'); bind(content, 'paddingTop', 'spacing/4'); content.counterAxisAlignItems = 'CENTER';
      const pc = stack('PageContainer', content, 0); pc.layoutSizingHorizontal = 'FIXED'; pc.resize(W - 256 - 64, pc.height); // 960: lo que cabe junto a la sidebar (el tope xl de 1152 no llega a aplicarse)
      const p = ph.createInstance(); pc.appendChild(p); p.layoutSizingHorizontal = 'FILL';
      const slot = figma.createFrame(); slot.name = 'página'; slot.resize(960, 520); rad(slot, 'radius/xl'); setPaints(slot, 'strokes', [['border']]); slot.dashPattern = [6, 4]; setPaints(slot, 'fills', [['muted', 0.5]]); pc.appendChild(slot); slot.layoutSizingHorizontal = 'FILL';
    }
  }
  const { cs } = await combine(page, 'staging · AppShell', 'AppShell', { viewport: ['mobile', 'desktop'] }, 'viewport', [], 'AppShell (src/components/layout/app-shell.tsx): UN solo árbol que se adapta en md. Móvil (< md): contenido con px-4 pt-4 y pb-28 para no quedar bajo la bottom nav, bottom nav fija y FAB 1 rem por encima (bottom-fab). Escritorio (≥ md): AppSidebar colapsable, AppHeader sticky de 56 px y contenido con md:px-8 dentro de PageContainer (un único ancho en la app: 768 en md, 1024 en lg, 1152 en xl). Bottom nav y sidebar conviven en el código y se alternan solo con CSS, nunca con useIsMobile. Cada variante fija el modo de la colección Breakpoint, así que Input y Textarea toman aquí su tamaño de texto correcto.');
  return { set: cs.id, unbound: unboundPaints(cs).length };
}

async function docTo(pageName, entries) {
  const page = await pageByName(pageName);
  const doc = await pageDoc(page, '', '', '');
  const out = [];
  for (const [name, axes, colAxis, rowAxes] of entries) {
    const node = page.findOne((n) => (n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent.type !== 'COMPONENT_SET')) && n.name === name);
    if (!node) { out.push(name + ': falta'); continue; }
    const s = await docSection(doc, name, [node.description]);
    if (node.type === 'COMPONENT_SET') { const g = gridLayout(node, axes, colAxis, rowAxes, 40, 32, 72); await board(s, node, rowAxes.length ? g : { ...g, rows: [name] }, name + ' · variantes'); } else s.appendChild(node);
    out.push(name);
  }
  return { doc: doc.id, out, order: doc.children.map((c) => c.name), unbound: unboundPaints(doc).length };
}
if (ARGS.part === 'doc-nav') return await docTo('03 · Navegación', [['AppShell', { viewport: ['mobile', 'desktop'] }, null, ['viewport']], ['BottomNav'], ['BottomNav · Item', { state: ['default', 'hover', 'active'] }, 'state', []], ['BottomNav · Primary'], ['NavCountBadge', { variant: ['inline', 'floating'] }, 'variant', []], ['AppHeader'], ['PageHeader']]);
if (ARGS.part === 'doc-acciones') return await docTo('01 · Acciones', [['FAB']]);
if (ARGS.part === 'doc-contenido') return await docTo('05 · Contenido', [['EmptyState'], ['StatTile', { accent: ['none', 'success', 'warning', 'price'] }, 'accent', []]]);
