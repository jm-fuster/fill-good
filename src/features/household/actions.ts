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

export async function leaveHouseholdAction(): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("user_id", userId);
  if (error) {
    return { error: "No se pudo abandonar el hogar." };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}
