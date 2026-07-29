# Skill de Alexa «mi despensa»

Restar stock del inventario hablándole a un Echo de la cocina:

> «Alexa, dile a mi despensa que reste dos yogures»

La skill vive **en modo desarrollo**: funciona indefinidamente en los dispositivos
de tu propia cuenta de Amazon, sin certificación, sin ficha en la tienda y sin
coste. No está pensada para publicarse (eso exigiría certificación, política de
privacidad de la skill y account linking OAuth).

## Qué hace y qué no

| Sí | No (todavía) |
| --- | --- |
| Restar stock por voz | Crear productos del catálogo por voz |
| Sumar stock por voz | Dictar la caducidad |
| Apuntar en la lista de la compra | Marcar artículos como comprados |
| Consultar cuánto queda | Leer la lista entera en voz alta |
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
| Textos hablados | `src/features/alexa/respond.ts` |
| Card de vinculación en /perfil | `src/features/alexa/components/alexa-card.tsx` |
| Modelo de interacción | [`interaction-model-es-ES.json`](./interaction-model-es-ES.json) |
| Tablas | `supabase/migrations/20260729120000_alexa_links.sql` |

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
2. Default Region: `https://TU-DOMINIO/api/alexa`
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

1. En Fill Good, entra en **Perfil** → card **Alexa** → **Vincular un altavoz**.
2. Sale un código de 6 dígitos válido **10 minutos** y de **un solo uso**.
3. Dile al Echo:

   > «Alexa, dile a mi despensa que vincule con código 428391»

4. Debe contestar «Listo, este altavoz ya está vinculado con \<tu hogar>».

El vínculo guarda **qué hogar** y **qué usuario**: los movimientos dictados por
voz se firman con esa persona en el historial del inventario. Cualquier miembro
del hogar puede revocarlo desde la misma card.

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

```text
Alexa, dile a mi despensa que reste dos yogures
Alexa, dile a mi despensa que quite medio kilo de arroz
Alexa, dile a mi despensa que añada tres leches
Alexa, dile a mi despensa que he comprado dos kilos de arroz
Alexa, dile a mi despensa que apunte pan
Alexa, dile a mi despensa que necesito papel de cocina
Alexa, pregunta a mi despensa cuánta leche queda
Alexa, pregunta a mi despensa si queda arroz
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

## Limitaciones conocidas

- **Reintentos**: si el endpoint tarda más de ~8 s (cold start extremo), Amazon
  puede reenviar la petición y el descuento se aplicaría dos veces. No hay
  deduplicación por `requestId` en esta versión.
- **`amazon_user_id` cambia** si deshabilitas y vuelves a habilitar la skill en
  la app de Alexa: el vínculo antiguo queda huérfano en /perfil (revócalo) y hay
  que vincular otra vez.
- **Google Home / Nest no es posible**: Google cerró las *Conversational Actions*
  de terceros en 2023 y Gemini for Home no ofrece API pública equivalente.
- «Se ha acabado el pan» (poner a cero) no está: con la cantidad vacía la
  semántica correcta sería «todo», no «uno», y merece su propio intent.
