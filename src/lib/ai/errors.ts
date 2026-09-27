import "server-only";

import { APICallError, LoadAPIKeyError, RetryError } from "ai";

export type AiErrorKind = "rate_limit" | "timeout" | "config" | "other";

function isAbortLike(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "TimeoutError" || e.name === "AbortError")
  );
}

/**
 * Clasifica un error de una llamada al AI SDK para dar un mensaje útil al
 * usuario (free tier de Gemini). Un 429/saturación no debe presentarse igual que
 * "foto borrosa". Tras los reintentos internos del SDK el error puede venir
 * envuelto en `RetryError` (`lastError`), así que se inspecciona en ambos niveles.
 */
export function classifyAiError(err: unknown): AiErrorKind {
  const unwrapped = RetryError.isInstance(err) ? err.lastError : err;

  // Timeout/abort: AbortSignal.timeout produce un DOMException TimeoutError; el
  // SDK puede además envolverlo en RetryError con reason "abort".
  if (RetryError.isInstance(err) && err.reason === "abort") return "timeout";
  if (isAbortLike(err) || isAbortLike(unwrapped)) return "timeout";

  // Rate limit: 429 en APICallError (posiblemente envuelto por RetryError).
  if (APICallError.isInstance(err) && err.statusCode === 429) return "rate_limit";
  if (APICallError.isInstance(unwrapped) && unwrapped.statusCode === 429) {
    return "rate_limit";
  }

  /*
    Configuración rota, que es lo que NO se distinguía y salía como «other»:
    falta o caduca `GOOGLE_GENERATIVE_AI_API_KEY`, o alguien pone un id de
    modelo que no existe en `AI_MODEL_*` (`getModel` no valida nada, así que el
    404 llega aquí). El usuario recibía entonces «prueba con una foto más
    nítida» —o «inténtalo de nuevo»— para SIEMPRE: reencuadraba, recortaba,
    repetía, y cada intento le gastaba cuota. El único rastro quedaba en un
    console.error del servidor que nadie mira si nadie sabe que hay que mirarlo.

    Se reconoce por el nombre del error de credenciales del SDK y por los 4xx
    que no son de cuota y que el propio SDK marca como no reintentables: un 400
    o un 404 no los arregla el usuario con otra foto, y volver a intentarlo
    tampoco.
  */
  if (isConfigLike(err) || isConfigLike(unwrapped)) return "config";

  return "other";
}

function isConfigLike(e: unknown): boolean {
  // `isInstance` y no `instanceof` ni el nombre: es la comprobación que expone
  // el SDK y la única que sobrevive a tener dos copias del paquete en el árbol.
  if (LoadAPIKeyError.isInstance(e)) return true;
  if (!APICallError.isInstance(e)) return false;
  const status = e.statusCode ?? 0;
  return status >= 400 && status < 500 && status !== 429 && !e.isRetryable;
}

/**
 * Lo que se registra de un fallo de IA: el tipo y el código, NUNCA el contenido.
 *
 * Registrar el error entero volcaba en los logs de Vercel lo que es del hogar:
 * `NoObjectGeneratedError.text` es la respuesta completa del modelo (las líneas
 * del ticket, la semana, la receta), `TypeValidationError.message` incrusta el
 * valor en JSON y `APICallError.requestBodyValues` lleva el prompt y el archivo.
 * La política de privacidad solo anuncia registros técnicos, y para depurar
 * basta con saber qué falló, no qué decía.
 */
export function aiErrorForLog(err: unknown): Record<string, unknown> {
  const unwrapped = RetryError.isInstance(err) ? err.lastError : err;
  const e = unwrapped instanceof Error ? unwrapped : null;
  return {
    kind: classifyAiError(err),
    name: e?.name ?? typeof unwrapped,
    ...(APICallError.isInstance(unwrapped)
      ? { statusCode: unwrapped.statusCode }
      : {}),
    ...(RetryError.isInstance(err) ? { retryReason: err.reason } : {}),
  };
}
