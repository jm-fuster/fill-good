# Ficha de la skill para la consola de Amazon

Textos listos para copiar en **Distribution → Skill Preview** y respuestas para
**Distribution → Privacy & Compliance**. Hacen falta igual para la **beta** que
para publicar: sin estos campos completos la beta no se puede crear (ver
[README](./README.md) § «Abrirla a otros usuarios»).

> Sustituye `TU-DOMINIO` por el dominio de producción de Vercel antes de pegar
> las URLs.

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

1. Entra en Fill Good, en Perfil, y busca la tarjeta de Alexa.
2. Pulsa «Vincular un altavoz»: te da un código de seis dígitos.
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
Privacy Policy URL: https://TU-DOMINIO/privacidad
Terms of Use URL:   https://TU-DOMINIO/terminos
```

## Privacy & Compliance

| Pregunta | Respuesta | Por qué |
| --- | --- | --- |
| ¿Recoge información personal de los usuarios? | **Sí** | Guarda el identificador opaco de Alexa y actúa sobre el contenido del hogar. Está descrito en `/privacidad` (§2, §3, §4 y §7) |
| ¿Está dirigida a menores? | **No** | La app no se dirige a menores de 14 años (§9 de la política) |
| ¿Contiene publicidad? | **No** | No hay publicidad ni analítica de terceros |
| ¿Usa compras dentro de la skill? | **No** | — |
| ¿Cumple las leyes de exportación de EE. UU.? | **Sí** | Marcar la casilla |
| ¿Contiene contenido para adultos, apuestas o alcohol? | **No** | — |

**Testing instructions** (solo para certificación, no para la beta): el revisor
necesita una cuenta de Fill Good para generar el código, así que hay que darle
credenciales de una cuenta de prueba con productos ya en el inventario, y los
tres pasos de la vinculación.

## Texto de invitación a la beta

Amazon **ya no envía los emails**: el enlace lo reparte el desarrollador. Sirve
esto, cambiando el enlace:

```text
Asunto: Prueba «mi despensa», la voz de Fill Good para Alexa

Te invito a probar la skill de Fill Good para Alexa: sirve para ajustar el
inventario y la lista de la compra hablándole a un Echo, sin sacar el móvil.

1. Acepta la invitación aquí (con la MISMA cuenta de Amazon que usa tu Echo):
   ENLACE_DE_LA_BETA
2. Entra en Fill Good → Perfil → Alexa y pulsa «Vincular un altavoz».
3. Dile al Echo: «Alexa, dile a mi despensa que vincule con código», y los seis
   dígitos que te salgan.

Ya puedes decir cosas como «Alexa, dile a mi despensa que reste dos yogures» o
«Alexa, pregunta a mi despensa cuánta leche queda».

Cuéntame qué se te ocurre decirle y no entienda: es justo lo que quiero saber.
```

Ojo: la cuenta de Amazon del tester tiene que ser la del email invitado, y la
beta **caduca a los 90 días** sin posibilidad de prórroga.
