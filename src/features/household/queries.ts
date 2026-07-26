import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/supabase/types";

/**
 * Cookie que fija cuál de los hogares del usuario está activo. httpOnly y
 * validada contra las membresías reales en cada request (un id ajeno no da
 * acceso: RLS filtra igualmente y aquí se descarta con fallback al primero).
 */
export const ACTIVE_HOUSEHOLD_COOKIE = "active_household";

export type CurrentHousehold = {
  id: string;
  name: string;
  inviteCode: string;
  role: MemberRole;
  monthlyBudget: number | null;
};

export type UserHousehold = CurrentHousehold & { joinedAt: string };

export type HouseholdMember = {
  userId: string;
  role: MemberRole;
  displayName: string | null;
  joinedAt: string;
  isCurrentUser: boolean;
};

type MembershipRow = {
  role: MemberRole;
  joined_at: string;
  household: {
    id: string;
    name: string;
    invite_code: string;
    created_at: string;
    monthly_budget: number | null;
  } | null;
};

/**
 * Todos los hogares del usuario actual, del más antiguo al más reciente.
 *
 * Envuelto en `cache()` (React): se llama en el layout (app), en el shell y
 * dentro de varias queries del mismo request; el cache lo deduplica a una sola
 * consulta por request (no persiste entre requests).
 */
export const getUserHouseholds = cache(async (): Promise<UserHousehold[]> => {
  const { userId } = await auth();
  if (!userId) return [];

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("household_members")
    .select(
      "role, joined_at, household:households(id, name, invite_code, created_at, monthly_budget)",
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as MembershipRow[];
  return rows.flatMap((row) =>
    row.household
      ? [
          {
            id: row.household.id,
            name: row.household.name,
            inviteCode: row.household.invite_code,
            role: row.role,
            monthlyBudget: row.household.monthly_budget,
            joinedAt: row.joined_at,
          },
        ]
      : [],
  );
});

/**
 * Hogar ACTIVO del usuario: el que fija la cookie si sigue siendo miembro de
 * él; si la cookie falta o apunta a un hogar del que ya no es miembro, el más
 * antiguo. null si no pertenece a ninguno → la app lo lleva a /onboarding.
 */
export const getCurrentHousehold = cache(
  async (): Promise<CurrentHousehold | null> => {
    const households = await getUserHouseholds();
    if (households.length === 0) return null;

    const cookieStore = await cookies();
    const activeId = cookieStore.get(ACTIVE_HOUSEHOLD_COOKIE)?.value;
    return households.find((h) => h.id === activeId) ?? households[0];
  },
);

/** Miembros de un hogar, ordenados por antigüedad. */
export async function getHouseholdMembers(
  householdId: string,
): Promise<HouseholdMember[]> {
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("household_members")
    .select("user_id, role, display_name, joined_at")
    .eq("household_id", householdId)
    .order("joined_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    displayName: m.display_name,
    joinedAt: m.joined_at,
    isCurrentUser: m.user_id === userId,
  }));
}
