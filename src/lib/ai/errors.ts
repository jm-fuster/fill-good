import "server-only";

import { APICallError, RetryError } from "ai";

export type AiErrorKind = "rate_limit" | "timeout" | "other";

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

  return "other";
}
