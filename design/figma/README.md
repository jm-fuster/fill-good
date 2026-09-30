# Fill Good · Design System en Figma

Scripts que generan y comprueban el archivo de Figma **desde el repo**. La regla es la misma que el repo aplica a la medición de uso: una copia mantenida a mano es una segunda verdad que tarde o temprano deja de cuadrar con la primera.

- Lo que está en producción lo dice el código (`src/app/globals.css`, `src/components/ui`).
- Figma es el laboratorio: ahí se prueba y se propone.
- Las páginas de librería **no se editan a mano**, se regeneran.

Archivo: «Fill Good · Design System», key `KIBYRhH4Fq2gWhklVfYn6g`.

## Qué hay aquí

| Ruta | Qué es |
|---|---|
| `gen-tokens.mjs` | Lee `globals.css` y convierte oklch a sRGB (con aviso de fuera de gama), con scopes y code syntax. Escribe `data/tokens.json`. |
| `gen-icons.mjs` | Resuelve los iconos de Lucide **importados de verdad** contra `lucide-react` instalado. Si dos nombres dan el mismo dibujo, los funde y los lista en `aliasesMerged`: tiene que salir vacío, porque el lint rechaza los alias (`fillgood/lucide-nombres-canonicos`). También lee `src/lib/product-icons/registry.ts`. Escribe `data/icons-*.json`. |
| `serve.mjs` | Sirve `plugin/*.js` y `data/*.json` en `localhost:9232` para que el plugin los lea. |
| `plugin/ds-lib.js` | Ayudas compartidas que corren **dentro de Figma**: colores enlazados, variables `alpha/*`, capa de foco, rejillas y documentación. |
| `plugin/build-*.js`, `doc-acciones.js` | Constructores de cada página de componentes. Son idempotentes: se pueden volver a lanzar. |
| `plugin/sync-tokens.js` | Lleva a Figma los valores de `data/tokens.json`. Con `ARGS.dry` solo informa. |
| `plugin/verify-colors.js` | Comprueba sin escribir que Figma coincide con `globals.css`. |
| `plugin/fix-alpha.js` | Repara opacidades puestas a mano sobre colores enlazados (ver «Reglas medidas»). |
| `plugin/fix-font-size.js` | Repara los textos con estilo cuyo tamaño se enlazó con `setBoundVariable` (ver «Reglas medidas»). Con `ARGS.dry` solo informa; `ARGS.limit` lo reparte en tandas. |
| `plugin/fix-icon-colors.js` | Devuelve a los iconos de las instancias el color de su componente principal. Se pasa después de montar composiciones que cambian iconos. |
| `plugin/build-shell.js` | AppShell (móvil y escritorio), BottomNav, NavCountBadge, AppHeader, PageHeader, FAB, EmptyState y StatTile. |
| `plugin/build-patterns.js` | «◆ PATRONES». Cuarenta y nueve composiciones de las features, montadas solo con instancias: tarjeta de inventario, estado de producto, buscador, chips, fila de la lista, QuantityStepper, «Te puede faltar», botón de IA, cabecera de sección, día y plato del menú (con la variante apilada del escritorio), chip de selección (el alta rápida del inventario), fila de ajustes, selector de producto (el trigger de ProductCombobox), línea del ticket, el cuerpo de la celebración del ticket, la tarjeta de repaso del shell, las preguntas de los dos repasos (despensa y platos), coste de receta, tarjeta de receta, receta del pack, valoración, ingrediente al cocinar, temporizador, aviso de precio, barra de objetivo, barra de reparto, producto con precio, la hucha del mes la cabecera y el pie públicos (landing y legales), los controles y el tirador de esquina del escáner de documentos (en modo Dark: el escáner fuerza `dark`), y del modo compra la fila, el chip de tienda, el plegable de cogidos y «Recomendados»; y las piezas de los modales del día a día: la ficha del selector «Añadir a la lista», la fila de orden de pasillos, el chip de ubicación, la fila con interruptor, la cabecera del plegable «Ajustes adicionales» y, de menús, la casilla de acción, la casilla de hueco, la fila con casilla, la opción de objetivo, la idea para hoy y la fila a descontar. La fila de ajustes tiene además la variante `control`, con un botón a la derecha (Retirar, Desactivar, el tema), y un valor opcional. |
| `plugin/build-screens.js` | «◆ PANTALLAS». Inventario, Lista y Menús en móvil; Inventario y Lista en escritorio; Inventario en oscuro. Y el **primer uso** (`pu-*`): `/onboarding`, `/bienvenida` con sus dos estados, la lista y el inventario vacíos, y `/unirse` para quien recibe la invitación, con una nota del recorrido al lado. Y el **primer ticket** (`pt-*`): `/escanear` con el aviso de IA, los botones y el análisis, la revisión, la celebración (solo sale con descuentos) y `/inventario/revision`, también con su nota. Y los **repasos semanales** (`rp-*`): las dos tarjetas del shell y sus modales (despensa: preguntas y «¿lo apuntamos?»; platos: preguntas, descontar y «¿por qué no?»). El contenido de cada sheet es un componente local `_Contenido · …` en la sección «Contenidos de modal (slots)» de la misma página, que el ResponsiveModal recibe por instance swap; lleva también el pie, porque cada repaso pone el suyo. Y **recetas y modo cocinado** (`rc-*`, `ck-*`): `/recetas` vacío y con recetas, la ficha de edición y las tres vistas del modo cocinado a pantalla completa (repaso de ingredientes, paso con temporizador y plato terminado); más **Menús en escritorio** (`menus-escritorio`), con la semana en tres columnas. Y **Precios, Resumen y Perfil** (`pr-*`, `rs-*`, `pf-*`): cada una sin datos y con datos, más la ficha de precio de un producto con su gráfica, dibujada con vectores sobre los tokens `chart-*` como la pinta Recharts (eje de categorías, Y desde 0). Las barras fijas van DEBAJO de la nav, como en el código (`z-40` frente a `z-50`). Y **Ajustes, legales y landing** (`aj-*`, `lg-*`, `ld-*`): el índice de ajustes y Mi hogar, Privacidad en móvil y escritorio (las secciones 3 a 12 van resumidas en una caja: son la misma plantilla) y la landing entera en los dos anchos. Y el **escáner de documentos** (`es-*`): abriendo la cámara, encuadrando, ticket detectado, ajustar el recorte y la vuelta al formulario cuando no hay cámara; la imagen de la cámara es una ilustración con tokens y el velo del canvas es la variable `component/scanner/velo` (negro al 50 %, no es un token). Y el **modo compra** (`mc-*`): comprando, quitar un producto (deslizar y el toast con «Deshacer»), todo en el carro, lista vacía y escritorio. Y los **modales del día a día** (`inv-*`, `ls-*`, `mn-*`): de inventario, añadir producto y la ficha (con y sin «Ajustes adicionales», y la vista de elegir icono); de la lista, añadir (con sugerencias, y buscando y creando), editar un producto y el orden de los pasillos, más «Añadir» como Dialog de escritorio; y de menús, el panel de un plato (nuevo y existente), mover a…, añadir lo que falte, descontar al cocinar, ¿qué hago hoy?, ajustes del menú y rehacer todo. Cada uno es un hueco `_Contenido · …` encima de la pantalla de la que sale. Cada pantalla fija su modo de Breakpoint y marca su destino activo en la navegación. |
| `analysis/*.mjs` | Análisis de solo lectura que sostienen decisiones del archivo: uso real de clases, gama sRGB y scopes por uso. |

`data/` no se versiona: se regenera con `npm run figma:datos`.

## Cómo se usa

Hace falta Figma Desktop con el plugin **Desktop Bridge** de figma-console abierto en el archivo.

1. `npm run figma:datos`
2. `npm run figma:serve` y dejarlo corriendo.
3. Desde Claude Code, `figma_execute` con este cargador (cambia el script y `ARGS`):

```js
const get = async (f) => (await fetch('http://localhost:9232/' + f + '?t=' + Date.now())).text();
const src = (await get('plugin/ds-lib.js')) + '\n' + (await get('plugin/verify-colors.js'));
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
return await new AsyncFn('figma', 'ARGS', src)(figma, {});
```

**Después de cambiar un token en `globals.css`:**

1. `npm run figma:datos`
2. `sync-tokens.js` con `{ dry: true }` para ver el cambio.
3. `sync-tokens.js` con `{}` para aplicarlo.
4. `verify-colors.js`: tiene que dar 0 diferencias.

Los componentes están enlazados a las variables, así que se actualizan solos.

**Después de cambiar un componente de `ui/`:** se vuelve a lanzar su constructor (ver la cabecera de cada `build-*.js`) y después la documentación de su página.

## Reglas medidas (no las cambies sin volver a medir)

- **Opacidades.** Con un color enlazado, Figma fija la opacidad de la pintura a la alfa de la variable **cada vez que resuelve el modo**: al crear instancias o al cambiar a oscuro. Una opacidad puesta a mano se pierde.
  - Por eso `bg-success/15` es la variable `alpha/success/15`, con code syntax `color-mix(in oklab, var(--success) 15%, transparent)`, que es lo que emite Tailwind.
  - `border-transparent` es la variable `transparent`.
  - `setPaints` crea ambas al vuelo.
- **Foco.** Figma no proyecta sombras desde un frame sin relleno, y un efecto enlazado toma la alfa de la variable. El `ring-3` es una capa hija `focus-ring` con trazo exterior de 3 px, y su color sale de `effect/*`.
- **`dark:` de una clase.** Cuando una clase cambia de token en oscuro, lo expresa una variable `component/*` con un valor por modo, documentada como traducción de la clase.
- **Borde de 1 px.** El borde siempre presente (`border-transparent`) cuenta en el ancho, igual que con `box-sizing: border-box`: `strokesIncludedInLayout`.
- **`resize()`** deja el eje en FIXED. Tras redimensionar, se vuelve a poner `AUTO` donde tiene que crecer.
- **Instancias.** Una instancia hereda un alto fijo: `layoutSizingVertical = 'HUG'`.
- **Cambiar `layoutMode`** intercambia los modos de tamaño de los ejes: un frame que crecía en vertical pasa a tener fijo el alto (el hero de la landing se quedaba en su alto de móvil al pasar a fila). Después de cambiarlo, `fixAxes` vuelve a fijar el ancho y a poner HUG el alto.
- **Fuentes al editar una instancia.** Cambiar el texto de una capa dentro de una instancia pide `loadFontAsync`, y dentro de una ejecución la SEGUNDA carga de la misma fuente no vuelve nunca (con el `fontName` tal cual, que lleva `variationSettings`, tampoco la primera): la llamada se queda colgada sin error. Los textos que rellena una pantalla van como propiedades de texto del componente y se ponen con `setProperties`, que no carga fuentes; las capas anidadas, con `isExposedInstance`. Y dentro de un constructor NO se llama a `loadFontAsync` ni una vez: medido con marcas en el documento, una sola carga explícita de Geist SemiBold se quedó colgada 2 minutos, mientras la misma llamada suelta volvía en 0 ms. Las fuentes que usan los estilos ya están cargadas; `setRangeFontName` y `fontName` a SemiBold funcionan sin cargar nada.
- **Búsquedas de componentes.** `setOf` indexa cada página una vez por ejecución (`findAllWithCriteria`). Con un `findOne` por componente, «◆ PANTALLAS» y «◆ PATRONES» se recorrían enteras decenas de veces y cada pantalla pasaba de 30 s antes de empezar a dibujar.
- **Diagnosticar una ejecución colgada.** Si una llamada caduca, su error no llega nunca. Se relanza sin esperar su promesa, con marcas en `figma.root.setSharedPluginData('fgdbg', …)` en cada paso, y se leen desde otra llamada.
- **Tamaño de letra enlazado.** `setBoundVariable('fontSize')` sobre un texto con estilo NO tiene efecto: añade la variable a la lista y se sigue pintando la del estilo (el h1 de la landing salía a 36 en vez de 60, `Button sm` a 12,8 y el Input a 16 en escritorio en vez de los 14 de `md:text-sm`). Hay que usar `setRangeBoundVariable` sobre todo el texto, que es lo que hace `bind`, con su altura de línea de la escala. Los textos ya estropeados los arregla `fix-font-size.js`.
- **Cambiar el icono de una instancia.** El instance swap, también con `setProperties`, devuelve el icono a su color por defecto (`foreground`) y además **renombra** la capa. En código el icono hereda `currentColor` y esto no pasa. Después de montar composiciones se pasa `fix-icon-colors.js`, que empareja los iconos por posición y no por nombre.
- **Cambiar a un icono con más trazos.** El swap conserva el override en los primeros trazos y deja el resto en `foreground` (de `settings` a `trash`: 2 bien y 3 en negro). Por eso `fixIconColors` corrige cualquier icono con un trazo que haya vuelto a `foreground`, no solo si lo está el primero.
- **Color literal de un override.** Dentro de una instancia, Figma pinta el color LITERAL de la pintura aunque esté enlazada a una variable. `solid()` lo deja en negro, así que el icono de un Button por defecto salía oscuro sobre el verde con la variable bien puesta. `recolor` escribe el valor ya resuelto con `resolveForConsumer`, y al cambiar de modo Figma lo vuelve a resolver porque sigue enlazado.
- **Sobrescrituras de color en una instancia.** Un trazo sobrescrito con `transparent` se pinta negro, porque en un override no se aplica la alfa de la variable. Por eso no se sobrescribe lo que el componente ya trae bien.
- **Capas dentro de otra instancia.** No admiten `componentPropertyReferences`. Se marca la instancia como `isExposedInstance` y sus propiedades se editan desde el padre.
- **El estilo de un texto enlazado se comparte.** Los textos enlazados a la MISMA propiedad comparten el estilo entre variantes: tachar el de una variante los tacha en todas. Si una variante necesita otro estilo (el ingrediente marcado, tachado), sus textos no se enlazan y la pantalla los escribe directamente.
- **Clonar una variante suelta sus enlaces.** Un `clone()` de una variante dentro del set pierde `componentPropertyReferences`: hay que volver a enlazar sus textos (la variante apilada del plato enseñaba siempre el texto de ejemplo).
- **Propiedades de texto.** El valor por defecto es UNO para todo el set: escribir el texto variante a variante lo pisa (gana la última escritura). Cada instancia fija su valor.
- **Puertos.** El bridge sondea los puertos 9223-9232 buscando su servidor. Un receptor local de capturas tiene que contestar solo a `POST`, o los sondeos se guardan como archivos. Y el puerto puede estar ocupado por otra sesión: mira `netstat` antes de elegirlo.
- **Una ejecución por llamada.** Una llamada que supera el tiempo SIGUE corriendo en segundo plano y deja duplicados, y lanzar el mismo constructor dos veces en una llamada se cuelga. Las escrituras van siempre en serie y hay que auditar después.
