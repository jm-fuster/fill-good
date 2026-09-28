// build-button.js — Button y Button · Icon a partir de src/components/ui/button.tsx
// ARGS.stage: 'build' (ARGS.kind: 'text'|'icon', ARGS.variant) | 'combine' (ARGS.kind)
const page = await pageByName('01 · Acciones');
const STATES = ['default', 'hover', 'focus', 'disabled', 'loading'];
const TEXT_SIZES = {
  default: { h: 'spacing/11', px: 'spacing/4', gap: 'spacing/2', r: 'radius/lg', style: 'Body/Small Medium', icon: 16 },
  xs: { h: 'spacing/8', px: 'spacing/2_5', gap: 'spacing/1', r: 'radius/md', style: 'Caption/Medium', icon: 12 },
  sm: { h: 'spacing/9', px: 'spacing/3', gap: 'spacing/1_5', r: 'radius/md', style: 'Body/Small Medium', fontSize: 'font-size/arbitrary-0_8rem', icon: 14 },
  lg: { h: 'spacing/12', px: 'spacing/5', gap: 'spacing/2', r: 'radius/lg', style: 'Body/Base Medium', icon: 16 },
};
const ICON_SIZES = {
  icon: { s: 'spacing/11', r: 'radius/lg', icon: 16 },
  'icon-xs': { s: 'spacing/8', r: 'radius/md', icon: 12 },
  'icon-sm': { s: 'spacing/9', r: 'radius/md', icon: 16 },
  'icon-lg': { s: 'spacing/12', r: 'radius/lg', icon: 16 },
};
const VARIANTS = {
  default: { fill: [['primary']], hover: [['primary', 0.8]], text: 'primary-foreground' },
  outline: { fill: [['component/button/outline-bg']], hover: [['component/button/outline-bg-hover']], text: 'foreground', border: 'component/button/outline-border' },
  secondary: { fill: [['secondary']], hover: [['secondary'], ['foreground', 0.05]], text: 'secondary-foreground' },
  ghost: { fill: [], hover: [['component/button/ghost-bg-hover']], text: 'foreground' },
  destructive: { fill: [['component/destructive/bg']], hover: [['component/destructive/bg-hover']], text: 'destructive', focusBorder: ['destructive', 0.4], ring: 'effect/destructive-ring' },
  link: { fill: [], hover: [], text: 'primary', underlineOnHover: true },
};
const setName = ARGS.kind === 'icon' ? 'Button · Icon' : 'Button';
const stage = staging(page, 'staging · ' + setName);

function shell(name, v, state, size) {
  const c = figma.createComponent(); c.name = name;
  c.layoutMode = 'HORIZONTAL'; c.primaryAxisAlignItems = 'CENTER'; c.counterAxisAlignItems = 'CENTER'; c.clipsContent = false;
  setPaints(c, 'fills', state === 'hover' ? v.hover : v.fill);
  // En código el borde de 1 px existe SIEMPRE (border border-transparent, border-box):
  // cuenta en el ancho aunque no se vea. Aquí igual: trazo incluido en el layout y
  // transparente (border al 0 %) cuando la clase es border-transparent.
  c.strokeWeight = 1; c.strokeAlign = 'INSIDE'; c.strokesIncludedInLayout = true;
  if (state === 'focus') setPaints(c, 'strokes', [v.focusBorder || ['ring']]);
  else if (v.border) setPaints(c, 'strokes', [[v.border]]);
  else setPaints(c, 'strokes', [['border', 0]]);
  rad(c, size.r);
  if (state === 'disabled' || state === 'loading') c.opacity = 0.5;
  return c;
}

async function buildText(vName) {
  const v = VARIANTS[vName]; const out = [];
  for (const [sName, s] of Object.entries(TEXT_SIZES)) for (const state of STATES) {
    const c = shell(`variant=${vName}, size=${sName}, state=${state}`, v, state, s);
    c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'FIXED';
    bind(c, 'height', s.h); padX(c, s.px); bind(c, 'paddingTop', 'spacing/0'); bind(c, 'paddingBottom', 'spacing/0'); bind(c, 'itemSpacing', s.gap);
    stage.appendChild(c);
    if (state === 'loading') { const sp = icon('loader-circle', s.icon, v.text, 'spinner'); c.appendChild(sp); }
    else { const st = icon('plus', s.icon, v.text, 'icon-start'); c.appendChild(st); st.visible = false; }
    const label = await text('Guardar', s.style, v.text, c, { name: 'label' });
    if (s.fontSize) bind(label, 'fontSize', s.fontSize);
    if (state === 'hover' && v.underlineOnHover) label.textDecoration = 'UNDERLINE';
    const en = icon('chevron-right', s.icon, v.text, 'icon-end'); c.appendChild(en); en.visible = false;
    if (state === 'focus') focusRing(c, v.ring || 'effect/ring-50', s.r);
    out.push(c.id);
  }
  return out;
}
async function buildIcon(vName) {
  const v = VARIANTS[vName]; const out = [];
  for (const [sName, s] of Object.entries(ICON_SIZES)) for (const state of STATES) {
    const c = shell(`variant=${vName}, size=${sName}, state=${state}`, v, state, s);
    c.primaryAxisSizingMode = 'FIXED'; c.counterAxisSizingMode = 'FIXED';
    bind(c, 'width', s.s); bind(c, 'height', s.s);
    stage.appendChild(c);
    c.appendChild(icon(state === 'loading' ? 'loader-circle' : 'plus', s.icon, v.text, state === 'loading' ? 'spinner' : 'icon'));
    if (state === 'focus') focusRing(c, v.ring || 'effect/ring-50', s.r);
    out.push(c.id);
  }
  return out;
}

if (ARGS.stage === 'build') {
  // idempotente: quita las variantes previas de esta combinación
  for (const n of stage.children.filter((n) => n.name.startsWith(`variant=${ARGS.variant},`))) n.remove();
  const ids = ARGS.kind === 'icon' ? await buildIcon(ARGS.variant) : await buildText(ARGS.variant);
  // apilar en el staging para que no se solapen mientras se construyen
  let y = 0; for (const n of stage.children) { n.x = 0; n.y = y; y += n.height + 8; }
  return { built: ids.length, inStage: stage.children.length };
}

if (ARGS.stage === 'combine') {
  const comps = stage.children.filter((n) => n.type === 'COMPONENT');
  const old = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === setName); if (old) old.remove();
  const cs = figma.combineAsVariants(comps, page);
  cs.name = setName;
  setPaints(cs, 'fills', [['background']]); setPaints(cs, 'strokes', [['border']]); cs.dashPattern = [6, 4]; rad(cs, 'radius/xl'); cs.clipsContent = false;
  const variants = ARGS.kind === 'icon' ? ['default', 'outline', 'secondary', 'ghost', 'destructive'] : Object.keys(VARIANTS);
  const sizes = Object.keys(ARGS.kind === 'icon' ? ICON_SIZES : TEXT_SIZES);
  const grid = gridLayout(cs, { variant: variants, size: sizes, state: STATES }, 'state', ['size', 'variant'], 24, 40);
  // Propiedades
  const defs = {};
  if (ARGS.kind === 'text') {
    defs.label = cs.addComponentProperty('label', 'TEXT', 'Guardar');
    defs.iconStart = cs.addComponentProperty('icon inline-start', 'BOOLEAN', false);
    defs.iconStartSwap = cs.addComponentProperty('icon inline-start ↳', 'INSTANCE_SWAP', iconComp('plus').id);
    defs.iconEnd = cs.addComponentProperty('icon inline-end', 'BOOLEAN', false);
    defs.iconEndSwap = cs.addComponentProperty('icon inline-end ↳', 'INSTANCE_SWAP', iconComp('chevron-right').id);
    for (const c of cs.children) {
      c.findOne((n) => n.name === 'label').componentPropertyReferences = { characters: defs.label };
      const s = c.findOne((n) => n.name === 'icon-start'); if (s) s.componentPropertyReferences = { visible: defs.iconStart, mainComponent: defs.iconStartSwap };
      const e = c.findOne((n) => n.name === 'icon-end'); if (e) e.componentPropertyReferences = { visible: defs.iconEnd, mainComponent: defs.iconEndSwap };
    }
  } else {
    defs.icon = cs.addComponentProperty('icon', 'INSTANCE_SWAP', iconComp('plus').id);
    for (const c of cs.children) { const i = c.findOne((n) => n.name === 'icon'); if (i) i.componentPropertyReferences = { mainComponent: defs.icon }; }
  }
  cs.description = ARGS.kind === 'text'
    ? 'Button (src/components/ui/button.tsx). Props de código: variant y size con los mismos valores. state reúne lo que en código son pseudoclases (hover, focus-visible) y las props disabled y loading. Alto por defecto: 44 px (h-11), el ajuste de touch target que no se «resetea» a shadcn; xs y sm solo en contextos densos no táctiles. loading deshabilita, marca aria-busy y el spinner SUSTITUYE al icono de inicio, manteniendo el label para que el ancho no salte. Con icono de inicio, el código reduce el padding izquierdo a pl-3 (has-data-[icon=inline-start]); aquí el padding es fijo.'
    : 'Button de solo icono (size icon, icon-xs, icon-sm, icon-lg en button.tsx). En código lleva SIEMPRE aria-label. Mismo variant y state que Button; link no tiene versión de icono.';
  stage.remove();
  return { set: cs.id, variants: cs.children.length, props: Object.keys(cs.componentPropertyDefinitions), unbound: unboundPaints(cs).length, w: Math.round(cs.width), h: Math.round(cs.height) };
}
