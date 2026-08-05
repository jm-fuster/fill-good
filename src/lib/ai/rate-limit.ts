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
    "Has escaneado muchos tickets seguidos. Espera un poco y vuelve a intentarlo.",
  menu:
    "Has generado menús muchas veces seguidas. Espera un poco y vuelve a intentarlo.",
  recipe:
    "Has pedido muchas recetas seguidas. Espera un poco y vuelve a intentarlo.",
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

  if (error.message?.includes("rate_limited")) {
    return RATE_LIMITED_MESSAGE[kind];
  }

  console.error(`record_ai_usage (${kind}):`, error);
  return null; // fail-open: un fallo del contador no bloquea el uso
}
