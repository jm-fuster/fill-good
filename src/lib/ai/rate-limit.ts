import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export type AiRateKind = "receipt" | "menu" | "recipe";

/**
 * Mensaje por tipo de uso. Va en un mapa y no en un ternario porque un tipo
 * nuevo sin su texto es un error de compilación, mientras que el ternario le
 * daba callado el mensaje del otro («has generado menús…» al pedir una receta).
 */
const RATE_LIMITED_MESSAGE: Record<AiRateKind, string> = {
  receipt:
    "Has escaneado muchos tickets en la última hora. Prueba de nuevo dentro de unos minutos.",
  menu: "Has generado menús muchas veces en la última hora. Prueba de nuevo dentro de unos minutos.",
  recipe:
    "Has pedido muchas recetas en la última hora. Prueba de nuevo dentro de unos minutos.",
};

/**
 * Registra un uso de IA del usuario y aplica el límite por ventana (RPC
 * `record_ai_usage`, ver migración 20260728130000_ai_rate_limit). Protege la
 * cuota gratuita compartida de Gemini frente al abuso de una sola cuenta.
 *
 * Devuelve un mensaje de error si se superó el límite (la acción debe abortar),
 * o `null` si se puede continuar. Fail-open ante cualquier otro error (p. ej.
 * si la migración aún no está aplicada): un fallo del contador no debe impedir
 * usar la app.
 *
 * Ojo con el reparto de los límites: el `case` de la RPC nombra solo 'receipt'
 * (20/h) y 'menu' (15/h), así que **'recipe' se apoya en su rama `else`**, que
 * son 10/h. Es a propósito —10 recetas por hora sobran para escribir cómo se
 * cocina un plato, y añadir una rama que dijera lo mismo obligaba a reemplazar
 * la función—, pero significa que tocar ese `else` cambia el límite de las
 * recetas sin que se lea la palabra «recipe» en ningún sitio.
 */
export async function enforceAiRateLimit(
  supabase: SupabaseClient<Database>,
  kind: AiRateKind,
): Promise<string | null> {
  const { error } = await supabase.rpc("record_ai_usage", { p_kind: kind });
  if (!error) return null;

  /*
    Se reconoce por SUBCADENA a propósito, y no por igualdad ni por el SQLSTATE.
    Se intentó endurecerlo (`code === "P0001"` + mensaje exacto) y es peor
    cambio del que parece: los dos fallos posibles no cuestan lo mismo. Un falso
    positivo —otro error de Postgres que algún día arrastre este texto— bloquea
    una acción una vez y el usuario reintenta; un falso negativo deja de aplicar
    el límite ENTERO y en silencio, que es justo el agujero por el que una sola
    cuenta puede agotar la cuota compartida de Gemini para todos los hogares.
    Ante la duda sobre la forma exacta en que PostgREST envuelve el mensaje, se
    prefiere pasarse de sensible.
  */
  if (error.message?.includes("rate_limited")) {
    return RATE_LIMITED_MESSAGE[kind];
  }

  /*
    `not_authenticated` NO es fail-open: si la RPC no reconoce la sesión, seguir
    adelante sería llamar a Gemini sin contador de ningún tipo. Del resto (la
    migración todavía sin aplicar, un fallo transitorio) sí se sale abierto a
    propósito: un contador roto no puede dejar la app inservible.
  */
  if (error.message?.includes("not_authenticated")) {
    return "No se pudo verificar tu sesión. Vuelve a entrar e inténtalo de nuevo.";
  }

  console.error(`record_ai_usage (${kind}):`, error);
  return null; // fail-open: un fallo del contador no bloquea el uso
}

/**
 * Devuelve la unidad de cuota que `enforceAiRateLimit` acaba de apuntar, para
 * cuando la llamada a la IA no llega a dar nada aprovechable.
 *
 * El apunte va por delante porque es lo que hace atómico el límite (ver la
 * migración `..._ai_cuota_se_devuelve_si_falla`), pero cobrarlo pase lo que
 * pase convertía los fallos del SERVICIO en castigos al usuario: con el free
 * tier saturado, veinte reintentos obedientes agotaban el cupo y la app pasaba
 * a acusarle de escanear demasiados tickets sin haber leído ninguno.
 *
 * Silenciosa por definición: esto corre dentro del `catch` de un fallo que ya
 * se le va a contar al usuario, así que si la devolución tampoco sale, lo único
 * que pasa es que el contador se queda como estaba —y añadir un segundo mensaje
 * de error encima del primero no le sirve a nadie—.
 */
export async function refundAiUsage(
  supabase: SupabaseClient<Database>,
  kind: AiRateKind,
): Promise<void> {
  const { error } = await supabase.rpc("refund_ai_usage", { p_kind: kind });
  if (error) console.error(`refund_ai_usage (${kind}):`, error);
}
