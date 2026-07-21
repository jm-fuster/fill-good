"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "./queries";
import { createHouseholdSchema, joinHouseholdSchema } from "./schemas";

export type ActionState = { error?: string };

export async function createHouseholdAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };

  const parsed = createHouseholdSchema.safeParse({
    name: formData.get("name"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("create_household", {
    p_name: parsed.data.name,
    p_display_name: parsed.data.displayName ?? null,
  });
  if (error) {
    return { error: "No se pudo crear el hogar. Inténtalo de nuevo." };
  }

  revalidatePath("/", "layout");
  redirect("/inventario");
}

export async function joinHouseholdAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };

  const parsed = joinHouseholdSchema.safeParse({
    code: formData.get("code"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("join_household_by_code", {
    p_code: parsed.data.code,
    p_display_name: parsed.data.displayName ?? null,
  });
  if (error) {
    const message = error.message?.includes("invalid_code")
      ? "Ese código no corresponde a ningún hogar."
      : "No se pudo unir al hogar. Inténtalo de nuevo.";
    return { error: message };
  }

  revalidatePath("/", "layout");
  redirect("/inventario");
}

export async function regenerateInviteCodeAction(): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("regenerate_invite_code", {
    p_household_id: household.id,
  });
  if (error) {
    return { error: "No se pudo regenerar el código." };
  }

  revalidatePath("/ajustes");
  return {};
}

export async function transferOwnershipAction(
  newOwnerUserId: string,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  if (household.role !== "owner") {
    return { error: "Solo el propietario puede transferir el hogar." };
  }
  if (!newOwnerUserId) return { error: "Elige un miembro." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("transfer_household_ownership", {
    p_household_id: household.id,
    p_new_owner_user_id: newOwnerUserId,
  });
  if (error) {
    return { error: "No se pudo transferir la propiedad. Inténtalo de nuevo." };
  }

  revalidatePath("/", "layout");
  return {};
}

export async function deleteHouseholdAction(): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  if (household.role !== "owner") {
    return { error: "Solo el propietario puede eliminar el hogar." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_household", {
    p_household_id: household.id,
  });
  if (error) {
    return { error: "No se pudo eliminar el hogar. Inténtalo de nuevo." };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function leaveHouseholdAction(): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  // La garantía fuerte vive en la BD: leave_household aplica las reglas de
  // propiedad y filtra por hogar (corrige el borrado por solo user_id).
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("leave_household", {
    p_household_id: household.id,
  });
  if (error) {
    const message = error.message?.includes("owner_must_transfer")
      ? "Eres el propietario: transfiere la propiedad a otro miembro antes de abandonar el hogar."
      : "No se pudo abandonar el hogar.";
    return { error: message };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}
