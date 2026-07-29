# Ficha de la skill para la consola de Amazon

Textos listos para copiar en **Distribution → Skill Preview** y respuestas para
**Distribution → Privacy & Compliance**. Hacen falta igual para la **beta** que
para publicar: sin estos campos completos la beta no se puede crear (ver
[README](./README.md) § «Abrirla a otros usuarios»).

> Todo va con el dominio de producción real (`fillgood.jorgemolinafuster.com`):
> no queda nada que sustituir, se copia y se pega.

## Skill Preview

**Public Name** (máx. 50 caracteres) — incluye el nombre de invocación a
propósito, para que quien la vea en la tienda sepa cómo se llama al altavoz:

```text
Fill Good: mi despensa
```

**One Sentence Description** (máx. 160):

```text
Controla la despensa y la lista de la compra por voz: resta lo que gastas, apunta lo que falta y pregunta cuánto queda.
```

**Detailed Description** (máx. 4000):

```text
Fill Good es la app del hogar para comprar lo justo y ahorrar más: inventario, lista de la compra compartida, escaneo de tickets y menús semanales. Con esta skill manejas lo que más se toca —el inventario y la lista— hablando, con las manos ocupadas o llenas de bolsas.

QUÉ PUEDES DECIR

• Restar lo que gastas: «Alexa, dile a mi despensa que reste dos yogures».
• Sumar lo que traes: «Alexa, dile a mi despensa que he comprado dos kilos de arroz».
• Apuntar en la lista: «Alexa, dile a mi despensa que apunte pan». Si todavía te queda en casa, te avisa antes de que compres doble.
• Preguntar cuánto queda: «Alexa, pregunta a mi despensa cuánta leche queda». Si algo está a punto de caducar, te lo dice.
• Vaciar lo que se ha terminado: «Alexa, dile a mi despensa que se ha acabado el pan», y te ofrece apuntarlo en la lista.

Descuenta siempre del lote que caduca antes, y si un lote no llega, sigue por el siguiente. Los cambios se ven al instante en el móvil y para el resto de tu hogar.

CÓMO SE PONE EN MARCHA

Necesitas una cuenta gratuita de Fill Good y vincular el altavoz una sola vez:

1. Entra en Fill Good, abre Ajustes y entra en Alexa.
2. Pulsa «Generar el código»: son seis dígitos.
3. Di: «Alexa, dile a mi despensa que vincule con código», y los seis dígitos.

El vínculo es de todo el hogar y puedes deshacerlo cuando quieras desde esa misma pantalla.

QUÉ NO HACE TODAVÍA

• No crea productos nuevos por voz: si lo que dices no está en tu catálogo, te lo dice y no hace nada. Así una transcripción torcida no ensucia el histórico de precios.
• No se puede dictar la fecha de caducidad.
• No lee la lista entera en voz alta ni marca artículos como comprados.
```

**Example Phrases** (3, obligatorias). Estas tres están **verificadas contra
[`interaction-model-es-ES.json`](./interaction-model-es-ES.json)** — Amazon
rechaza la ficha si una frase de ejemplo no la entiende el modelo:

```text
Alexa, dile a mi despensa que reste dos yogures
Alexa, pregunta a mi despensa cuánta leche queda
Alexa, dile a mi despensa que apunte pan
```

| Frase | Intent | Sample que la cubre |
| --- | --- | --- |
| …que reste dos yogures | `RestarStockIntent` | `reste {cantidad} {producto}` (*yogures* es sinónimo de *yogur*) |
| …cuánta leche queda | `ConsultarStockIntent` | `cuánta {producto} queda` |
| …que apunte pan | `ApuntarListaIntent` | `apunte {producto}` |

**Keywords** (máx. 30):

```text
despensa, inventario, lista de la compra, compra, supermercado, cocina, nevera, alimentos, caducidad, stock, hogar, ahorro, presupuesto, menú semanal, tickets
```

**Category:** `Productivity` (Productividad). Alternativa razonable:
`Food & Drink`, pero esto organiza la casa más que la cocina.

**Iconos** (ya generados, fondo opaco con el verde de marca `#127A4E`; las
esquinas transparentes del icono de la PWA se aplanaron porque la tienda de
Alexa no las quiere):

| Campo | Archivo |
| --- | --- |
| Small Skill Icon (108×108) | [`../../assets/alexa/skill-icon-108.png`](../../assets/alexa/skill-icon-108.png) |
| Large Skill Icon (512×512) | [`../../assets/alexa/skill-icon-512.png`](../../assets/alexa/skill-icon-512.png) |

**URLs:**

```text
Privacy Policy URL: https://fillgood.jorgemolinafuster.com/privacidad
Terms of Use URL:   https://fillgood.jorgemolinafuster.com/terminos
```

## Privacy & Compliance

Los campos son literalmente estos cuatro más las instrucciones de prueba:

| Pregunta del formulario | Respuesta | Por qué |
| --- | --- | --- |
| *Does this Alexa skill collect users' personal information?* | **Yes** | El `amazon_user_id` es opaco, pero se guarda asociado a una cuenta de Fill Good identificada, y la skill actúa sobre el contenido del hogar. Está descrito en `/privacidad` (§2, §3, §4 y §7), que es la URL que pide al marcar «Yes» |
| *Is this skill directed to … children under the age of 13?* | **No** | Pregunta si va *dirigida* a menores, no si un menor podría usarla. La app no se dirige a menores de 14 (§9 de la política) |
| *Does this skill contain advertising?* | **No** | No hay publicidad ni analítica de terceros |
| *Export Compliance* | **Marcar** | Autocertificación estándar: no hay criptografía propia más allá de TLS |

**Testing Instructions.** El asterisco está en el campo de texto, **no** en las
casillas de Username/Password: para la **beta** basta con el texto y las
credenciales pueden quedar vacías, porque no hay revisor. Para **certificar** hay
que crear una **cuenta de prueba dedicada** (email aparte, con productos ya en el
inventario) y poner sus credenciales ahí — nunca la cuenta personal, que esas
credenciales las lee el equipo de certificación de Amazon.

El texto va en inglés porque lo lee el equipo de certificación, con las frases en
español tal cual hay que decirlas:

```text
This skill manages the pantry inventory and shopping list of a household kept in the Fill Good web app (a PWA). It does NOT use Alexa account linking and does NOT use App-to-App Account Linking: the speaker is paired by dictating a 6-digit code generated inside the app, so there is no OAuth login involved.

How to test:

1. Open https://fillgood.jorgemolinafuster.com and sign in with the test account above.
2. Go to "Ajustes" (Settings) and open "Alexa". Press "Generar el código". A 6-digit code appears, valid for 10 minutes and single use.
3. Say: "Alexa, dile a mi despensa que vincule con código" followed by the six digits. The skill replies "Listo, este altavoz ya está vinculado con ...".
4. Then try:
   - "Alexa, dile a mi despensa que reste dos yogures"  (subtract 2 yogurts from the inventory)
   - "Alexa, pregunta a mi despensa cuánta leche queda"  (ask how much milk is left)
   - "Alexa, dile a mi despensa que apunte pan"  (add bread to the shopping list)
   Every change is visible immediately in the app, under "Inventario" and "Lista".

Notes for the reviewer:

- Before pairing, any command answers "Este altavoz todavía no está vinculado a ningún hogar..." and sends a card with the pairing steps. That is the expected unlinked behaviour, not an error.
- The test account already has products in its inventory (milk, yogurt, rice). This is required: the skill never creates new catalogue products by voice, on purpose, so that a bad transcription cannot pollute the price history.
- Only one pairing code is alive per user: generating a new one invalidates the previous.
- No special permissions or hardware are requested. Any Echo device in es-ES is enough.
- Trademarks: "Fill Good" is the developer's own app and brand. The skill does not use any third-party trademark in its name, icon or responses.
```

Las tres últimas notas y el «does NOT use App-to-App» responden a lo que pide esa
pantalla: la viñeta de *trademarks* (decir que la marca es tuya evita que lo
pregunten), la de permisos y hardware, y el aviso de que si usas App-to-App la app
tiene que estar en Google Play o la App Store — que no es el caso.

> Ojo si dos revisores prueban a la vez con la misma cuenta: solo hay **un código
> vivo por usuario**, así que el segundo en generarlo invalida el del primero. Por
> eso se avisa en las notas.

## Texto de invitación a la beta

Amazon **ya no envía los emails**: el enlace lo reparte el desarrollador. Sirve
esto, cambiando el enlace:

```text
Asunto: Prueba «mi despensa», la voz de Fill Good para Alexa

Te invito a probar la skill de Fill Good para Alexa: sirve para ajustar el
inventario y la lista de la compra hablándole a un Echo, sin sacar el móvil.

1. Acepta la invitación aquí (con la MISMA cuenta de Amazon que usa tu Echo):
   ENLACE_DE_LA_BETA
2. Entra en Fill Good → Ajustes → Alexa y pulsa «Generar el código».
3. Dile al Echo: «Alexa, dile a mi despensa que vincule con código», y los seis
   dígitos que te salgan.

Ya puedes decir cosas como «Alexa, dile a mi despensa que reste dos yogures» o
«Alexa, pregunta a mi despensa cuánta leche queda».

Cuéntame qué se te ocurre decirle y no entienda: es justo lo que quiero saber.
```

Con el modo de **enlace público** no hace falta el email de nadie: se reparte el
enlace y se apuntan. Solo si gestionas la beta por **lista de emails** tiene que
coincidir el email invitado con el de la cuenta de Amazon del tester. En los dos
casos la beta **caduca a los 90 días** sin posibilidad de prórroga.
