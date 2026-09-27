import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/** ¿Se ha opuesto esta persona a la medición de uso? Ante la duda, `false`. */
export async function getUsageOptOut(): Promise<boolean> {
  const { data, error } = await createServerSupabaseClient().rpc(
    "get_usage_opt_out",
  );
  if (error) {
    console.warn("get_usage_opt_out:", error.message);
    return false;
  }
  return data === true;
}
