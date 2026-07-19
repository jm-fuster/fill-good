import "server-only";

import { auth } from "@clerk/nextjs/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/supabase/types";

export type CurrentHousehold = {
  id: string;
  name: string;
  inviteCode: string;
  role: MemberRole;
};

export type HouseholdMember = {
  userId: string;
  role: MemberRole;
  displayName: string | null;
  joinedAt: string;
  isCurrentUser: boolean;
};

type MembershipRow = {
  role: MemberRole;
  household: {
    id: string;
    name: string;
    invite_code: string;
    created_at: string;
  } | null;
};

/**
 * Hogar del usuario actual (en el MVP, uno por usuario). null si no pertenece
 * a ninguno todavía → la app lo lleva a /onboarding.
 */
export async function getCurrentHousehold(): Promise<CurrentHousehold | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("household_members")
    .select("role, household:households(id, name, invite_code, created_at)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const row = data as unknown as MembershipRow | null;
  if (!row?.household) return null;

  return {
    id: row.household.id,
    name: row.household.name,
    inviteCode: row.household.invite_code,
    role: row.role,
  };
}

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
