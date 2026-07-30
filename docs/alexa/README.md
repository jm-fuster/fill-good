# Skill de Alexa «mi despensa»

Restar stock del inventario hablándole a un Echo de la cocina:

> «Alexa, dile a mi despensa que reste dos yogures»

La skill vive **en modo desarrollo**: funciona indefinidamente en los dispositivos
de tu propia cuenta de Amazon, sin certificación, sin ficha en la tienda y sin
coste. El código, en cambio, **ya no es doméstico**: la vinculación no depende de
ninguna cuenta concreta y el webhook es idempotente, así que abrirla a terceros es
solo cambiar de fase en la consola de Amazon (ver
[Abrirla a otros usuarios](#abrirla-a-otros-usuarios)).

## Qué hace y qué no

| Sí | No (todavía) |
| --- | --- |
| Restar stock por voz | Crear productos del catálogo por voz |
| Sumar stock por voz | Dictar la caducidad |
| Apuntar en la lista de la compra | Decir qué se puede cocinar con lo que hay |
| Consultar cuánto queda | Deshacer cambios de la LISTA (solo inventario) |
| Vaciar lo que se ha acabado | Dar por cocinado algo que no estaba en el menú |
| Deshacer la última orden del inventario | |
| **Marcar un plato cocinado y descontar sus ingredientes** | |
| Decir «he tirado» y que conteste con ese verbo | Contabilizar el desperdicio (lo quitó la app) |
| **Tachar de la lista lo ya comprado** | |
| **Borrar de la lista lo que ya no hace falta** | |
| Leer la lista de la compra | |
| Decir qué caduca pronto | |
| Decir qué toca hoy de menú | |
| Vincular el altavoz con un código | |
| Preguntar cuál era, y **retomar la orden** con la respuesta suelta | |
| Encadenar órdenes sin repetir «Alexa» tras abrir la skill | |
| Medias cantidades: «medio kilo», «un cuarto de kilo» | |

## Piezas en el repo

| Qué | Dónde |
| --- | --- |
| Webhook | [`src/app/api/alexa/route.ts`](../../src/app/api/alexa/route.ts) |
| Verificación de la firma de Amazon | `src/features/alexa/verify.ts` |
| Lógica por intent | `src/features/alexa/handlers.ts` |
| Resolución de producto y planes de resta/suma (puro) | `src/features/alexa/resolve.ts` |
| Consultas de solo lectura (lista, caducidades, menú) | `src/features/alexa/reports.ts` |
| Comprobaciones de la conversación (`npm run check:alexa`) | `scripts/alexa-conversation.check.ts` |
| Deduplicación de la lista (L3), compartida con la app | `src/features/shopping-list/items.ts` |
| Textos hablados y tarjetas | `src/features/alexa/respond.ts` |
| Vinculación (subpágina de Ajustes) | `src/features/alexa/components/alexa-setup.tsx` |
| Aviso en vivo del canje (Realtime) | `src/features/alexa/use-realtime-links.ts` |
| Modelo de interacción | [`interaction-model-es-ES.json`](./interaction-model-es-ES.json) |
| Tablas | `supabase/migrations/20260729120000_alexa_links.sql` · `20260729160000_alexa_multiusuario.sql` · `20260729180000_alexa_deshacer.sql` |

## 1. Crear la skill

1. Entra en <https://developer.amazon.com/alexa/console/ask> con **la misma cuenta
   de Amazon que usa el Echo** (si no, el altavoz no verá la skill).
2. **Create Skill** → nombre: `Fill Good` → idioma **Español (ES)** →
   modelo **Custom** → hosting **Provision your own**.
3. En **Invocation** comprueba que el nombre de invocación es `mi despensa`.
   > **No lo cambies a «la despensa»**, aunque suene mejor: Amazon rechaza los
   > nombres de DOS palabras que contengan artículos o preposiciones (`la`, `el`,
   > `un`, `de`, `en`…). «mi» es posesivo, así que pasa. Y una sola palabra
   > (`despensa`) tampoco vale: solo se permite si es una marca y demuestras que
   > es tuya.
4. **Build → Interaction Model → JSON Editor**: pega el contenido de
   [`interaction-model-es-ES.json`](./interaction-model-es-ES.json), pulsa
   **Save Model** y después **Build Model** (tarda un par de minutos).
   > *Save* guarda, pero el modelo que atiende al altavoz no cambia hasta que
   > termina el *Build*. Si el Echo sigue respondiendo con la invocación de la
   > plantilla («hola mundo»), es que falta este paso.

## 2. Apuntar la skill a tu endpoint

1. **Build → Endpoint** → selecciona **HTTPS**.
2. Default Region: `https://fillgood.jorgemolinafuster.com/api/alexa`
3. En el desplegable del certificado elige
   **«My development endpoint is a sub-domain of a domain that has a wildcard
   certificate from a certificate authority»** (es el caso de Vercel).
4. Copia el **Skill ID** (`amzn1.ask.skill.…`) desde la lista de skills
   (**Copy Skill ID**) y defínelo como `ALEXA_SKILL_ID`:
   - en `.env.local` para desarrollo,
   - y en **Vercel → Settings → Environment Variables** para producción.

Sin `ALEXA_SKILL_ID` el endpoint responde `401` a todo (cerrado por defecto,
igual que el cron con `CRON_SECRET`). Después de definirla en Vercel hay que
**redeployar** para que la lea.

## 3. Vincular el altavoz

La pantalla de **Ajustes → Alexa** lo guía en tres pasos, en este orden porque el
primero no ocurre en esta app y es donde se atasca quien estrena la skill:

1. **Habilitar la skill** en la cuenta de Amazon (en modo desarrollo ya lo está
   para la tuya). Se vincula la **cuenta**, no el aparato: todos los Echo de esa
   cuenta quedan listos de una vez.
2. **Generar el código**: 6 dígitos, válido **10 minutos** y de **un solo uso**,
   con cuenta atrás en pantalla — un código muerto sin avisar hace que el usuario
   repita la frase y culpe a la skill de no entenderle.
3. **Dictarlo** al Echo:

   > «Alexa, dile a mi despensa que vincule con código 428391»

   Contesta «Listo, este altavoz ya está vinculado con \<tu hogar>» y **la
   pantalla se actualiza sola**: `alexa_links` está en la publicación de Realtime,
   así que el código desaparece y el altavoz aparece en la lista sin recargar.

El vínculo guarda **qué hogar** y **qué usuario**: los movimientos dictados por
voz se firman con esa persona en el historial del inventario. Cualquier miembro
del hogar puede revocarlo desde la misma pantalla.

Si el Echo recibe una orden **sin estar vinculado**, además de decirlo deja una
**tarjeta** en la app de Alexa (Actividad) con los tres pasos y el enlace a
`/ajustes/alexa` — una frase hablada se olvida, y lo que hace falta está en el móvil. El
enlace sale de `VERCEL_PROJECT_PRODUCTION_URL`, que Vercel define solo.

## 4. Probar

**`npm run check:alexa`**: ejecuta el despacho real contra un cliente de Supabase
falso, sin credenciales ni base. Cubre lo que ni el compilador ni el simulador
ven: que el estado de la conversación sobreviva a la ida y vuelta por el
dispositivo, que una orden interrumpida se retome bien y que un «sí» fuera de
sitio no dispare nada. Es rápido; pásalo antes de subir cualquier cambio en
`handlers.ts`, `respond.ts`, `resolve.ts` o `schemas.ts`.

**Simulador** (Build → **Test**, con el modo en *Development*): manda peticiones
**firmadas de verdad**, así que ejercita toda la verificación de `verify.ts`.
Escribe `abre mi despensa` o `dile a mi despensa que reste dos yogures`. Es lo
**único** que prueba el reconocimiento de voz —qué frase cae en qué intent lo
decide Alexa, no nuestro código—, así que después de tocar
`interaction-model-es-ES.json` hay que volver a pegarlo, darle a **Build Model** y
repasar aquí que los one-shot de la lista de arriba siguen cayendo donde deben:
las muestras sueltas de `RespuestaIntent` compiten con todo lo demás.

**Echo físico**: el dispositivo debe estar en **es-ES** y en la misma cuenta de
Amazon. No hace falta habilitar nada: en modo desarrollo la skill ya está
disponible para tu cuenta.

Frases que entiende, por verbo:

| Acción | Verbos |
| --- | --- |
| Restar del inventario | resta · quita · descuenta · he gastado · he usado · he cogido · me he comido · nos hemos comido · nos hemos bebido |
| Sumar al inventario | añade · suma · mete · he comprado · he traído |
| Tirar (a la basura) | he tirado · hemos tirado · he tenido que tirar · tira |
| Estropearse (tirar TODO) | se ha estropeado · se ha puesto malo · se ha echado a perder · he tirado todo el |
| Apuntar en la lista | apunta · apúntame · necesito · me falta · hay que comprar · compra · pon en la lista · mete en la lista · tráete |
| Tachar de la lista (comprado) | ya he comprado · ya he cogido · tacha · marca como comprado |
| Borrar de la lista (ya no hace falta) | quita … de la lista · borra … de la lista · saca … de la lista · ya no necesito |
| Deshacer | deshaz · deshaz lo último · me he equivocado · no era eso · vuelve atrás |
| Marcar cocinado | hemos cenado … · hemos cocinado … · hemos hecho … · hemos cenado (a secas) |
| Consultar | cuánto queda · cuánto tengo · cuánto hay · queda · hay |
| Vaciar (poner a 0) | se ha acabado · se acabó · se ha terminado · ya no queda · me he quedado sin · vacía · pon a cero |
| Leer la lista | qué hay en la lista · qué tengo que comprar · léeme la lista · cómo va la lista |
| Caducidades | qué caduca · qué caduca pronto · qué tengo que gastar · qué está a punto de caducar |
| Menú de hoy | qué hay de cena · qué hay para comer · qué toca hoy · cuál es el menú de hoy |

Las cantidades admiten **medias**: «medio», «media», «un cuarto» y «tres cuartos»,
solas o con el numeral («un cuarto de kilo»).

```text
Alexa, dile a mi despensa que reste dos yogures
Alexa, dile a mi despensa que quite medio kilo de arroz
Alexa, dile a mi despensa que añada tres leches
Alexa, dile a mi despensa que he comprado dos kilos de arroz
Alexa, dile a mi despensa que apunte pan
Alexa, dile a mi despensa que necesito papel de cocina
Alexa, pregunta a mi despensa cuánta leche queda
Alexa, pregunta a mi despensa si queda arroz
Alexa, dile a mi despensa que se ha acabado el pan
   → «Vale, ya no queda Pan de molde. ¿Lo apunto en la lista de la compra?»
   → tú: «sí»  (sin repetir «Alexa»: la sesión se queda abierta)
Alexa, dile a mi despensa que he tirado dos yogures
   → «Vale, he tirado 2 unidades de Yogur natural. Ahora hay 4 unidades.»
     (contesta con tu verbo; en el historial es una baja como cualquier otra)
Alexa, dile a mi despensa que se ha estropeado el pan
   → «Vaya. He tirado lo que quedaba de Pan de molde. ¿Lo apunto en la lista?»
Alexa, dile a mi despensa que ya he comprado el pan
   → «Hecho, he tachado Pan de molde de la lista.»   (lo tachado entra al
      inventario al finalizar la compra)
Alexa, dile a mi despensa que quite el pan de la lista
   → «Hecho, he borrado Pan de molde de la lista.»   (ya no lo quieres: no
      entra en el inventario)
Alexa, dile a mi despensa que deshaga lo último
   → «Hecho, lo he deshecho. Yogur natural vuelve a estar como estaba.»
Alexa, dile a mi despensa que hemos cenado la lasaña
   → «Vale, apunto que has cocinado Lasaña de verduras. Puedo descontar 4 de
      sus 6 ingredientes. El resto no cuadra y lo dejo como está.
      ¿Los descuento?»
   → tú: «sí» → «Hecho, he descontado 4 ingredientes.»
Alexa, pregunta a mi despensa qué hay en la lista
   → «En la lista tienes Pan, Leche entera y Papel de cocina.»
Alexa, pregunta a mi despensa qué caduca
   → «Ojo con esto: Pollo caduca hoy y Yogur natural caduca mañana.»
Alexa, pregunta a mi despensa qué hay de cena
   → «Hoy toca de cena, Tortilla de patatas.»
Alexa, abre mi despensa            → bienvenida, y encadena órdenes
   → «Hola. Te caducan 2 cosas pronto. Tienes 5 cosas apuntadas en la lista.
      ¿Qué apunto?»
```

Cuando algo no está claro, la skill **pregunta y se queda con la orden a medias**,
así que se contesta solo lo que falta:

```text
— Alexa, dile a mi despensa que quite dos yogures
— Tengo varias cosas que se parecen a yogures: Yogur natural y Yogur griego.
  ¿Cuál de ellas?
— El natural.                      (o «la primera»)
— Vale, he quitado 2 unidades de Yogur natural. Ahora hay 4 unidades.

— Alexa, dile a mi despensa que quite arroz
— Tienes 2 kilos de Arroz. ¿Cuánto quito? Por ejemplo: medio kilo.
— Medio kilo.
— Vale, he quitado 0,5 kilos de Arroz. Ahora hay 1,5 kilos.
```

Y al **abrir** la skill se encadenan órdenes sin repetir «Alexa» cada vez, que es
lo que convierte deshacer la compra en una conversación:

```text
— Alexa, abre mi despensa
— Hola. Dime qué gastas o qué traes y lo apunto en el inventario…
— He comprado dos leches
— Hecho, he añadido 2 unidades de Leche entera. Ahora hay 5 unidades. ¿Algo más?
— Tres yogures naturales
— Hecho… ¿Algo más?
— No
— Hasta luego.
```

Para preguntar, «pregunta a mi despensa…» suena mejor que «dile a…», pero las
dos formas valen: Alexa reparte igual el resto de la frase.

Ojo con «añade»: a secas va al **inventario** («añade tres leches» = ya las
tienes en casa). Para la lista hay que decirlo explícito («añade pan **a la
lista**») o usar otro verbo («apunta pan»). Es la única pareja que se solapa, y
se resuelve así porque lo que más se dicta es el ajuste de existencias.

## 5. Desarrollo local (sin Amazon)

Las peticiones firmadas no se pueden falsificar, así que para probar en local hay
un escape: define en `.env.local`

```dotenv
ALEXA_SKILL_ID=amzn1.ask.skill.tu-skill-id
ALEXA_SKIP_VERIFY=1
```

`ALEXA_SKIP_VERIFY` **solo** tiene efecto si `NODE_ENV` es `development` (en
Vercel siempre es `production`), y salta únicamente la firma y el timestamp: el
`applicationId` se comprueba siempre, así que el valor de `ALEXA_SKILL_ID` debe
coincidir con el de los fixtures.

Con `npm run dev` en marcha:

**Bienvenida**

```bash
curl -s -X POST http://localhost:3000/api/alexa -H "Content-Type: application/json" -d '{"version":"1.0","session":{"new":true,"sessionId":"s1","application":{"applicationId":"amzn1.ask.skill.tu-skill-id"},"user":{"userId":"amzn1.ask.account.PRUEBA"}},"request":{"type":"LaunchRequest","requestId":"r1","timestamp":"2026-07-29T10:00:00Z","locale":"es-ES"}}'
```

**Vincular** (cambia `428391` por un código recién generado en Ajustes → Alexa)

```bash
curl -s -X POST http://localhost:3000/api/alexa -H "Content-Type: application/json" -d '{"version":"1.0","session":{"new":true,"sessionId":"s1","application":{"applicationId":"amzn1.ask.skill.tu-skill-id"},"user":{"userId":"amzn1.ask.account.PRUEBA"}},"request":{"type":"IntentRequest","requestId":"r2","timestamp":"2026-07-29T10:00:00Z","locale":"es-ES","intent":{"name":"VincularIntent","slots":{"codigo":{"name":"codigo","value":"428391"}}}}}'
```

**Restar stock** (sin unidad: se entiende «2 unidades»)

```bash
curl -s -X POST http://localhost:3000/api/alexa -H "Content-Type: application/json" -d '{"version":"1.0","session":{"new":true,"sessionId":"s1","application":{"applicationId":"amzn1.ask.skill.tu-skill-id"},"user":{"userId":"amzn1.ask.account.PRUEBA"}},"request":{"type":"IntentRequest","requestId":"r3","timestamp":"2026-07-29T10:00:00Z","locale":"es-ES","intent":{"name":"RestarStockIntent","slots":{"cantidad":{"name":"cantidad","value":"2"},"producto":{"name":"producto","value":"yogures"}}}}}'
```

**Restar con unidad** (así llega la unidad ya resuelta por Alexa)

```bash
curl -s -X POST http://localhost:3000/api/alexa -H "Content-Type: application/json" -d '{"version":"1.0","session":{"new":true,"sessionId":"s1","application":{"applicationId":"amzn1.ask.skill.tu-skill-id"},"user":{"userId":"amzn1.ask.account.PRUEBA"}},"request":{"type":"IntentRequest","requestId":"r4","timestamp":"2026-07-29T10:00:00Z","locale":"es-ES","intent":{"name":"RestarStockIntent","slots":{"cantidad":{"name":"cantidad","value":"500"},"producto":{"name":"producto","value":"arroz"},"unidad":{"name":"unidad","value":"gramos","resolutions":{"resolutionsPerAuthority":[{"status":{"code":"ER_SUCCESS_MATCH"},"values":[{"value":{"name":"gramos","id":"g"}}]}]}}}}}}'
```

**Sumar stock**

```bash
curl -s -X POST http://localhost:3000/api/alexa -H "Content-Type: application/json" -d '{"version":"1.0","session":{"new":true,"sessionId":"s1","application":{"applicationId":"amzn1.ask.skill.tu-skill-id"},"user":{"userId":"amzn1.ask.account.PRUEBA"}},"request":{"type":"IntentRequest","requestId":"r5","timestamp":"2026-07-29T10:00:00Z","locale":"es-ES","intent":{"name":"SumarStockIntent","slots":{"cantidad":{"name":"cantidad","value":"3"},"producto":{"name":"producto","value":"yogures"}}}}}'
```

**Retomar tras una pregunta** (los `candidatos` van con ids reales de tu catálogo;
esto es lo que Alexa devuelve en el turno siguiente a un «¿cuál de ellas?»)

```bash
curl -s -X POST http://localhost:3000/api/alexa -H "Content-Type: application/json" -d '{"version":"1.0","session":{"new":false,"sessionId":"s1","application":{"applicationId":"amzn1.ask.skill.tu-skill-id"},"user":{"userId":"amzn1.ask.account.PRUEBA"},"attributes":{"pendiente":{"tipo":"elegir","accion":"restar","candidatos":[{"id":"UUID-1","name":"Yogur natural"},{"id":"UUID-2","name":"Yogur griego"}],"cantidad":2,"unidad":null}}},"request":{"type":"IntentRequest","requestId":"r6","timestamp":"2026-07-29T10:00:00Z","locale":"es-ES","intent":{"name":"RespuestaIntent","slots":{"producto":{"name":"producto","value":"natural"}}}}}'
```

La respuesta trae el texto en `response.outputSpeech.text`, y lo que quede
pendiente en `sessionAttributes`.

## Cómo decide qué toca

**El producto** se resuelve igual para restar y para sumar: nombre exacto o alias
aprendido → singular/plural → el nombre dicho como palabra completa dentro de uno
del catálogo («yogur» → «yogur natural») → parecido por trigramas. Si encaja más
de uno, pregunta en vez de adivinar —y guarda la orden entera para retomarla con
la respuesta, ver [Conversación](#conversación-preguntar-sin-hacer-repetir)—, y
cuando acierta **repite el nombre completo** para que un error se note al
instante.

**Al restar:**

1. **Unidad**: si la dices, se usa esa (g↔kg y ml↔l se convierten; `ud` y peso
   jamás). Si no la dices, se resta de las unidades contables; si el producto
   solo está a granel, pregunta.
2. **Lote**: FIFO por caducidad (primero el que caduca antes), en cascada si un
   lote no llega. Nunca deja stock negativo y el lote a cero se conserva como
   agotado — las mismas reglas que el descuento de recetas cocinadas.

**Al sumar:**

1. **Unidad**: la que digas, o la del catálogo (`default_unit`). Si el producto va
   a granel y no dices unidad, pregunta: «añade dos» no significa nada en kilos.
2. **Lote**: se suma a uno que ya exista, nunca se crea una fila de más — se
   prefiere un lote **sin caducidad**, luego el de la ubicación del catálogo, y
   por último el que caduca más tarde. Si el producto no tiene ninguna fila, se
   crea en su `default_location` sin caducidad.
3. **La caducidad no se toca nunca.** Por voz no se puede dictar, así que ni se
   inventa ni se pisa la que ya hubiera. Por eso se prefiere el lote sin fecha:
   engordar uno que caduca mañana haría que la app avisara de unidades que en
   realidad acaban de entrar.
4. **`pack_size` no se aplica**: ese multiplicador es de la compra (ticket,
   checkout), no del alta manual. «Añade una leche» es una, no un pack.
5. **No crea productos.** Si lo que dices no está en el catálogo, lo dice y no
   hace nada: por voz no hay pantalla donde revisar el nombre antes de guardarlo,
   y una transcripción torcida ensuciaría el catálogo, que es lo que sostiene el
   emparejado de tickets y el histórico de precios.

**Al apuntar en la lista:**

1. **Sí acepta nombres libres**, al contrario que el inventario: la lista admite
   texto sin producto de catálogo detrás (`product_id` es nullable), igual que
   escribiéndolo en la app. Un artículo apuntado es efímero y se ve en el móvil
   antes de comprar, así que una transcripción torcida se borra de un toque —
   nada que ver con ensuciar el catálogo. Si el nombre sí se reconoce, se enlaza
   con el producto, que es lo que hace funcionar el checkout y los avisos.
2. **No duplica**: si ya está en la lista sin marcar, suma la cantidad sobre el
   artículo existente (la regla L3 de `shopping-list/items.ts`, la misma que usa
   la app). Los artículos ya marcados no cuentan como duplicado.
3. **Avisa si te queda en casa**: «Por si acaso: en el inventario todavía te
   quedan 3 unidades». Es el sentido de la app — comprar lo justo.
4. **Sin cantidad no asume una**: en la lista, «apunta arroz» significa «ya veré
   cuánto cojo». Los contables nacen en 1 y lo que va a granel, sin cantidad
   (`defaultListQuantity`).
5. **Crea la lista activa si no hay ninguna**, replicando `ensure_active_list`;
   no se puede invocar esa RPC porque su guarda usa `clerk_user_id()`, que con el
   service-role es null.

**Al consultar:** es el único intent que **no escribe nada**. Suma los lotes con
existencias agrupando por unidad («te quedan 2 kilos y 300 gramos») y añade la
caducidad más próxima **solo si urge** —caducado, hoy, o dentro de los 3 días de
la ventana de aviso, la misma que usa el resumen diario—; recitar «caduca en 40
días» en cada pregunta sería ruido.

**Al vaciar («se ha acabado el pan»):**

1. Pone a 0 **todos** los lotes del producto, no solo uno, y los conserva como
   agotados igual que el resto de la app.
2. Registra un `consumed` por lo que quedaba: si había dos panes y se acabaron,
   dos panes se consumieron y el historial debe decirlo.
3. **Ofrece apuntarlo en la lista** y deja la sesión abierta, así que se contesta
   «sí» sin repetir «Alexa». Un «no» cancela solo la lista: el stock ya está a 0
   y eso no se deshace.
4. El estado entre los dos turnos viaja en los **`sessionAttributes`** del propio
   envelope (ver `SessionState` en `respond.ts`), no en el servidor: no hay
   conversaciones a medias que guardar ni caducar, y cualquier otra orden borra
   lo pendiente por sí sola. Un «sí» sin nada pendiente se contesta con un
   «no sé a qué te refieres».

**Al tirar («he tirado dos yogures», «se ha estropeado el pan»):** el descuento
del inventario es **idéntico** al de gastar —mismo FIFO por caducidad, mismas
reglas de unidades— y lo único que cambia es **el verbo con el que se contesta**,
que no es cosmético: repetirle «he quitado» a quien acaba de decir que ha TIRADO
algo delata que no se le ha escuchado. Igual que con «se ha acabado», hay dos
verbos porque hay dos cantidades: «he tirado dos yogures» descuenta dos, y «se ha
estropeado el pan» vacía lo que hubiera.

En el historial, en cambio, **las cuatro dejan un `consumed`**. La app dejó de
contabilizar el desperdicio (se fueron la racha, los euros tirados y la pregunta
«¿lo consumiste o lo tiraste?»), así que escribir `discarded` solo dejaba
movimientos que la pantalla ya pinta como una baja normal, con la voz y la app
discrepando sin motivo. Se conservan como acciones distintas —`RestarFlavor` y
`AgotarFlavor` en `handlers.ts`— para poder volver a contabilizarlo cambiando un
campo, sin rehacer el flujo ni pasar otra vez por Build Model. Hay una
comprobación que salta si algún camino vuelve a escribir `discarded` por
descuido.

**Al marcar cocinado («hemos cenado la lasaña»):** son dos cosas, y van
separadas igual que en la app —donde el descuento vive detrás de un modal de
revisión—:

1. **Marcar el plato se hace ya**, sin preguntar: es reversible desde la app y no
   toca existencias. Se limpia `skipped_at`, porque las dos marcas se excluyen.
2. **Descontar los ingredientes espera un sí.** Es lo más destructivo que hace la
   skill —toca varios productos de golpe— y por voz no hay tabla que revisar.

Se busca solo entre **los platos de hoy**, no en todo el recetario: si lo dices es
casi siempre el día que lo tenías planificado, y limitarlo así evita el problema
distinto de haber cocinado algo fuera del menú, que exigiría crear entradas por
voz. Sin nombre de plato, «hemos cenado» resuelve la cena de hoy **solo si no hay
ambigüedad**; con dos platos sin cocinar pregunta cuál, porque dar por cocinado el
equivocado descuenta los ingredientes de otra receta.

El cálculo de qué se puede descontar es **el mismo** que usa el modal de la app
(`computeCookedDeductions`), así que la voz no puede inventarse una regla propia
sobre unidades o emparejados. Lo que la voz hace distinto es **resumir**: por
altavoz se dice cuántos entran y cuántos se quedan fuera, no el motivo de cada
descarte —«no está en tu catálogo», «está en otra unidad»—, que es información de
pantalla. Y el descuento **sí registra el consumo en el historial**, algo que hoy
la app no hace al cocinar (queda anotado como tarea aparte).

Todo el descuento queda bajo **un único plan de deshacer**: «deshaz» revierte los
ingredientes de la receta de golpe, que es como se cocinaron.

**Al deshacer («deshaz lo último», «me he equivocado»):** devuelve el inventario
a como estaba justo antes de la última orden dictada por **ese** altavoz, dentro
de una ventana de **10 minutos**. Es la red que faltaba: si Alexa entiende «doce»
en vez de «dos», hasta ahora la única salida era abrir el móvil.

Cómo, y por qué así:

1. **Se guarda el estado previo, no el movimiento.** Cada orden que escribe anota
   en su propia fila de `alexa_requests` —la misma que ya hace de cerrojo contra
   los reintentos— qué cantidad tenía cada lote antes de tocarlo. Revertir
   sumando lo mismo de vuelta no valdría: un descuento repartido entre varios
   lotes podría re-repartirse distinto.
2. **Una fila que creó la propia orden se borra**, no se deja a cero: un
   «agotado» que nunca existió es basura en el inventario.
3. **El historial se descuenta, no se borra.** Con el agrupado (`fold`), un
   evento puede llevar también movimientos anteriores que nadie pidió deshacer;
   solo desaparece si se queda a cero.
4. **Solo la última orden, y una sola vez.** Encadenar deshaceres por voz, sin
   una pantalla que enseñe por dónde vas, es la forma más rápida de dejar el
   inventario peor que al empezar. Un segundo «deshaz» contesta que ya está.
5. **No cubre la lista de la compra**, a propósito: lo que se apunta o se tacha
   ya se arregla hablando («borra el pan de la lista»), y el daño de una
   equivocación ahí es un toque en el móvil. En el inventario no había salida.

Por qué hizo falta migración y no bastaba con `inventory_events`: esos eventos se
agrupan dentro de una ventana de 15 minutos, así que dos órdenes seguidas del
mismo producto quedan **soldadas en una sola fila** y «deshaz lo último» desharía
las dos. Desactivar el agrupado por voz llenaría el historial de líneas de una
unidad, que es justo lo que ese agrupado vino a evitar.

**Tachar y borrar de la lista NO son lo mismo**, y confundirlos tiene
consecuencias: al finalizar la compra, **todo lo tachado se da de alta en el
inventario**. Tachar lo que en realidad ya no quieres te metería en casa un
producto que nunca compraste, y ese stock fantasma se arrastra después al
histórico de precios y a los avisos. Por eso son dos órdenes:

| Dices | Qué pasa |
| --- | --- |
| «ya he comprado el pan», «tacha el pan» | se marca como comprado → entra al inventario al finalizar la compra |
| «quita el pan **de la lista**», «borra el pan» | se **borra** el artículo → no entra en ningún sitio |

Las dos emparejan **contra la lista y no contra el catálogo**: la lista admite
texto libre sin producto detrás, así que un artículo puede no existir en el
catálogo y aun así estar ahí esperando. Si hay varios parecidos no se toca
ninguno y se pide el nombre completo; se distingue eso de «no está en la lista»
porque decir «no lo encuentro» sobre algo que sí está apuntado es lo que hace
desconfiar de la skill. Tachar algo ya tachado no repite la escritura, lo dice.

Borrar no pide confirmación —igual que en la app—, pero por voz **no hay
deshacer**: la red es repetir el nombre completo en la respuesta, para que un
error se oiga al instante, y no borrar nada cuando hay dudas.

Ojo con la colisión: «quita el pan» resta del **inventario**, y «quita el pan **de
la lista**» borra de la lista. Todas las muestras de la lista exigen decir «de la
lista» o un verbo inequívoco («tacha», «ya he comprado»), la misma política con
la que se resolvió el solape de «añade».

**Al preguntar por la lista, las caducidades o el menú:** son las tres únicas
órdenes que **no escriben nada** (más allá de marcar el vínculo como usado), y
las tres viven en `reports.ts`, aparte de los handlers, porque solo devuelven
datos. Tres reglas comunes:

1. **No crean nada.** Preguntar por la lista no crea la lista activa, al
   contrario que apuntar en ella: una pregunta no debe dejar rastro.
2. **Se cortan**: 8 artículos de la lista y 5 caducidades, y el resto se resume
   en «y N cosas más, que las tienes en Fill Good». Por voz nadie retiene veinte
   nombres, y quien necesita la lista entera la quiere en la mano.
3. **El nombre lo manda el producto**, con el rótulo de la fila como respaldo —
   la misma regla que el resto de la app, para que un renombrado no deje a Alexa
   diciendo el nombre viejo.

Las caducidades usan la **misma ventana de 3 días** que el resumen diario por
push, para que las dos vías no se contradigan, y agrupan por producto: dos lotes
del mismo yogur son una sola cosa de la que preocuparse. El menú lee lo
planificado para hoy saltándose lo que ya marcaste como saltado, y «qué hay de
cena» acota a ese hueco mientras que «qué toca hoy» los cuenta todos.

**La bienvenida los aprovecha**: al abrir la skill se dice lo urgente («Te
caducan 2 cosas pronto. Tienes 5 cosas apuntadas en la lista.») antes de
preguntar qué apuntas, porque es el único momento en que el usuario está
escuchando de verdad. Si no hay nada que avisar, el saludo corto de siempre; y si
el altavoz **no está vinculado**, se explica cómo vincularlo con la tarjeta en el
móvil en vez de saludar, que solo retrasaría el tropiezo a la primera orden.

## Conversación: preguntar sin hacer repetir

La skill pregunta en tres situaciones —cuál de varios productos era, cuánto y en
qué unidad, y si apunta en la lista lo que se ha quedado a cero— y en las tres se
contesta **solo lo que falta**. Antes había que repetir la orden entera, que es lo
que hacía que preguntar saliera casi tan caro como adivinar mal.

Cómo funciona: al preguntar, la respuesta se lleva en sus `sessionAttributes` lo
que hace falta para retomarla (`PendingState` en `respond.ts`): qué acción era,
los candidatos, y la cantidad y la unidad **tal como se dijeron**. Alexa nos
devuelve eso mismo en el turno siguiente, y ahí se ejecuta exactamente lo que se
habría ejecutado de haberlo dicho todo a la primera. **El servidor no guarda
nada**: no hay conversaciones a medias que caducar, y si el usuario se va, se van
con él.

Todas las respuestas sueltas entran por un único intent, `RespuestaIntent`. Es uno
y no tres porque sus muestras son casi comodines (`{producto}`,
`{cantidad} {unidad}`) y varios comodines se pelearían entre sí en el reconocedor.
Qué significa la frase lo decide lo que quedó pendiente, no la frase; **sin nada
pendiente no hace nada**, y ese es el guardarraíl que hace inofensivas unas
muestras tan amplias.

Detalles que importan:

- **Ante la duda se vuelve a preguntar**, nunca se elige «el que casi encaja»: si
  la respuesta no señala a un solo candidato, la pregunta sigue viva.
- Un «sí» solo vale para las preguntas de sí o no. Un «no» **cancela** lo que
  hubiera pendiente.
- Las preguntas se pueden **encadenar**: elegir un producto a granel puede llevar
  a que se pregunte la unidad, y de ahí a completar la orden.
- Al **abrir** la skill se enciende el modo conversación (una marca en la sesión)
  y las confirmaciones rematan con «¿Algo más?» dejando el micrófono abierto. Las
  órdenes de una tacada («dile a mi despensa que…») siguen cerrando: quien las usa
  quiere despachar y marcharse. Los errores y las despedidas cierran siempre —tras
  un fallo, invitar a repetir es justo lo que duplicaría el movimiento.

### «Medio kilo» no era un número

`AMAZON.NUMBER` resuelve numerales («dos», «veinte»), pero **no fracciones**: con
«medio» el slot llegaba vacío y «quita medio kilo de arroz» —el ejemplo que este
mismo README anunciaba— restaba un kilo sin avisar. Las medias van ahora por un
tipo propio, `TipoFraccion`, cuyo id **es el multiplicador** (`medio` → `0.5`), y
se combinan con el numeral si lo hay: en «un cuarto de kilo» Alexa puede meter el
«un» en `cantidad` y el «cuarto» en `fraccion`, y 1 × 0,25 es la lectura correcta.

## Reintentos de Amazon: por qué no se duplica

Si el endpoint tarda más de ~8 s (cold start), Amazon **reenvía la misma petición**
con el mismo `requestId`. Sin protección, «resta dos yogures» descontaba cuatro y
nadie sabía por qué.

Toda petición que **escribe** (restar, sumar, apuntar, vaciar, el «sí» y vincular)
se **reclama** antes de tocar nada insertando su `requestId` en `alexa_requests`;
la clave primaria hace de cerrojo, así que de dos copias simultáneas solo una
escribe. La otra devuelve **la respuesta ya calculada** —guardada en esa misma
fila— porque el reintento es lo que el usuario acaba oyendo: contestarle en
silencio sería peor que el duplicado que venimos a evitar. Si la primera copia
sigue en vuelo y la respuesta no está lista, dice «voy con retraso, míralo en Fill
Good» y **no** invita a repetir la orden, que es justo lo que duplicaría el
movimiento.

Las consultas y la ayuda no se protegen a propósito: no dejan rastro, y cobrarles
dos escrituras las haría más lentas — y la lentitud es lo que provoca los
reintentos.

## Abrirla a otros usuarios

El repo ya no es el límite: el `amazon_user_id` es un id opaco por usuario-de-skill
y el hogar sale siempre de `alexa_links`, así que cualquiera con su propia cuenta
de Amazon puede vincularse. Lo que decide quién puede usarla es **la fase de la
skill** en la consola de Amazon:

| Fase | Quién puede usarla | Qué exige |
| --- | --- | --- |
| **Development** (hoy) | solo dispositivos de **tu** cuenta | nada |
| **Beta** | hasta **500** personas invitadas por email | ficha completa + pasar *Validation*. Sin certificación |
| **Publicada** | cualquiera, desde la tienda | certificación (funcional, política y seguridad) |

Para la **beta** hacen falta: **Build** completo, todos los campos de
**Distribution → Skill Preview** y de **Distribution → Privacy & Compliance**, y
pasar **Certification → Validation**. Los textos, las respuestas del cuestionario,
los iconos y el email de invitación están listos para copiar en
[`ficha-tienda.md`](./ficha-tienda.md). La beta se arranca en **Distribution →
Availability → Beta Test → Start Test**, y **no envía nada a revisión**: la skill
se sigue editando hasta que tú decides someterla.

Tres avisos:

- **Amazon no manda los emails**; el enlace lo reparte el desarrollador. Hay **dos
  modos**: *enlace público* (cualquiera con el enlace se apunta, sin dar su email)
  o *lista de emails*, y solo en ese segundo caso el email invitado tiene que ser
  el de la cuenta de Amazon del tester. Para unos pocos testers, el enlace público
  es mucho más cómodo.
- **La beta caduca a los 90 días y no se prorroga** — se crea otra.
- En esa misma pantalla, **«Opt in to automated locale distribution» se deja
  desmarcado**: publicaría la skill en todos los locales de español (es-MX,
  es-US…), y según la propia letra pequeña, un locale ya publicado solo se quita
  retirando la skill entera. El modelo es es-ES, con productos y giros de España.

La **política de privacidad ya cubre la voz** (29-jul-2026): `/privacidad` describe
qué se guarda del vínculo, que no recibimos grabaciones —solo la transcripción que
hace Amazon—, la base legal, que **Amazon es responsable independiente y no
encargado del tratamiento**, y los plazos. Es lo que pregunta *Privacy &
Compliance*. Los datos del responsable estaban completos desde antes
(`npm run check:legal` pasa en estricto).

Un juicio legal a validar con asesor: la vinculación se apoya en **ejecución del
contrato (art. 6.1.b)**, no en consentimiento, porque es una función que el usuario
pide y generar el código y dictarlo ya es una acción afirmativa inequívoca. Por eso
**no** lleva barrera de consentimiento como la IA. Si un asesor prefiere el 6.1.a,
habría que montar ese gate.

Si algún día se certifica, dos cosas más a vigilar: «mi despensa» es un nombre de
invocación genérico y puede chocar con otra skill ya publicada, y habrá que dar
credenciales de una cuenta de prueba en las instrucciones de certificación, porque
el revisor necesita un código de la app para poder probar la skill.

### Por qué seguimos dictando un código (decisión del 29-jul-2026)

Lo estándar es **account linking OAuth** —lo que hacen Spotify, Hue o Bring!—:
habilitas la skill, pulsas «Vincular cuenta», se abre tu login dentro de la app de
Alexa y listo, sin dictar nada. Es más cómodo y es lo que espera la certificación.
Se evaluó y **se aplazó a propósito**: para una beta de dos o tres personas de
confianza, el código se explica en un mensaje, y montar un servidor OAuth antes de
tener un solo dato de uso real es construir a ciegas. La beta ES la prueba: si los
testers se atascan al vincular, ya hay motivo; si no, no había problema que
resolver.

Lo que haría falta el día que se haga: dos rutas (`authorize` + `token`), una tabla
de tokens, una pantalla de consentimiento —que además arregla una verruga: dejaría
**elegir el hogar explícitamente** en vez de heredar el de la cookie—, el handler
leyendo `session.user.accessToken` (hoy el esquema zod solo se queda con `userId`:
hay que añadirlo, porque descarta las claves desconocidas) con respaldo en el
`amazon_user_id` para no romper los vínculos vivos, y la tarjeta `LinkAccount`, que
Amazon **exige** en la respuesta a un usuario sin vincular.

**Antes de prometer plazos, comprobar esto**: Alexa abre la página de autorización
en un **webview embebido**. Google bloquea su login en webviews embebidos por
política, así que si la cuenta de Fill Good es de las de «Continuar con Google»,
puede que no se pueda iniciar sesión ahí. Con email y contraseña de Clerk no hay
problema. Ese detalle es lo que separa un día de trabajo de una semana peleándose,
y no se sabe sin probarlo.

El *app-to-app account linking* (habilitar y vincular con un botón desde la propia
app) **no** sirve aquí en ningún caso: Amazon solo lo soporta en apps nativas
iOS/Android, y esto es una PWA.

## Limitaciones conocidas

- **`amazon_user_id` cambia** si deshabilitas y vuelves a habilitar la skill en
  la app de Alexa: el vínculo antiguo queda huérfano en Ajustes → Alexa (revócalo) y hay
  que vincular otra vez.
- **Un Echo apunta a un solo hogar**: `amazon_user_id` es único en `alexa_links`.
  Con varios hogares hay que activar el que toque **antes** de generar el código,
  porque el vínculo hereda el hogar activo de ese momento.
- **Google Home / Nest no es posible**: Google cerró las *Conversational Actions*
  de terceros en 2023 y Gemini for Home no ofrece API pública equivalente.
