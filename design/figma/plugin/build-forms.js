// build-forms.js — P4.c en 02 · Formularios. ARGS.part: input|textarea|checkbox|switch|select-trigger|select-menu|doc
const page = await pageByName('02 · Formularios');
const STATES = ['default', 'focus', 'disabled', 'invalid'];
const borderFor = (st) => st === 'focus' ? 'ring' : st === 'invalid' ? 'component/input/border-invalid' : 'input';
const ringFor = (st) => st === 'focus' ? 'effect/ring-50' : st === 'invalid' ? 'effect/destructive-ring' : null;

async function field(kind) {
  const add = stager(page, 'staging · ' + kind);
  for (const st of STATES) for (const filled of ['false', 'true']) {
    const c = comp(`state=${st}, filled=${filled}`, kind === 'Textarea' ? 'VERTICAL' : 'HORIZONTAL');
    c.primaryAxisAlignItems = kind === 'Textarea' ? 'MIN' : 'MIN'; c.counterAxisAlignItems = kind === 'Textarea' ? 'MIN' : 'CENTER';
    c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED';
    if (kind === 'Input') { c.resize(320, 44); bind(c, 'height', 'spacing/11'); padX(c, 'spacing/3'); padY(c, 'spacing/1'); }
    else { c.resize(320, 80); padX(c, 'spacing/2_5'); padY(c, 'spacing/2'); }
    rad(c, 'radius/lg'); border(c, borderFor(st), 1);
    setPaints(c, 'fills', [[st === 'disabled' ? 'component/input/bg-disabled' : 'component/input/bg']]);
    if (st === 'disabled') c.opacity = 0.5;
    add(c);
    const val = kind === 'Input' ? (filled === 'true' ? (st === 'invalid' ? '-3' : 'Leche entera') : 'p. ej. Leche entera') : (filled === 'true' ? 'Comprar la de la marca del súper, la otra sube cada mes.' : 'Notas para la lista');
    const t = await text(val, 'Body/Base', filled === 'true' ? 'foreground' : 'muted-foreground', c, { name: filled === 'true' ? 'value' : 'placeholder' });
    bind(t, 'fontSize', 'input/font-size');
    t.layoutSizingHorizontal = 'FILL'; if (kind === 'Textarea') t.textAutoResize = 'HEIGHT';
    const r = ringFor(st); if (r) focusRing(c, r, 'radius/lg');
  }
  const desc = kind === 'Input'
    ? 'Input (src/components/ui/input.tsx): h-11 (44 px), rounded-lg, border-input, px-3. Texto text-base en móvil y md:text-sm desde md, para que iOS no haga zoom: el tamaño va enlazado a input/font-size (colección Breakpoint), así que cambia al poner la pantalla en modo Desktop. Fondo transparente en claro, input/30 en oscuro. invalid = aria-invalid: borde destructive y ring-3 destructive/20 (/40 en oscuro), también sin foco.'
    : 'Textarea (src/components/ui/textarea.tsx): min-h-16, field-sizing-content (crece con el texto), px-2.5 py-2, mismos estados y tamaño de texto que Input.';
  const { cs } = await combine(page, 'staging · ' + kind, kind, { state: STATES, filled: ['false', 'true'] }, 'state', ['filled'], desc);
  // placeholder y value son dos cosas distintas en código: dos propiedades
  const kp = cs.addComponentProperty('placeholder', 'TEXT', kind === 'Input' ? 'p. ej. Leche entera' : 'Notas para la lista');
  const kv = cs.addComponentProperty('value', 'TEXT', kind === 'Input' ? 'Leche entera' : 'Comprar la de la marca del súper, la otra sube cada mes.');
  for (const c of cs.children) { const p = c.findOne((n) => n.name === 'placeholder'); if (p) p.componentPropertyReferences = { characters: kp }; const v = c.findOne((n) => n.name === 'value'); if (v) v.componentPropertyReferences = { characters: kv }; }
  return cs;
}

if (ARGS.part === 'input') { const cs = await field('Input'); return { set: cs.id, n: cs.children.length, unbound: unboundPaints(cs).length }; }
if (ARGS.part === 'textarea') { const cs = await field('Textarea'); return { set: cs.id, n: cs.children.length, unbound: unboundPaints(cs).length }; }

if (ARGS.part === 'checkbox') {
  const add = stager(page, 'staging · Checkbox');
  for (const st of ['default', 'focus', 'disabled', 'invalid']) for (const checked of ['false', 'true']) {
    const c = figma.createComponent(); c.name = `state=${st}, checked=${checked}`; c.resize(16, 16);
    c.layoutMode = 'HORIZONTAL'; c.primaryAxisAlignItems = 'CENTER'; c.counterAxisAlignItems = 'CENTER'; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED'; c.clipsContent = false;
    c.cornerRadius = 4; // rounded-[4px]: valor arbitrario del código, sin token
    const on = checked === 'true';
    border(c, st === 'focus' ? 'ring' : st === 'invalid' && !on ? 'component/input/border-invalid' : on ? 'primary' : 'input', 1);
    setPaints(c, 'fills', [[on ? 'primary' : 'component/input/bg']]);
    if (st === 'disabled') c.opacity = 0.5;
    add(c);
    if (on) c.appendChild(icon('check', 14, 'primary-foreground', 'indicator'));
    const r = st === 'focus' ? 'effect/ring-50' : st === 'invalid' ? 'effect/destructive-ring' : null;
    if (r) { const ring = focusRing(c, r, null); ring.cornerRadius = 4; }
  }
  const { cs } = await combine(page, 'staging · Checkbox', 'Checkbox', { state: ['default', 'focus', 'disabled', 'invalid'], checked: ['false', 'true'] }, 'state', ['checked'], 'Checkbox (src/components/ui/checkbox.tsx): 16 px, rounded-[4px] (arbitrario, sin token), border-input; marcado = bg-primary con check de 14 px. El área táctil se amplía en código con un pseudo-elemento (after:-inset-x-3 after:-inset-y-2): el cuadro mide 16 px pero se toca en 40 × 32. Va siempre con Label al lado (gap-3).');
  return { set: cs.id, n: cs.children.length, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'switch') {
  await compVar('component/switch/track-off', aliasOf('input'), tint('input', '4:2', 0.8), ['FRAME_FILL', 'SHAPE_FILL'], 'data-unchecked:bg-input dark:data-unchecked:bg-input/80', 'Switch apagado: pista. Claro = input; oscuro = input al 80 %.');
  await compVar('component/switch/thumb-on', aliasOf('background'), aliasOf('primary-foreground'), ['FRAME_FILL', 'SHAPE_FILL'], 'bg-background dark:data-checked:bg-primary-foreground', 'Switch encendido: botón. Claro = background; oscuro = primary-foreground.');
  await compVar('component/switch/thumb-off', aliasOf('background'), aliasOf('foreground'), ['FRAME_FILL', 'SHAPE_FILL'], 'bg-background dark:data-unchecked:bg-foreground', 'Switch apagado: botón. Claro = background; oscuro = foreground.');
  const add = stager(page, 'staging · Switch');
  const SZ = { default: { w: 'spacing/8', h: 18.4, t: 16 }, sm: { w: 'spacing/6', h: 14, t: 12 } };
  for (const [size, s] of Object.entries(SZ)) for (const st of ['default', 'focus', 'disabled']) for (const checked of ['false', 'true']) {
    const on = checked === 'true';
    const c = figma.createComponent(); c.name = `size=${size}, state=${st}, checked=${checked}`;
    c.layoutMode = 'HORIZONTAL'; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED'; c.counterAxisAlignItems = 'CENTER'; c.primaryAxisAlignItems = on ? 'MAX' : 'MIN'; c.clipsContent = false;
    c.resize(size === 'default' ? 32 : 24, s.h); bind(c, 'width', s.w); if (size === 'sm') bind(c, 'height', 'spacing/3_5');
    rad(c, 'radius/full'); border(c, st === 'focus' ? 'ring' : null, 1);
    setPaints(c, 'fills', [[on ? 'primary' : 'component/switch/track-off']]);
    if (st === 'disabled') c.opacity = 0.5;
    add(c);
    const th = figma.createEllipse(); th.name = 'thumb'; th.resize(s.t, s.t); setPaints(th, 'fills', [[on ? 'component/switch/thumb-on' : 'component/switch/thumb-off']]); c.appendChild(th);
    if (st === 'focus') focusRing(c, 'effect/ring-50', 'radius/full');
  }
  const { cs } = await combine(page, 'staging · Switch', 'Switch', { size: ['default', 'sm'], state: ['default', 'focus', 'disabled'], checked: ['false', 'true'] }, 'state', ['size', 'checked'], 'Switch (src/components/ui/switch.tsx): default 32 × 18,4 px (alto arbitrario, sin token) y sm 24 × 14; botón de 16/12 px que se desplaza calc(100% − 2px). Encendido = bg-primary. En oscuro el botón cambia de color (primary-foreground encendido, foreground apagado): lo resuelven component/switch/*. Área táctil ampliada con after:-inset como en Checkbox.');
  return { set: cs.id, n: cs.children.length, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'select-trigger') {
  await compVar('component/input/bg-hover', { r: 1, g: 1, b: 1, a: 0 }, tint('input', '4:2', 0.5), ['FRAME_FILL', 'SHAPE_FILL'], 'dark:hover:bg-input/50', 'Select trigger en hover: sin cambio en claro, input al 50 % en oscuro.');
  const add = stager(page, 'staging · Select');
  for (const size of ['default', 'sm']) for (const st of ['default', 'hover', 'focus', 'disabled', 'invalid']) for (const filled of ['false', 'true']) {
    const c = comp(`size=${size}, state=${st}, filled=${filled}`);
    c.primaryAxisAlignItems = 'SPACE_BETWEEN'; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED';
    c.resize(240, size === 'default' ? 44 : 28); if (size === 'default') bind(c, 'height', 'spacing/11'); else bind(c, 'height', 'spacing/7');
    rad(c, size === 'default' ? 'radius/lg' : 'radius/md'); padX(c, 'spacing/3'); padY(c, size === 'default' ? 'spacing/2' : 'spacing/0'); bind(c, 'itemSpacing', 'spacing/1_5');
    border(c, st === 'focus' ? 'ring' : st === 'invalid' ? 'component/input/border-invalid' : 'input', 1);
    setPaints(c, 'fills', [[st === 'hover' ? 'component/input/bg-hover' : 'component/input/bg']]);
    if (st === 'disabled') c.opacity = 0.5;
    add(c);
    await text(filled === 'true' ? 'Nevera' : 'Elige una ubicación', 'Body/Small', filled === 'true' ? 'foreground' : 'muted-foreground', c, { name: filled === 'true' ? 'value' : 'placeholder' });
    c.appendChild(icon('chevron-down', 16, 'muted-foreground', 'chevron'));
    const r = ringFor(st); if (r) focusRing(c, r, size === 'default' ? 'radius/lg' : 'radius/md');
  }
  const { cs } = await combine(page, 'staging · Select', 'Select · Trigger', { size: ['default', 'sm'], state: ['default', 'hover', 'focus', 'disabled', 'invalid'], filled: ['false', 'true'] }, 'state', ['size', 'filled'], 'SelectTrigger (src/components/ui/select.tsx): h-11 (default) o h-7 (sm, rounded-md), border-input, px-3, text-sm, chevron de 16 px en muted-foreground. Sin valor = placeholder en muted-foreground. El menú es Select · Content.');
  const kp = cs.addComponentProperty('placeholder', 'TEXT', 'Elige una ubicación');
  const kv = cs.addComponentProperty('value', 'TEXT', 'Nevera');
  for (const c of cs.children) { const p = c.findOne((n) => n.name === 'placeholder'); if (p) p.componentPropertyReferences = { characters: kp }; const v = c.findOne((n) => n.name === 'value'); if (v) v.componentPropertyReferences = { characters: kv }; }
  return { set: cs.id, n: cs.children.length, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'select-menu') {
  // Item
  let add = stager(page, 'staging · Select item');
  for (const st of ['default', 'focus', 'selected', 'disabled']) {
    const c = comp('state=' + st); c.primaryAxisAlignItems = 'MIN'; c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'AUTO';
    c.resize(232, 44); bind(c, 'minHeight', 'spacing/11'); rad(c, 'radius/md');
    bind(c, 'paddingLeft', 'spacing/1_5'); bind(c, 'paddingRight', 'spacing/8'); padY(c, 'spacing/1'); bind(c, 'itemSpacing', 'spacing/1_5');
    setPaints(c, 'fills', st === 'focus' ? [['accent']] : []);
    if (st === 'disabled') c.opacity = 0.5;
    add(c);
    const t = await text('Nevera', 'Body/Small', st === 'focus' ? 'accent-foreground' : 'popover-foreground', c, { name: 'label' }); t.layoutSizingHorizontal = 'FILL';
    if (st === 'selected') { const ck = icon('check', 16, 'popover-foreground', 'indicator'); c.appendChild(ck); ck.layoutPositioning = 'ABSOLUTE'; ck.x = 232 - 8 - 16; ck.y = 14; ck.constraints = { horizontal: 'MAX', vertical: 'CENTER' }; }
  }
  let r = await combine(page, 'staging · Select item', 'Select · Item', { state: ['default', 'focus', 'selected', 'disabled'] }, 'state', [], 'SelectItem: min-h-11 (44 px, touch target), rounded-md, pl-1.5 pr-8, text-sm. focus = bg-accent. El check de la opción elegida va a la derecha (right-2). En móvil el menú nativo del sistema sustituye a este en algunos navegadores; el diseño manda en escritorio.');
  const itemSet = r.cs;
  const lk = itemSet.addComponentProperty('label', 'TEXT', 'Nevera');
  for (const c of itemSet.children) c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: lk };
  // Content (composición de instancias)
  const content = figma.createComponent(); content.name = 'Select · Content';
  content.layoutMode = 'VERTICAL'; content.primaryAxisSizingMode = 'AUTO'; content.counterAxisSizingMode = 'FIXED'; content.resize(240, 100); content.clipsContent = false;
  padX(content, 'spacing/1'); padY(content, 'spacing/1'); rad(content, 'radius/lg');
  setPaints(content, 'fills', [['popover']]); setPaints(content, 'strokes', [['foreground', 0.1]]); content.strokeWeight = 1; content.strokeAlign = 'INSIDE';
  await content.setEffectStyleIdAsync((await figma.getLocalEffectStylesAsync()).find((s) => s.name === 'Shadow/md').id);
  page.appendChild(content);
  const glabel = stack('label', content, 0); padX(glabel, 'spacing/1_5'); padY(glabel, 'spacing/1');
  await text('Ubicación', 'Caption/Default', 'muted-foreground', glabel, { fill: true });
  for (const [lab, st] of [['Despensa', 'default'], ['Nevera', 'selected'], ['Congelador', 'focus']]) {
    const i = itemSet.children.find((c) => c.name === 'state=' + st).createInstance(); content.appendChild(i); i.layoutSizingHorizontal = 'FILL'; i.setProperties({ [lk]: lab });
  }
  content.description = 'SelectContent: rounded-lg, bg-popover, shadow-md y ring-1 ring-foreground/10 (trazo interior al 10 %), p-1, min-w-36. Es una composición de Select · Item: para otras opciones, cambia los labels de las instancias.';
  content.x = 3000; content.y = 1400;
  return { item: itemSet.id, content: content.id, unbound: unboundPaints(content).length + unboundPaints(itemSet).length };
}

if (ARGS.part === 'doc') {
  const doc = await pageDoc(page, 'COMPONENTES · 02', 'Formularios', '');
  const sets = ['Input', 'Textarea', 'Checkbox', 'Switch', 'Select · Trigger', 'Select · Item'];
  const AX = {
    Input: [{ state: STATES, filled: ['false', 'true'] }, 'state', ['filled']],
    Textarea: [{ state: STATES, filled: ['false', 'true'] }, 'state', ['filled']],
    Checkbox: [{ state: STATES, checked: ['false', 'true'] }, 'state', ['checked']],
    Switch: [{ size: ['default', 'sm'], state: ['default', 'focus', 'disabled'], checked: ['false', 'true'] }, 'state', ['size', 'checked']],
    'Select · Trigger': [{ size: ['default', 'sm'], state: ['default', 'hover', 'focus', 'disabled', 'invalid'], filled: ['false', 'true'] }, 'state', ['size', 'filled']],
    'Select · Item': [{ state: ['default', 'focus', 'selected', 'disabled'] }, 'state', []],
  };
  for (const name of sets) {
    const cs = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === name);
    const s = await docSection(doc, name, [cs.description]);
    const [axes, colAxis, rowAxes] = AX[name];
    const g = gridLayout(cs, axes, colAxis, rowAxes, 24, 32, 72);
    await board(s, cs, rowAxes.length ? g : { ...g, rows: [name] }, name + ' · variantes');
    if (name === 'Select · Item') { const content = page.findOne((n) => n.type === 'COMPONENT' && n.name === 'Select · Content'); if (content) { s.appendChild(content); } }
  }
  // ejemplo de formulario como en /styleguide, claro y oscuro
  const col = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Color');
  const labelSet = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Label');
  const inputSet = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Input');
  const cbSet = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Checkbox');
  const selSet = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Select · Trigger');
  const P = (cs, p) => Object.keys(cs.componentPropertyDefinitions).find((k) => k.startsWith(p));
  const s = await docSection(doc, 'Ejemplo · como en /styleguide', ['La sección «Formularios» de /styleguide, con los componentes de arriba: labels visibles, campos de 44 px y el error con aria-describedby.']);
  const row = stack('ejemplo', s, 24, 'HORIZONTAL');
  for (const [mode, id] of [['Light', '4:1'], ['Dark', '4:2']]) {
    const c = stack(mode, row, 16); setPaints(c, 'fills', [['background']]); setPaints(c, 'strokes', [['border']]); rad(c, 'radius/xl'); c.paddingLeft = c.paddingRight = c.paddingTop = c.paddingBottom = 16;
    c.setExplicitVariableModeForCollection(col, id);
    const fieldG = async (lab, st, filled, value) => { const g = stack('campo', c, 8); const l = labelSet.children[0].createInstance(); g.appendChild(l); l.setProperties({ [P(labelSet, 'label')]: lab }); const i = inputSet.children.find((x) => x.name === `state=${st}, filled=${filled}`).createInstance(); g.appendChild(i); i.layoutSizingHorizontal = 'FILL'; if (value) i.setProperties({ [P(inputSet, 'value')]: value }); return g; };
    await fieldG('Nombre del producto', 'default', 'false');
    const g2 = await fieldG('Cantidad (con error)', 'invalid', 'true', '-3'); await text('La cantidad no puede ser negativa.', 'Body/Small', 'destructive', g2, { fill: true });
    const cb = stack('check', c, 12, 'HORIZONTAL'); cb.counterAxisAlignItems = 'CENTER'; cb.appendChild(cbSet.children.find((x) => x.name === 'state=default, checked=true').createInstance()); const l = labelSet.children[0].createInstance(); cb.appendChild(l); l.setProperties({ [P(labelSet, 'label')]: 'Comprado' });
    const g3 = stack('select', c, 8); const l3 = labelSet.children[0].createInstance(); g3.appendChild(l3); l3.setProperties({ [P(labelSet, 'label')]: 'Ubicación' }); const si = selSet.children.find((x) => x.name === 'size=default, state=default, filled=true').createInstance(); g3.appendChild(si); si.layoutSizingHorizontal = 'FILL';
  }
  return { doc: doc.id, unbound: unboundPaints(doc).length };
}
