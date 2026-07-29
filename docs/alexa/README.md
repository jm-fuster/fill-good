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
| Apuntar en la lista de la compra | Marcar artículos como comprados |
| Consultar cuánto queda | Leer la lista entera en voz alta |
| Vaciar lo que se ha acabado | |
| Vincular el altavoz con un código | |
| Preguntar cuando el producto es ambiguo | |

## Piezas en el repo

| Qué | Dónde |
| --- | --- |
| Webhook | [`src/app/api/alexa/route.ts`](../../src/app/api/alexa/route.ts) |
| Verificación de la firma de Amazon | `src/features/alexa/verify.ts` |
| Lógica por intent | `src/features/alexa/handlers.ts` |
| Resolución de producto y planes de resta/suma (puro) | `src/features/alexa/resolve.ts` |
| Deduplicación de la lista (L3), compartida con la app | `src/features/shopping-list/items.ts` |
| Textos hablados y tarjetas | `src/features/alexa/respond.ts` |
| Card de vinculación en /perfil | `src/features/alexa/components/alexa-card.tsx` |
| Aviso en vivo del canje (Realtime) | `src/features/alexa/use-realtime-links.ts` |
| Modelo de interacción | [`interaction-model-es-ES.json`](./interaction-model-es-ES.json) |
| Tablas | `supabase/migrations/20260729120000_alexa_links.sql` · `20260729160000_alexa_multiusuario.sql` |

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

La card de **Perfil → Alexa** lo guía en tres pasos, en este orden porque el
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
del hogar puede revocarlo desde la misma card.

Si el Echo recibe una orden **sin estar vinculado**, además de decirlo deja una
**tarjeta** en la app de Alexa (Actividad) con los tres pasos y el enlace a
`/perfil` — una frase hablada se olvida, y lo que hace falta está en el móvil. El
enlace sale de `VERCEL_PROJECT_PRODUCTION_URL`, que Vercel define solo.

## 4. Probar

**Simulador** (Build → **Test**, con el modo en *Development*): manda peticiones
**firmadas de verdad**, así que ejercita toda la verificación de `verify.ts`.
Escribe `abre mi despensa` o `dile a mi despensa que reste dos yogures`.

**Echo físico**: el dispositivo debe estar en **es-ES** y en la misma cuenta de
Amazon. No hace falta habilitar nada: en modo desarrollo la skill ya está
disponible para tu cuenta.

Frases que entiende, por verbo:

| Acción | Verbos |
| --- | --- |
| Restar del inventario | resta · quita · descuenta · he gastado · he usado · he cogido |
| Sumar al inventario | añade · suma · mete · he comprado · he traído |
| Apuntar en la lista | apunta · necesito · me falta · hay que comprar · compra · pon en la lista |
| Consultar | cuánto queda · cuánto tengo · cuánto hay · queda · hay |
| Vaciar (poner a 0) | se ha acabado · se acabó · se ha terminado · ya no queda · vacía · pon a cero |

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
Alexa, abre mi despensa            → bienvenida y se queda escuchando
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

**Vincular** (cambia `428391` por un código recién generado en /perfil)

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

La respuesta trae el texto en `response.outputSpeech.text`.

## Cómo decide qué toca

**El producto** se resuelve igual para restar y para sumar: nombre exacto o alias
aprendido → singular/plural → el nombre dicho como palabra completa dentro de uno
del catálogo («yogur» → «yogur natural») → parecido por trigramas. Si encaja más
de uno, pregunta en vez de adivinar, y cuando acierta **repite el nombre
completo** para que un error se note al instante.

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
  la app de Alexa: el vínculo antiguo queda huérfano en /perfil (revócalo) y hay
  que vincular otra vez.
- **Un Echo apunta a un solo hogar**: `amazon_user_id` es único en `alexa_links`.
  Con varios hogares hay que activar el que toque **antes** de generar el código,
  porque el vínculo hereda el hogar activo de ese momento.
- **Google Home / Nest no es posible**: Google cerró las *Conversational Actions*
  de terceros en 2023 y Gemini for Home no ofrece API pública equivalente.
