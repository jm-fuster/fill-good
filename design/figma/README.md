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
| `plugin/fix-icon-colors.js` | Devuelve a los iconos de las instancias el color de su componente principal. Se pasa después de montar composiciones que cambian iconos. |
| `plugin/build-shell.js` | AppShell (móvil y escritorio), BottomNav, NavCountBadge, AppHeader, PageHeader, FAB, EmptyState y StatTile. |
| `plugin/build-patterns.js` | «◆ PATRONES». Dieciséis composiciones de las features, montadas solo con instancias: tarjeta de inventario, estado de producto, buscador, chips, fila de la lista, QuantityStepper, «Te puede faltar», botón de IA, cabecera de sección, día y plato del menú, chip de selección (el alta rápida del inventario), fila de ajustes, selector de producto (el trigger de ProductCombobox), línea del ticket y el cuerpo de la celebración del ticket. |
| `plugin/build-screens.js` | «◆ PANTALLAS». Inventario, Lista y Menús en móvil; Inventario y Lista en escritorio; Inventario en oscuro. Y el **primer uso** (`pu-*`): `/onboarding`, `/bienvenida` con sus dos estados, la lista y el inventario vacíos, y `/unirse` para quien recibe la invitación, con una nota del recorrido al lado. Y el **primer ticket** (`pt-*`): `/escanear` con el aviso de IA, los botones y el análisis, la revisión, la celebración (solo sale con descuentos) y `/inventario/revision`, también con su nota. Las barras fijas van DEBAJO de la nav, como en el código (`z-40` frente a `z-50`). Cada pantalla fija su modo de Breakpoint y marca su destino activo en la navegación. |
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
- **Cambiar el icono de una instancia.** El instance swap, también con `setProperties`, devuelve el icono a su color por defecto (`foreground`) y además **renombra** la capa. En código el icono hereda `currentColor` y esto no pasa. Después de montar composiciones se pasa `fix-icon-colors.js`, que empareja los iconos por posición y no por nombre.
- **Cambiar a un icono con más trazos.** El swap conserva el override en los primeros trazos y deja el resto en `foreground` (de `settings` a `trash`: 2 bien y 3 en negro). Por eso `fixIconColors` corrige cualquier icono con un trazo que haya vuelto a `foreground`, no solo si lo está el primero.
- **Color literal de un override.** Dentro de una instancia, Figma pinta el color LITERAL de la pintura aunque esté enlazada a una variable. `solid()` lo deja en negro, así que el icono de un Button por defecto salía oscuro sobre el verde con la variable bien puesta. `recolor` escribe el valor ya resuelto con `resolveForConsumer`, y al cambiar de modo Figma lo vuelve a resolver porque sigue enlazado.
- **Sobrescrituras de color en una instancia.** Un trazo sobrescrito con `transparent` se pinta negro, porque en un override no se aplica la alfa de la variable. Por eso no se sobrescribe lo que el componente ya trae bien.
- **Capas dentro de otra instancia.** No admiten `componentPropertyReferences`. Se marca la instancia como `isExposedInstance` y sus propiedades se editan desde el padre.
- **Propiedades de texto.** El valor por defecto es UNO para todo el set: escribir el texto variante a variante lo pisa (gana la última escritura). Cada instancia fija su valor.
- **Puertos.** El bridge sondea los puertos 9223-9232 buscando su servidor. Un receptor local de capturas tiene que contestar solo a `POST`, o los sondeos se guardan como archivos. Y el puerto puede estar ocupado por otra sesión: mira `netstat` antes de elegirlo.
- **Una ejecución por llamada.** Una llamada que supera el tiempo SIGUE corriendo en segundo plano y deja duplicados, y lanzar el mismo constructor dos veces en una llamada se cuelga. Las escrituras van siempre en serie y hay que auditar después.
