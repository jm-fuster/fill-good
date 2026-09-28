// doc-acciones.js — documentación de 01 · Acciones (Button, Button · Icon)
const page = await pageByName('01 · Acciones');
const col = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'Color');
const doc = await pageDoc(page, 'COMPONENTES · 01', 'Acciones', 'Button y Button · Icon, traducidos de src/components/ui/button.tsx. Las propiedades son las props de React con los mismos nombres y valores (variant, size); state reúne las pseudoclases (hover, focus-visible) y las props disabled y loading, porque cambian el aspecto entero y no solo una capa.');
const btn = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Button');
const ibtn = page.findOne((n) => n.type === 'COMPONENT_SET' && n.name === 'Button · Icon');
const P = (cs, prefix) => Object.keys(cs.componentPropertyDefinitions).find((k) => k.startsWith(prefix));
const pick = (cs, v, s, st) => cs.children.find((c) => c.name === `variant=${v}, size=${s}, state=${st}`);

// Sección Button
const s1 = await docSection(doc, 'Button', [
  'Tamaño por defecto 44 px (h-11): es el touch target de WCAG 2.2 y un ajuste deliberado del repo; no se «resetea» a los valores de shadcn. xs (32) y sm (36) solo en contextos densos no táctiles; lg (48) para la llamada principal.',
  'loading deshabilita el botón, marca aria-busy y el spinner SUSTITUYE al icono de inicio; el label se mantiene para que el ancho no salte. Si dos botones comparten el mismo pending, loading va solo en el que dispara la acción.',
  'El borde de 1 px existe siempre (border-transparent) y cuenta en el ancho, igual que en el navegador. Con icono de inicio el código baja el padding izquierdo a pl-3; aquí el padding es fijo (limitación de Figma, documentada).',
  'Hover en secondary es color-mix(secondary, foreground 5 %): aquí, dos rellenos apilados. outline, ghost y destructive cambian de token en oscuro (dark:…): lo resuelven las variables component/button/*.',
]);
// Ejemplo como en /styleguide, en claro y en oscuro
const ex = stack('Ejemplo · como en /styleguide', s1, 24, 'HORIZONTAL');
for (const [mode, id] of [['Light', '4:1'], ['Dark', '4:2']]) {
  const c = stack(mode, ex, 12); c.layoutWrap = 'WRAP'; c.layoutMode = 'HORIZONTAL'; c.counterAxisSpacing = 12; c.counterAxisAlignItems = 'CENTER';
  setPaints(c, 'fills', [['background']]); setPaints(c, 'strokes', [['border']]); rad(c, 'radius/xl'); c.paddingLeft = c.paddingRight = c.paddingTop = c.paddingBottom = 24;
  c.setExplicitVariableModeForCollection(col, id);
  const add = (cs, v, s, st, props = {}) => { const i = pick(cs, v, s, st).createInstance(); c.appendChild(i); if (Object.keys(props).length) i.setProperties(props); return i; };
  add(btn, 'default', 'default', 'default', { [P(btn, 'label')]: 'Primario' });
  add(btn, 'secondary', 'default', 'default', { [P(btn, 'label')]: 'Secundario' });
  add(btn, 'outline', 'default', 'default', { [P(btn, 'label')]: 'Outline' });
  add(btn, 'ghost', 'default', 'default', { [P(btn, 'label')]: 'Ghost' });
  add(btn, 'destructive', 'default', 'default', { [P(btn, 'label')]: 'Eliminar', [P(btn, 'icon inline-start#')]: true, [P(btn, 'icon inline-start ↳')]: iconComp('trash').id });
  add(btn, 'default', 'lg', 'default', { [P(btn, 'label')]: 'Grande (CTA)' });
  add(btn, 'outline', 'sm', 'default', { [P(btn, 'label')]: 'Pequeño' });
  add(ibtn, 'default', 'icon', 'default');
  add(btn, 'default', 'default', 'disabled', { [P(btn, 'label')]: 'Deshabilitado' });
  add(btn, 'default', 'default', 'loading', { [P(btn, 'label')]: 'Guardando…' });
}
const g1 = gridLayout(btn, { variant: ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'], size: ['default', 'xs', 'sm', 'lg'], state: ['default', 'hover', 'focus', 'disabled', 'loading'] }, 'state', ['size', 'variant'], 24, 40);
await board(s1, btn, g1, 'Button · variantes');

// Sección Button · Icon
const s2 = await docSection(doc, 'Button · Icon', [
  'Botón de solo icono: size icon (44), icon-xs (32), icon-sm (36) e icon-lg (48). En código lleva SIEMPRE aria-label; en Figma el nombre accesible va en la anotación del diseño.',
  'El icono se cambia con la propiedad icon (instance swap, cualquier lucide/*); nunca una variante por icono. Mismos variant y state que Button; link no tiene versión de icono.',
]);
const g2 = gridLayout(ibtn, { variant: ['default', 'outline', 'secondary', 'ghost', 'destructive'], size: ['icon', 'icon-xs', 'icon-sm', 'icon-lg'], state: ['default', 'hover', 'focus', 'disabled', 'loading'] }, 'state', ['size', 'variant'], 24, 40);
await board(s2, ibtn, g2, 'Button · Icon · variantes');
return { doc: doc.id, s1: s1.id, s2: s2.id, h: Math.round(doc.height), unbound: unboundPaints(doc).length };
