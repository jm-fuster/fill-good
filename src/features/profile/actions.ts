"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";
import { updateDisplayNameSchema } from "./schemas";

export type ProfileActionState = { error?: string };

/**
 * Cambia tu nombre dentro del hogar ACTIVO (`household_members.display_name`):
 * el que ven tus convivientes en el inventario y en la lista de miembros.
 *
 * La foto de perfil no pasa por aquí: vive en Clerk y se sube desde el cliente
 * (ver profile-editor.tsx), así que no hay Storage ni columna propia que
 * mantener.
 */
export async function updateDisplayNameAction(
  formData: FormData,
): Promise<ProfileActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const parsed = updateDisplayNameSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("set_member_display_name", {
    p_household_id: household.id,
    p_display_name: parsed.data.name,
  });
  if (error) {
    return { error: "No se pudo guardar el nombre. Inténtalo de nuevo." };
  }

  // El nombre no solo se pinta en /perfil: firma los movimientos del inventario
  // y aparece en la lista de miembros del hogar.
  revalidatePath("/", "layout");
  return {};
}
