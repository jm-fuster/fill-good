import "server-only";

/**
 * Red de seguridad para una Server Action: registra el fallo con una etiqueta
 * buscable y devuelve un texto que el usuario pueda leer —y repetir— en vez de
 * un 500.
 *
 * Por qué hace falta. Una excepción sin capturar en una acción sale como error
 * de servidor, y en producción Next borra el mensaje a propósito («omitted in
 * production builds to avoid leaking sensitive details»): al cliente solo le
 * llega un `digest`, que es un hash y no se puede revertir. Resultado: el
 * usuario ve una pantalla rota, quien programa ve un número, y para saber qué
 * pasó de verdad hay que ir a buscar ese número al log del servidor. Es la peor
 * combinación posible justo cuando algo se rompe en manos de alguien.
 *
 * Lo que se devuelve incluye el TIPO de fallo (`failureLabel`), y eso es
 * deliberado: `PGRST303`, `ClerkAPIResponseError` o `AI_LoadAPIKeyError` no son
 * datos de nadie —no llevan filas, ni tokens, ni identificadores— y son
 * exactamente lo que convierte «algo ha fallado» en un diagnóstico. El mensaje
 * completo del error se queda en el servidor, que es donde debe estar.
 */

/**
 * Un rótulo corto de qué CLASE de fallo fue, o null si no se reconoce nada.
 *
 * El `code` va antes que el `name` porque es más específico donde más falta
 * hace: los errores de PostgREST llegan como objeto plano —sin `name` útil— y su
 * código (`PGRST303`, `42501`…) dice de un vistazo si fue el reloj del JWT, un
 * permiso o el esquema.
 */
export function failureLabel(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { name?: unknown; code?: unknown };
  if (typeof e.code === "string" && e.code.length > 0 && e.code.length <= 40) {
    return e.code;
  }
  if (typeof e.name === "string" && e.name.length > 0 && e.name !== "Error") {
    return e.name.slice(0, 40);
  }
  return null;
}

/**
 * Registra el fallo y devuelve el mensaje para el usuario.
 *
 * @param where Nombre de la acción. Va en el log con el prefijo `[Fill Good]`
 *   para poder encontrarlo por texto, sin depender del `digest`.
 */
export function serverFailureMessage(where: string, err: unknown): string {
  console.error(`[Fill Good] ${where} falló:`, err);
  const label = failureLabel(err);
  return label
    ? `Algo ha fallado en el servidor (${label}). Vuelve a intentarlo.`
    : "Algo ha fallado en el servidor. Vuelve a intentarlo.";
}
