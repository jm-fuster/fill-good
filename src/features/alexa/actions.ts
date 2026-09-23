"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";

export type GenerateCodeState = {
  error?: string;
  code?: string;
  /** ISO del momento en que el código deja de valer. */
  expiresAt?: string;
};

/**
 * Genera el código de 6 dígitos que se le dicta al Echo para vincularlo con el
 * hogar activo. Solo hay un código vivo por usuario: generar otro invalida el
 * anterior, así que si alguien se queda a medias no deja códigos sueltos por ahí.
 *
 * El primer dígito nunca es cero: el slot AMAZON.NUMBER devuelve el número
 * parseado, así que un «cero cuatro dos…» llegaría con cinco cifras y no casaría
 * nunca (la restricción de la tabla lo garantiza también en la base).
 *
 * El código lo genera la base (`create_alexa_link_code`), no esta acción: el
 * cliente insertaba el suyo con la caducidad que quisiera, y como el código es
 * clave primaria global, un alta masiva delataba los códigos vivos de otros
 * hogares. La RPC comprueba la membresía y firma a tu nombre.
 */
export async function generateAlexaCodeAction(): Promise<GenerateCodeState> {
  const [household, { userId }] = await Promise.all([
    getCurrentHousehold(),
    auth(),
  ]);
  if (!household) return { error: "No perteneces a ningún hogar." };
  if (!userId) return { error: "Debes iniciar sesión." };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_alexa_link_code", {
    p_household_id: household.id,
  });
  const row = data?.[0];
  if (error || !row) {
    if (error) console.error("create_alexa_link_code:", error);
    return { error: "No se pudo generar el código. Inténtalo otra vez." };
  }
  return { code: row.code, expiresAt: row.expires_at };
}

/**
 * Revoca un altavoz. Cualquier miembro puede hacerlo (el Echo es del hogar, no
 * de quien lo vinculó), y es reversible: basta generar otro código y volver a
 * dictarlo.
 */
export async function unlinkAlexaAction(
  linkId: string,
): Promise<{ error?: string; ok?: boolean }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("alexa_links")
    .delete()
    .eq("household_id", household.id)
    .eq("id", linkId);
  if (error) return { error: "No se pudo desvincular el altavoz." };

  // La subpágina muestra la lista de altavoces; el índice de Ajustes muestra el
  // contador en su fila («1 altavoz»), así que los dos se quedan obsoletos.
  revalidatePath("/ajustes/alexa");
  revalidatePath("/ajustes");
  return { ok: true };
}
