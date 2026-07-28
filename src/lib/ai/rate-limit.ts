import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export type AiRateKind = "receipt" | "menu";

/**
 * Registra un uso de IA del usuario y aplica el límite por ventana (RPC
 * `record_ai_usage`, ver migración 20260728130000_ai_rate_limit). Protege la
 * cuota gratuita compartida de Gemini frente al abuso de una sola cuenta.
 *
 * Devuelve un mensaje de error si se superó el límite (la acción debe abortar),
 * o `null` si se puede continuar. Fail-open ante cualquier otro error (p. ej.
 * si la migración aún no está aplicada): un fallo del contador no debe impedir
 * usar la app.
 */
export async function enforceAiRateLimit(
  supabase: SupabaseClient<Database>,
  kind: AiRateKind,
): Promise<string | null> {
  const { error } = await supabase.rpc("record_ai_usage", { p_kind: kind });
  if (!error) return null;

  if (error.message?.includes("rate_limited")) {
    return kind === "receipt"
      ? "Has escaneado muchos tickets seguidos. Espera un poco y vuelve a intentarlo."
      : "Has generado menús muchas veces seguidas. Espera un poco y vuelve a intentarlo.";
  }

  console.error(`record_ai_usage (${kind}):`, error);
  return null; // fail-open: un fallo del contador no bloquea el uso
}
