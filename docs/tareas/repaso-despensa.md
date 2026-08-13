# Repaso semanal de despensa

> **Documento para un agente de IA.** Léelo completo antes de tocar esta feature.
> Lee también `AGENTS.md` (raíz del repo) y la guía de Next.js en
> `node_modules/next/dist/docs/` — este proyecto usa Next.js 16 con cambios que
> pueden diferir de tus datos de entrenamiento.
>
> Estado: **implementado** (ago-2026). Este documento es el porqué, no un backlog.

## De dónde sale

De un análisis de por qué la gente deja de usar la app (ago-2026). El
diagnóstico: **Fill Good cobra por adelantado y paga a 30 días** — el esfuerzo
(escanear tickets, mantener la despensa) es inmediato y recurrente, y casi toda
la recompensa (hucha, precios, resumen, compras perfectas) necesita semanas de
historial para encenderse. De las tres soluciones planteadas, esta es la que
sostiene la credibilidad de todo lo demás a largo plazo.

## El problema

**El inventario se desactualiza solo.** Fuera del stepper de la tarjeta y del
descuento al cocinar, nada registra el consumo del día a día: el yogur del
desayuno no lo apunta nadie. A las dos o tres semanas la despensa deja de
parecerse a la casa.

Y eso no es una pantalla equivocada, es una cascada:

- el push diario de caducidades avisa de cosas que ya no están;
- el menú cree que tienes lo que no tienes, y «añadir a la lista lo que falte»
  se calla lo que hace falta;
- las sugerencias de la lista no reclaman lo que se ha acabado.

El usuario aprende entonces a desconfiar de las señales de la app, que es la
antesala exacta de desinstalarla. Es el fallo que mata a casi todas las apps de
despensa, y no se arregla con más recordatorios: se arregla no exigiendo que la
gente apunte cada movimiento.

## La decisión de producto

**Diseñar para la despensa desactualizada en vez de fingir que es exacta.** Un
ritual barato y recurrente: una vez por semana, ocho productos —los que llevan
más tiempo sin que nadie confirme su número— y tres respuestas posibles de un
toque: **queda / poco / se acabó**.

Y el cierre del círculo: lo que se ha acabado o queda poco se ofrece para
apuntar en la lista sin salir del gesto. El repaso no solo corrige la despensa,
**genera la compra de la semana**. Corregir el inventario y no comprar lo que
falta deja el trabajo a medias.

### Lo que gobierna todo el diseño

**El hueco es pequeño y caro.** Se interrumpe al usuario una vez por semana con
sitio para ocho preguntas, así que cada hueco gastado en algo que la app ya sabe
—o que acabas de contar a mano— es una pregunta que no se le hace a lo que de
verdad está mal. Casi todo el código de `pantry-review.ts` es esa aritmética.

### Decisiones que no se ven en el código

1. **El repaso es de cantidades, no de caducidades.** Mezclarlas empeora las dos:
   la caducidad ya tiene su propio flujo (`/inventario/revision`, tras la compra)
   y su propio push diario. Aquí no se pregunta por fechas.
2. **«Poco» no inventa un número.** El usuario está diciendo «cómpralo», no
   «tengo 1,5». Representar «poco» con una cifra metería en el inventario un
   número que nadie ha contado y del que luego se restaría al cocinar. «Poco» y
   «se acabó» hacen lo mismo (ir a la lista); la diferencia es solo si queda algo
   en casa mientras tanto.
3. **El rótulo de lo que se apunta sale de la RESPUESTA, no de
   `suggestionReasonLabel`.** Es la única pantalla de la app que se salta ese
   rótulo compartido, y a propósito: aquí no hay nada que inferir —el usuario
   acaba de decirlo— y «poco» no equivale a «bajo tu mínimo», que es lo que ese
   rótulo diría de un producto sin mínimo definido. Reutilizarlo habría obligado
   a añadir un motivo a un `SuggestionReason` que ninguna otra fuente emite.
4. **Se apunta sin cantidad**, como «lo que falte» del menú: el usuario ha dicho
   que hace falta, no cuánto.
5. **La cadencia semanal es de la casa, aplazar es del dispositivo.** Si tu
   pareja repasó el lunes, a ti no se te pregunta
   (`households.pantry_reviewed_at`). Pero «hoy no» y «no esta semana» son
   molestia personal y van en cookies, igual que en el repaso de platos.
6. **Los dos repasos no se apilan: cede el de despensa, pero con tope.** Dos
   tarjetas encima del `<h1>` no son dos recordatorios, son ruido — la segunda no
   se lee. El de platos pregunta por los últimos siete días y su respuesta se
   pierde con el tiempo (nadie recuerda si cenó eso el martes pasado); la
   despensa sigue ahí mañana. Pero **la cesión está acotada a `YIELD_MAX_DAYS`
   (14)**, ver la sección siguiente: sin tope no aplazaba la pregunta, la
   eliminaba.
7. **Se guarda respuesta por respuesta, no en lote.** Quien abandona a la cuarta
   pregunta no pierde las tres anteriores. Es un ritual que se gana o se pierde
   por lo que cuesta la primera vez.

## Qué se tocó

| Archivo | Papel |
|---|---|
| `supabase/migrations/20260813120000_repaso_despensa.sql` | `inventory_items.reviewed_at`, índice parcial, y `households.pantry_review_enabled` / `pantry_reviewed_at` |
| `src/features/inventory/pantry-review.ts` | **El núcleo**: a quién se pregunta, en qué orden, qué escribe cada respuesta. Puro, sin I/O |
| `scripts/pantry-review.check.ts` + `check-pantry-review.mjs` | `npm run check:repaso` (31 comprobaciones) |
| `src/features/inventory/queries.ts` | `getPantryReviewCandidates`, `getPantryReviewPrefs` |
| `src/features/inventory/actions.ts` | `savePantryReviewAction`, `setPantryReviewEnabledAction` |
| `.../components/pantry-review-{banner,card,modal,setting-row}.tsx` | Portero en servidor, tarjeta, repaso y la fila de Ajustes |
| `src/components/layout/app-shell.tsx` | Montaje en el shell, en `Suspense` |

La migración **está aplicada** en el proyecto remoto (`db push`, 2026-08-13:
`local` y `remote` coinciden y no queda nada pendiente). Verificado además contra
PostgREST, que es la vía por la que la app lee: las tres columnas se devuelven,
con `pantry_review_enabled` a `true` en las filas que ya existían. Las tres son
aditivas y con default, así que la base admitió el cambio sin que el código
desplegado supiera nada de ellas — ese es el orden seguro cuando el esquema va
por delante del deploy.

## Por qué hay un `check:*` y qué fija

Porque aquí todo son decisiones de atención, no de tipos: quitar cualquiera de
los filtros deja los tipos intactos, el lint callado y el build verde. Lo que
cambia es que el repaso empieza a preguntar por lo que acabas de contar a mano, y
un repaso que hace perder el tiempo se apaga a la segunda semana.

El caso que justifica media comprobación: **contestar «queda» tiene que sacar la
fila del repaso siguiente.** Es la respuesta más común y la única que no cambia
ningún valor de la fila, así que es fácil tratarla como un no-op — y entonces
vuelve la misma pregunta cada semana, castigando justo a quien contesta. Eso es
lo que hace `reviewed_at`, y también por qué la frescura de un número es **la más
reciente de `reviewed_at` y `updated_at`**: mirando solo la primera se pregunta
por lo que acabas de tocar con el stepper, y mirando solo la segunda el efecto de
«queda» quedaría colgando del trigger `inventory_touch_updated_at`.

El otro matiz que se fija: **el tope por categoría reordena, no encoge** (dos
vueltas, la segunda rellena con los apartados), porque si recortara, una despensa
monotemática tendría repasos de tres preguntas; y cuando no hay de dónde sacar,
el tope cede antes que dejar el repaso corto.

## El fallo que solo se vio midiendo

Merece sección propia porque es el único que no se encontró leyendo el código.
Tras aplicar la migración se midió contra la base real cuántos hogares verían la
tarjeta, y salieron **4 de 8**. Los 4 bloqueados no lo estaban por falta de
candidatos: tres eran los hogares con MÁS despensa (126, 52 y 7 filas; entre 6 y
95 productos sin mirar desde hacía días) y los frenaba la regla de ceder ante el
repaso de platos, con 11, 3 y 8 platos pasados sin resolver.

El problema es que esa cola solo se vacía **si alguien la contesta**, que es
exactamente lo que la feature del repaso de platos asume que nadie hace. La
cesión no era «hoy no», era «nunca»: la despensa quedaba callada para siempre en
las casas que más la necesitan, que son las que más productos tienen.

Arreglado con `shouldYieldToDishes` y `YIELD_MAX_DAYS = 14`: pasadas dos semanas
sin haber podido repasar, la despensa toma su turno aunque coincidan. Dos
tarjetas una vez cada dos semanas es un precio pequeño al lado de no preguntar
nunca. Con el tope, 7 de 8 hogares ven la tarjeta; el que no, tiene el inventario
vacío.

**La lección general**, más allá de esta feature: una regla de prioridad entre dos
avisos hay que medirla contra datos reales, porque su fallo no es un error sino un
silencio. Ni el compilador ni un check lo habrían visto — `platos.length > 0` y la
versión con tope devuelven las dos un booleano, y el check solo sabe lo que le
cuentas. Lo que lo destapó fue preguntarle a la base «¿esto saldría?» en vez de
«¿esto compila?».

## Sin validar

- **Nada de esto se ha probado con una despensa real.** Los pesos de
  `driftScore` (nevera ×1,6, congelador ×0,6, mínimo +6, habitualidad ×0,8 con
  tope 10) son un punto de partida razonado, no medido.
- **Los ocho productos y los tres días de ventana** son la misma clase de
  conjetura. El número que habría que mirar es cuántos repasos se terminan frente
  a cuántos se abren.
- **No hay instrumentación**, así que no se puede saber si el repaso se usa. El
  análisis del que sale esta feature ya señalaba eso como pendiente previo:
  sin eventos (primera lista, primer ticket, segundo ticket, invitación
  aceptada, repaso terminado) la siguiente pregunta sobre retención se seguirá
  respondiendo con hipótesis.

## Lo que se dejó fuera a propósito

- **Push del repaso.** Existe `pref_restock` en `push_subscriptions` sin emisor,
  y sería el sitio natural. No se ha hecho porque primero hay que saber si el
  ritual funciona cuando el usuario ya está dentro; un push semanal más sobre una
  mecánica no validada es la forma rápida de que se apaguen todas las
  notificaciones.
- **Entrada permanente en `/inventario`.** Hoy el único acceso es la tarjeta del
  shell. Si se añade, hay que excluir esa ruta en la tarjeta (como hace
  `ROUTE_WITH_OWN_CHECKIN` con `/menus`) para no ofrecer dos puertas al mismo
  sitio en la misma pantalla.
- **Cadencia de compra como señal.** `getSuggestions` ya calcula la mediana de
  intervalos entre compras desde `receipt_items`, y sería la mejor señal de «esto
  ya se ha acabado». Se deja fuera porque depende de tickets escaneados, que es
  precisamente la dependencia que esta feature intenta no tener. Los helpers
  (`medianOf`, `daysBetween`) no están exportados; extraerlos sería el primer
  paso.
