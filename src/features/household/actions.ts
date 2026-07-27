"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ACTIVE_HOUSEHOLD_COOKIE,
  getCurrentHousehold,
  getUserHouseholds,
} from "./queries";
import {
  createHouseholdSchema,
  joinHouseholdSchema,
  renameHouseholdSchema,
} from "./schemas";

export type ActionState = { error?: string };

const ACTIVE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
} as const;

/** Marca un hogar como activo para los próximos requests. */
async function setActiveHouseholdCookie(householdId: string) {
  (await cookies()).set(
    ACTIVE_HOUSEHOLD_COOKIE,
    householdId,
    ACTIVE_COOKIE_OPTIONS,
  );
}

/**
 * Cambia el hogar activo (E-multihogar): el usuario puede pertenecer a varios
 * hogares (segunda residencia, casa de vacaciones…) y alternar entre ellos.
 * La membresía se valida contra la BD; un id ajeno no cambia nada.
 */
export async function switchHouseholdAction(
  householdId: string,
): Promise<ActionState> {
  const households = await getUserHouseholds();
  const target = households.find((h) => h.id === householdId);
  if (!target) return { error: "No perteneces a ese hogar." };

  await setActiveHouseholdCookie(target.id);
  revalidatePath("/", "layout");
  redirect("/inventario");
}

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
  const { data, error } = await supabase.rpc("create_household", {
    p_name: parsed.data.name,
    p_display_name: parsed.data.displayName ?? null,
  });
  if (error) {
    return { error: "No se pudo crear el hogar. Inténtalo de nuevo." };
  }

  // El hogar recién creado pasa a ser el activo (puede ser el segundo o más).
  if (data) await setActiveHouseholdCookie(data);

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
  const { data, error } = await supabase.rpc("join_household_by_code", {
    p_code: parsed.data.code,
    p_display_name: parsed.data.displayName ?? null,
  });
  if (error) {
    // rate_limited: demasiados intentos fallidos (anti fuerza-bruta de códigos).
    const message = error.message?.includes("rate_limited")
      ? "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."
      : "No se pudo unir al hogar. Inténtalo de nuevo.";
    return { error: message };
  }
  if (!data) {
    // El RPC devuelve null cuando el código no corresponde a ningún hogar.
    return { error: "Ese código no corresponde a ningún hogar." };
  }

  // El hogar al que se une (o al que ya pertenecía) pasa a ser el activo.
  await setActiveHouseholdCookie(data);

  revalidatePath("/", "layout");
  redirect("/inventario");
}

export type BudgetState = { error?: string; ok?: boolean };

/**
 * Objetivo de gasto mensual del hogar (M1). Vacío = sin objetivo (null). El
 * UPDATE va directo: households tiene política RLS de update para miembros.
 */
export async function updateMonthlyBudgetAction(
  _prev: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const raw = String(formData.get("budget") ?? "")
    .trim()
    .replace(",", ".");
  let budget: number | null = null;
  if (raw !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return { error: "Introduce un importe válido." };
    }
    budget = Math.round(n * 100) / 100;
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("households")
    .update({ monthly_budget: budget })
    .eq("id", household.id);
  if (error) return { error: "No se pudo guardar el objetivo." };

  revalidatePath("/ajustes");
  revalidatePath("/precios");
  revalidatePath("/perfil");
  return { ok: true };
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

  revalidatePath("/ajustes/hogar");
  return {};
}

export async function renameHouseholdAction(
  formData: FormData,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  if (household.role !== "owner") {
    return { error: "Solo el propietario puede cambiar el nombre del hogar." };
  }

  const parsed = renameHouseholdSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  // RPC en vez de UPDATE directo: el hardening dejó a los miembros solo la
  // columna monthly_budget; rename_household reimpone "solo owner" en la BD.
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("rename_household", {
    p_household_id: household.id,
    p_name: parsed.data.name,
  });
  if (error) {
    return { error: "No se pudo cambiar el nombre. Inténtalo de nuevo." };
  }

  // El nombre aparece en el shell (switcher de hogares), no solo en /ajustes.
  revalidatePath("/", "layout");
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

  // Sin cookie, el hogar activo vuelve al más antiguo que quede; si no queda
  // ninguno, /onboarding se encarga (y si queda alguno, redirige a la app).
  (await cookies()).delete(ACTIVE_HOUSEHOLD_COOKIE);

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

  // Igual que al eliminar: el fallback decide el siguiente hogar activo.
  (await cookies()).delete(ACTIVE_HOUSEHOLD_COOKIE);

  revalidatePath("/", "layout");
  redirect("/onboarding");
}
