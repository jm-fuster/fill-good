"use server";

import { randomInt } from "node:crypto";

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

/** Intentos ante una colisión del código (con un millón de combinaciones, sobra). */
const CODE_ATTEMPTS = 3;

/**
 * Genera el código de 6 dígitos que se le dicta al Echo para vincularlo con el
 * hogar activo. Solo hay un código vivo por usuario: generar otro invalida el
 * anterior, así que si alguien se queda a medias no deja códigos sueltos por ahí.
 *
 * El primer dígito nunca es cero: el slot AMAZON.NUMBER devuelve el número
 * parseado, así que un «cero cuatro dos…» llegaría con cinco cifras y no casaría
 * nunca (la restricción de la tabla lo garantiza también en la base).
 *
 * Usa el cliente con JWT de Clerk a propósito: las políticas de la tabla
 * comprueban que eres miembro del hogar y que el código sale a tu nombre. El
 * cliente service-role solo lo toca el webhook, que no tiene sesión.
 */
export async function generateAlexaCodeAction(): Promise<GenerateCodeState> {
  const [household, { userId }] = await Promise.all([
    getCurrentHousehold(),
    auth(),
  ]);
  if (!household) return { error: "No perteneces a ningún hogar." };
  if (!userId) return { error: "Debes iniciar sesión." };

  const supabase = createServerSupabaseClient();
  await supabase.from("alexa_link_codes").delete().eq("user_id", userId);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = String(randomInt(100_000, 1_000_000));
    const { data, error } = await supabase
      .from("alexa_link_codes")
      .insert({ code, household_id: household.id, user_id: userId })
      .select("code, expires_at")
      .single();
    if (!error && data) {
      return { code: data.code, expiresAt: data.expires_at };
    }
    // 23505 = clave duplicada: otro hogar tiene ese código vivo. Se reintenta.
    if (error && error.code !== "23505") {
      return { error: "No se pudo generar el código." };
    }
  }
  return { error: "No se pudo generar el código. Inténtalo otra vez." };
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
