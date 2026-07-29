import { z } from "zod";

import type { PendingState } from "./respond";

/**
 * Forma del "envelope" que envía Alexa. Se modela solo lo que usamos: zod
 * descarta las claves desconocidas, así que los campos que Amazon añada con el
 * tiempo (device, apiAccessToken, viewport…) no rompen nada.
 *
 * `request.type` se valida como string y NO como unión discriminada a propósito:
 * Alexa envía tipos que no manejamos (`System.ExceptionEncountered`,
 * `SessionResumedRequest`…) y una unión los rechazaría con un 400, cuando lo
 * correcto es responder 200 sin hacer nada.
 */

const slotSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
  // Entity resolution: cuando el valor dicho casa con un valor del slot type,
  // Amazon devuelve aquí el `id` canónico que definimos en el modelo (para
  // `unidad` es directamente el UnitType del repo: 'g', 'kg', 'ud'…).
  resolutions: z
    .object({
      resolutionsPerAuthority: z
        .array(
          z.object({
            status: z.object({ code: z.string() }),
            values: z
              .array(
                z.object({
                  value: z.object({
                    name: z.string(),
                    id: z.string().optional(),
                  }),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const intentSchema = z.object({
  name: z.string(),
  slots: z.record(z.string(), slotSchema).optional(),
});

const applicationSchema = z.object({ applicationId: z.string() });
const userSchema = z.object({ userId: z.string() });

const unitSchema = z.enum(["ud", "g", "kg", "ml", "l"]);
const voiceActionSchema = z.enum([
  "restar",
  "tirar",
  "sumar",
  "agotar",
  "estropear",
  "consultar",
  "apuntar",
]);

/**
 * La pregunta que dejamos abierta en el turno anterior, de vuelta desde el
 * dispositivo. Es un espejo de `PendingState` (respond.ts), y se valida con el
 * mismo rigor que el resto del envelope: Alexa devuelve lo que le dimos, pero
 * llega por la red y aquí no se da nada por bueno. `getPending` declara el tipo
 * de retorno, así que el compilador avisa si los dos lados se separan.
 */
const pendingSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("apuntar"),
    productId: z.string(),
    name: z.string(),
    normalized: z.string(),
  }),
  z.object({
    tipo: z.literal("elegir"),
    accion: voiceActionSchema,
    candidatos: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
    cantidad: z.number().nullable().default(null),
    unidad: unitSchema.nullable().default(null),
  }),
  z.object({
    tipo: z.literal("unidad"),
    accion: voiceActionSchema,
    productId: z.string(),
    name: z.string(),
  }),
]);

export const alexaEnvelopeSchema = z.object({
  version: z.string().optional(),
  // `session` viaja en Launch/Intent/SessionEnded, pero no en todos los tipos de
  // petición; `context.System` lleva los mismos ids y sirve de respaldo.
  session: z
    .object({
      new: z.boolean().optional(),
      sessionId: z.string().optional(),
      application: applicationSchema.optional(),
      user: userSchema.optional(),
      // Lo que devolvimos como `sessionAttributes` en el turno anterior. Viene
      // del dispositivo, así que se valida como cualquier otra entrada.
      //
      // Cada campo lleva su `.catch`: un atributo con una forma que no
      // reconocemos (una versión anterior de la skill todavía en vuelo, por
      // ejemplo) tiene que valer como «no había nada pendiente», nunca tumbar la
      // petición entera con un 400. Lo peor que pasa es que el usuario repita.
      attributes: z
        .object({
          pendiente: pendingSchema.optional().catch(undefined),
          conversacion: z.literal(true).optional().catch(undefined),
        })
        .optional(),
    })
    .optional(),
  context: z
    .object({
      System: z
        .object({
          application: applicationSchema.optional(),
          user: userSchema.optional(),
        })
        .optional(),
    })
    .optional(),
  request: z.object({
    type: z.string(),
    requestId: z.string().optional(),
    timestamp: z.string().optional(),
    locale: z.string().optional(),
    intent: intentSchema.optional(),
  }),
});

export type AlexaEnvelope = z.infer<typeof alexaEnvelopeSchema>;
export type AlexaIntent = z.infer<typeof intentSchema>;

/** Id de la skill que envía la petición (para cotejarlo con ALEXA_SKILL_ID). */
export function getApplicationId(envelope: AlexaEnvelope): string | null {
  return (
    envelope.session?.application?.applicationId ??
    envelope.context?.System?.application?.applicationId ??
    null
  );
}

/** Id opaco del usuario de Amazon: la clave del vínculo con el hogar. */
export function getAmazonUserId(envelope: AlexaEnvelope): string | null {
  return (
    envelope.session?.user?.userId ??
    envelope.context?.System?.user?.userId ??
    null
  );
}

/** La pregunta que dejamos abierta en el turno anterior, si la hubo. */
export function getPending(envelope: AlexaEnvelope): PendingState | null {
  return envelope.session?.attributes?.pendiente ?? null;
}

/** ¿Abrió el usuario la skill, en vez de soltar una orden de una tacada? */
export function isConversationMode(envelope: AlexaEnvelope): boolean {
  return envelope.session?.attributes?.conversacion === true;
}

/** Valor dicho de un slot, tal cual (sin normalizar). */
export function getSlotValue(
  intent: AlexaIntent | undefined,
  name: string,
): string | null {
  const raw = intent?.slots?.[name]?.value?.trim();
  return raw ? raw : null;
}

/**
 * Id canónico de un slot resuelto por entity resolution, o null si Alexa no lo
 * reconoció (`ER_SUCCESS_NO_MATCH`) o el usuario dijo otra cosa. Nunca se cae al
 * valor dicho: para eso está {@link getSlotValue}.
 */
export function getSlotResolutionId(
  intent: AlexaIntent | undefined,
  name: string,
): string | null {
  const authorities = intent?.slots?.[name]?.resolutions?.resolutionsPerAuthority;
  for (const authority of authorities ?? []) {
    if (authority.status.code !== "ER_SUCCESS_MATCH") continue;
    const id = authority.values?.[0]?.value.id;
    if (id) return id;
  }
  return null;
}

/** Valor numérico de un slot AMAZON.NUMBER, o null si no es un número usable. */
export function getSlotNumber(
  intent: AlexaIntent | undefined,
  name: string,
): number | null {
  const raw = getSlotValue(intent, name);
  if (raw === null) return null;
  // Alexa usa punto decimal en es-ES ("1.5"), pero por si acaso se admite coma.
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/**
 * Posición dicha con un ordinal: «la primera» → 1. AMAZON.Ordinal entrega el
 * número en el valor del slot, así que se lee como cualquier otro número, pero
 * se exige entero y positivo antes de usarlo como índice.
 */
export function getSlotOrdinal(
  intent: AlexaIntent | undefined,
  name: string,
): number | null {
  const value = getSlotNumber(intent, name);
  if (value === null || !Number.isInteger(value) || value < 1) return null;
  return value;
}

/**
 * Cantidad dicha, juntando el número con la fracción: «dos kilos» → 2, «medio
 * kilo» → 0,5, «un cuarto de kilo» → 0,25. null si no dijo ninguna.
 *
 * Hace falta porque **AMAZON.NUMBER no resuelve las fracciones del castellano**:
 * «medio» no es un numeral y llega vacío, así que «quita medio kilo de arroz»
 * —el ejemplo que el propio README anuncia— restaba uno. Las fracciones vienen
 * por el slot `fraccion`, un tipo propio cuyo id ES el multiplicador.
 *
 * Se multiplica en vez de elegir uno de los dos porque el numeral y la fracción
 * conviven de verdad: en «un cuarto de kilo», Alexa puede rellenar `cantidad`
 * con el «un» y `fraccion` con el «cuarto», y 1 × 0,25 es la lectura correcta.
 */
export function getSpokenQuantity(
  intent: AlexaIntent | undefined,
): number | null {
  const number = getSlotNumber(intent, "cantidad");
  const rawFraction = getSlotResolutionId(intent, "fraccion");
  if (rawFraction === null) return number;
  const fraction = Number(rawFraction);
  if (!Number.isFinite(fraction) || fraction <= 0) return number;
  return (number ?? 1) * fraction;
}
