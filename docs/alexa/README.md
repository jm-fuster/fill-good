# Skill de Alexa «la despensa»

Restar stock del inventario hablándole a un Echo de la cocina:

> «Alexa, dile a la despensa que reste dos yogures»

La skill vive **en modo desarrollo**: funciona indefinidamente en los dispositivos
de tu propia cuenta de Amazon, sin certificación, sin ficha en la tienda y sin
coste. No está pensada para publicarse (eso exigiría certificación, política de
privacidad de la skill y account linking OAuth).

## Qué hace y qué no

| Sí | No (todavía) |
| --- | --- |
| Restar stock por voz | Sumar stock |
| Vincular el altavoz con un código | Añadir a la lista de la compra |
| Preguntar cuando el producto es ambiguo | Consultar cuánto queda |

## Piezas en el repo

| Qué | Dónde |
| --- | --- |
| Webhook | [`src/app/api/alexa/route.ts`](../../src/app/api/alexa/route.ts) |
| Verificación de la firma de Amazon | `src/features/alexa/verify.ts` |
| Lógica por intent | `src/features/alexa/handlers.ts` |
| Resolución de producto y plan de descuento (puro) | `src/features/alexa/resolve.ts` |
| Textos hablados | `src/features/alexa/respond.ts` |
| Card de vinculación en /perfil | `src/features/alexa/components/alexa-card.tsx` |
| Modelo de interacción | [`interaction-model-es-ES.json`](./interaction-model-es-ES.json) |
| Tablas | `supabase/migrations/20260729120000_alexa_links.sql` |

## 1. Crear la skill

1. Entra en <https://developer.amazon.com/alexa/console/ask> con **la misma cuenta
   de Amazon que usa el Echo** (si no, el altavoz no verá la skill).
2. **Create Skill** → nombre: `Fill Good` → idioma **Español (ES)** →
   modelo **Custom** → hosting **Provision your own**.
3. En **Invocation** comprueba que el nombre de invocación es `la despensa`.
4. **Build → Interaction Model → JSON Editor**: pega el contenido de
   [`interaction-model-es-ES.json`](./interaction-model-es-ES.json) y pulsa
   **Save Model** y luego **Build Model** (tarda un par de minutos).

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

   > «Alexa, dile a la despensa que vincule con código 428391»

4. Debe contestar «Listo, este altavoz ya está vinculado con \<tu hogar>».

El vínculo guarda **qué hogar** y **qué usuario**: los movimientos dictados por
voz se firman con esa persona en el historial del inventario. Cualquier miembro
del hogar puede revocarlo desde la misma card.

## 4. Probar

**Simulador** (Build → **Test**, con el modo en *Development*): manda peticiones
**firmadas de verdad**, así que ejercita toda la verificación de `verify.ts`.
Escribe `abre la despensa` o `dile a la despensa que reste dos yogures`.

**Echo físico**: el dispositivo debe estar en **es-ES** y en la misma cuenta de
Amazon. No hace falta habilitar nada: en modo desarrollo la skill ya está
disponible para tu cuenta.

Frases que entiende (todas admiten «resta», «quita», «descuenta», «he gastado»):

```text
Alexa, dile a la despensa que reste dos yogures
Alexa, dile a la despensa que quite medio kilo de arroz
Alexa, dile a la despensa que descuente 200 gramos de queso
Alexa, abre la despensa            → bienvenida y se queda escuchando
```

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

La respuesta trae el texto en `response.outputSpeech.text`.

## Cómo decide de dónde restar

1. **Producto**: nombre exacto o alias aprendido → singular/plural → el nombre
   dicho como palabra completa dentro de uno del catálogo («yogur» → «yogur
   natural») → parecido por trigramas. Si encaja más de uno, pregunta en vez de
   adivinar, y cuando acierta **repite el nombre completo** para que un error se
   note al instante.
2. **Unidad**: si la dices, se usa esa (g↔kg y ml↔l se convierten; `ud` y peso
   jamás). Si no la dices, se resta de las unidades contables; si el producto
   solo está a granel, pregunta.
3. **Lote**: FIFO por caducidad (primero el que caduca antes), en cascada si un
   lote no llega. Nunca deja stock negativo y el lote a cero se conserva como
   agotado — las mismas reglas que el descuento de recetas cocinadas.

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
