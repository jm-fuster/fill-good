import { z } from "zod";

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
      attributes: z
        .object({
          pendiente: z
            .object({
              productId: z.string(),
              name: z.string(),
              normalized: z.string(),
            })
            .optional(),
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

/** Producto agotado en el turno anterior que espera un sí para ir a la lista. */
export function getPendingProduct(
  envelope: AlexaEnvelope,
): { productId: string; name: string; normalized: string } | null {
  return envelope.session?.attributes?.pendiente ?? null;
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
