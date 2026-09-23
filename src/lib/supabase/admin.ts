import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Cliente Supabase con la service-role key, para código de servidor que corre
 * SIN sesión de usuario: crons y el webhook de Alexa. `createServerSupabaseClient`
 * no sirve ahí, porque exige el JWT de Clerk.
 *
 * ⚠️ ESTE CLIENTE SE SALTA LA RLS POR COMPLETO. Las políticas no filtran nada,
 * así que el aislamiento por hogar depende ÍNTEGRAMENTE de que cada consulta
 * lleve su `.eq("household_id", …)` con un id ya verificado (el del vínculo, el
 * de la suscripción…), nunca uno que venga del payload de entrada. Es la versión
 * extrema de la regla de AGENTS.md: «la RLS no acota al hogar activo, acótalo tú».
 *
 * No usarlo en Server Actions ni en Server Components: ahí hay JWT de Clerk y el
 * cliente normal (`createServerSupabaseClient`) es la opción correcta y segura.
 * Única excepción, deliberada: `refundAiUsage` (`lib/ai/rate-limit.ts`), porque
 * devolver cuota de IA no puede estar al alcance de ninguna sesión.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para el cliente admin.",
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}
