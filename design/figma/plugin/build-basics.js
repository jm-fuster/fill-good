// build-basics.js — P4.b: Label (02 · Formularios) · Separator, Skeleton, Badge (05 · Contenido)
// ARGS.part: 'tokens' | 'label' | 'contenido'
if (ARGS.part === 'tokens') {
  // Los tintes de destructive los comparten Button y Badge: nombre neutro
  const ren = [['component/button/destructive-bg', 'component/destructive/bg'], ['component/button/destructive-bg-hover', 'component/destructive/bg-hover']];
  for (const [a, b] of ren) { const v = __vars.find((x) => x.name === a); if (v) { v.name = b; v.description = v.description.replace('Button destructive', 'Button y Badge destructive'); } }
  await compVar('component/input/bg', { r: 1, g: 1, b: 1, a: 0 }, tint('input', '4:2', 0.3), ['FRAME_FILL', 'SHAPE_FILL'], 'bg-transparent dark:bg-input/30', 'Fondo de Input, Textarea y Checkbox: transparente en claro, input al 30 % en oscuro.');
  await compVar('component/input/bg-disabled', tint('input', '4:1', 0.5), tint('input', '4:2', 0.8), ['FRAME_FILL', 'SHAPE_FILL'], 'disabled:bg-input/50 dark:disabled:bg-input/80', 'Fondo deshabilitado de Input y Textarea: input al 50 % en claro, al 80 % en oscuro.');
  await compVar('component/input/border-invalid', aliasOf('destructive'), tint('destructive', '4:2', 0.5), ['STROKE_COLOR'], 'aria-invalid:border-destructive dark:aria-invalid:border-destructive/50', 'Borde con error: destructive en claro, al 50 % en oscuro.');
  return { ok: true, names: __vars.filter((v) => v.name.startsWith('component/')).map((v) => v.name) };
}

if (ARGS.part === 'label') {
  const page = await pageByName('02 · Formularios');
  const add = stager(page, 'staging · Label');
  for (const state of ['default', 'disabled']) {
    const c = comp('state=' + state);
    const t = await text('Nombre del producto', 'Body/Small Medium', 'foreground', c, { name: 'label' }); t.lineHeight = { value: 100, unit: 'PERCENT' };
    if (state === 'disabled') c.opacity = 0.5;
    add(c);
  }
  const { cs, grid } = await combine(page, 'staging · Label', 'Label', { state: ['default', 'disabled'], _: ['Label'] }, 'state', [], 'Label (src/components/ui/label.tsx): text-sm font-medium leading-none. Visible SIEMPRE: el placeholder nunca es la única etiqueta. La única excepción son los buscadores (etiqueta sr-only + lupa). disabled = peer-disabled:opacity-50.');
  const key = cs.addComponentProperty('label', 'TEXT', 'Nombre del producto');
  for (const c of cs.children) c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: key };
  const doc = await pageDoc(page, 'COMPONENTES · 02', 'Formularios', 'Label, Input, Textarea, Checkbox, Switch, InputGroup y Select. Labels visibles siempre (salvo buscadores), campos de 44 px y el foco como capa focus-ring. Input y Textarea usan text-base en móvil y text-sm desde md: su tamaño sale de input/font-size (colección Breakpoint).');
  const s = await docSection(doc, 'Label', ['text-sm font-medium con leading-none (14 px de alto de línea). Va siempre visible encima del campo, unido con htmlFor. Fuera de los buscadores, un campo sin etiqueta visible es un error de accesibilidad y lo prohíbe AGENTS.md.']);
  const g = gridLayout(cs, { state: ['default', 'disabled'] }, 'state', [], 24, 32);
  await board(s, cs, { ...g, rows: ['Label'] }, 'Label · variantes');
  return { set: cs.id, variants: cs.children.length, unbound: unboundPaints(cs).length };
}

if (ARGS.part === 'contenido') {
  const page = await pageByName('05 · Contenido');
  const doc = await pageDoc(page, 'COMPONENTES · 05', 'Contenido', 'Badge, Separator, Skeleton, Card y Avatar. Radios: rounded-xl en tarjetas, rounded-4xl (píldora) en Badge.');
  // Badge
  let add = stager(page, 'staging · Badge');
  const BV = {
    default: { fill: [['primary']], text: 'primary-foreground' },
    secondary: { fill: [['secondary']], text: 'secondary-foreground' },
    destructive: { fill: [['component/destructive/bg']], text: 'destructive' },
    outline: { fill: [], text: 'foreground', border: 'border' },
    ghost: { fill: [], text: 'foreground' },
    link: { fill: [], text: 'primary' },
  };
  for (const [v, s] of Object.entries(BV)) {
    const c = comp('variant=' + v);
    c.counterAxisSizingMode = 'FIXED'; bind(c, 'height', 'spacing/5'); padX(c, 'spacing/2'); padY(c, 'spacing/0_5'); bind(c, 'itemSpacing', 'spacing/1'); rad(c, 'radius/4xl');
    setPaints(c, 'fills', s.fill); border(c, s.border, 1);
    add(c);
    const st = icon('shopping-cart', 12, s.text, 'icon-start'); c.appendChild(st); st.visible = false;
    await text('Congelador', 'Caption/Medium', s.text, c, { name: 'label' });
    const en = icon('chevron-right', 12, s.text, 'icon-end'); c.appendChild(en); en.visible = false;
  }
  let r = await combine(page, 'staging · Badge', 'Badge', { variant: Object.keys(BV) }, 'variant', [], 'Badge (src/components/ui/badge.tsx): h-5, px-2, text-xs font-medium, rounded-4xl, iconos a 12 px. Los badges de CADUCIDAD no son variantes del componente: en código son className con tintes (bg-success/15 border-success/30 text-success…) y viven como patrón en ◆ PATRONES. «Agotado» es outline: se distingue por forma, no por color.');
  const bk = { label: r.cs.addComponentProperty('label', 'TEXT', 'Congelador'), s: r.cs.addComponentProperty('icon inline-start', 'BOOLEAN', false), ss: r.cs.addComponentProperty('icon inline-start ↳', 'INSTANCE_SWAP', iconComp('shopping-cart').id), e: r.cs.addComponentProperty('icon inline-end', 'BOOLEAN', false), es: r.cs.addComponentProperty('icon inline-end ↳', 'INSTANCE_SWAP', iconComp('chevron-right').id) };
  for (const c of r.cs.children) { c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: bk.label }; c.findOne((n) => n.name === 'icon-start').componentPropertyReferences = { visible: bk.s, mainComponent: bk.ss }; c.findOne((n) => n.name === 'icon-end').componentPropertyReferences = { visible: bk.e, mainComponent: bk.es }; }
  const sB = await docSection(doc, 'Badge', ['Variantes de código: default, secondary, destructive, outline, ghost y link. Los tres estados de caducidad (en stock, caduca pronto, caducado) son la MISMA escala de frescura con tintes al 15 %; no son variantes y están en ◆ PATRONES. Lo que no es un estado del producto no lleva pill: «en la lista» es un chip de carrito anclado al icono.']);
  const gB = gridLayout(r.cs, { variant: Object.keys(BV) }, 'variant', [], 24, 32);
  await board(sB, r.cs, { ...gB, rows: ['Badge'] }, 'Badge · variantes');
  // Separator
  add = stager(page, 'staging · Separator');
  for (const o of ['horizontal', 'vertical']) {
    const c = figma.createComponent(); c.name = 'orientation=' + o; c.fills = [];
    if (o === 'horizontal') c.resize(240, 1); else c.resize(1, 24);
    setPaints(c, 'fills', [['border']]);
    add(c);
  }
  r = await combine(page, 'staging · Separator', 'Separator', { orientation: ['horizontal', 'vertical'] }, 'orientation', [], 'Separator (src/components/ui/separator.tsx): bg-border, h-px (horizontal, ancho completo) o w-px (vertical, alto del contenedor). El grosor de 1 px es geometría fija, no un token.');
  const sS = await docSection(doc, 'Separator', ['Un div de 1 px con bg-border: por eso border tiene también scope de relleno.']);
  await board(sS, r.cs, { ...gridLayout(r.cs, { orientation: ['horizontal', 'vertical'] }, 'orientation', [], 24, 32), rows: ['Separator'] }, 'Separator · variantes');
  // Skeleton
  add = stager(page, 'staging · Skeleton');
  for (const [shape, w, h, rr] of [['línea', 240, 16, 'radius/md'], ['bloque', 320, 64, 'radius/xl']]) {
    const c = figma.createComponent(); c.name = 'shape=' + shape; c.resize(w, h); setPaints(c, 'fills', [['muted']]); rad(c, rr); add(c);
  }
  r = await combine(page, 'staging · Skeleton', 'Skeleton', { shape: ['línea', 'bloque'] }, 'shape', [], 'Skeleton (src/components/ui/skeleton.tsx): animate-pulse rounded-md bg-muted; el tamaño lo pone className. «bloque» es el uso de loading.tsx (h-16 rounded-xl). Regla: skeletons para rutas, nunca spinners a pantalla completa; para acciones, Button loading.');
  const sK = await docSection(doc, 'Skeleton', ['Para rutas (loading.tsx), nunca un spinner a pantalla completa. En código parpadea con animate-pulse, que prefers-reduced-motion apaga.']);
  await board(sK, r.cs, { ...gridLayout(r.cs, { shape: ['línea', 'bloque'] }, 'shape', [], 24, 32), rows: ['Skeleton'] }, 'Skeleton · variantes');
  return { doc: doc.id, unbound: unboundPaints(doc).length };
}
