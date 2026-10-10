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
  /**
   * Cuándo deja de valer el código (7 días desde que se creó el hogar o se
   * regeneró; lo exige `join_household_by_code`). La pantalla de invitar tiene
   * que saberlo: sin esto repartía enlaces muertos en todo hogar con más de una
   * semana, y quien los recibía solo veía «no corresponde a ningún hogar».
   */
  inviteCodeExpiresAt: string;
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
    invite_code_expires_at: string;
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
      "role, joined_at, household:households(id, name, invite_code, invite_code_expires_at, created_at, monthly_budget)",
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
            inviteCodeExpiresAt: row.household.invite_code_expires_at,
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

/**
 * Id del hogar ACTIVO, o null si el usuario no pertenece a ninguno.
 *
 * Atajo para las consultas que solo necesitan acotar por `household_id`. Es
 * OBLIGATORIO acotar: la RLS solo comprueba «¿eres miembro de este hogar?», así
 * que en un usuario con varios hogares una consulta sin `.eq("household_id", …)`
 * devuelve las filas de TODOS ellos mezcladas (y las que usan `.maybeSingle()`
 * fallan directamente con múltiples filas).
 */
export const getActiveHouseholdId = cache(async (): Promise<string | null> => {
  return (await getCurrentHousehold())?.id ?? null;
});

/**
 * Cuántos tickets recientes se miran para deducir dónde compra el hogar. Cota de
 * coste (la consulta entra en el render de /inventario y en el escaneo de un
 * ticket) y de frescura: si el hogar se mudó de barrio hace 300 tickets, esas
 * tiendas ya no son las suyas.
 */
const RECEIPTS_FOR_CHAIN_HINT = 200;

/**
 * Cadenas que aparecen en los tickets recientes del hogar, de la más frecuente a
 * la menos. Se ignora `"otro"` (no identifica una tienda) igual que en la
 * inferencia por producto de `prices/infer-chain.ts`.
 *
 * Consulta `receipts` (una fila por ticket) y no `receipt_items`: es la tabla
 * pequeña y aquí no hacen falta las líneas.
 *
 * A diferencia de `infer-chain.ts` NO exige un mínimo de compras: allí una mala
 * inferencia cambia el consejo de ahorro de un producto, y aquí lo único que
 * está en juego es el orden de un selector y una pista para la IA. Con un solo
 * ticket de una cadena ya merece salir primero.
 */
export async function getChainsSeenInReceipts(
  householdId: string,
): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("store_chain")
    .eq("household_id", householdId)
    .not("store_chain", "is", null)
    .order("created_at", { ascending: false })
    .limit(RECEIPTS_FOR_CHAIN_HINT);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const chain = r.store_chain;
    if (!chain || chain === "otro") continue;
    counts.set(chain, (counts.get(chain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([chain]) => chain);
}

/**
 * Supermercados que el hogar eligió A MANO (L15 f4), o vacío si no configuró
 * ninguno. Se lee aparte y no dentro de `getUserHouseholds` a propósito:
 *
 * 1. Esa consulta está en la ruta caliente de TODAS las páginas y lanza en
 *    error, así que pedirle una columna nueva rompería la app entera mientras la
 *    migración no esté aplicada. Aquí el error se traga: supabase-js devuelve
 *    `{ data: null, error }` en vez de lanzar, así que sin columna el hogar
 *    queda "sin configurar" y las tiendas se deducen de los tickets.
 * 2. Solo hace falta en /ajustes y donde se ordenan las cadenas, no en cada
 *    request.
 */
export const getConfiguredChains = cache(
  async (householdId: string): Promise<string[]> => {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("households")
      .select("preferred_chains")
      .eq("id", householdId)
      .maybeSingle();
    return data?.preferred_chains ?? [];
  },
);

/** Tiendas habituales efectivas del hogar y de dónde salen. */
export type HouseholdChains = {
  /** Claves de cadena (chains.ts). Vacío = ni configuradas ni deducibles. */
  chains: string[];
  /** `manual` = las eligió el hogar · `receipts` = deducidas de sus tickets. */
  source: "manual" | "receipts";
};

/**
 * Supermercados habituales del hogar (L15 f4). Lo CONFIGURADO manda; si no hay
 * nada configurado, se deduce de los tickets, así que la ventaja (ordenar el
 * selector de tienda preferida, orientar a la IA al leer un ticket) llega sin
 * pedirle al usuario que configure nada.
 *
 * `cache()` porque el mismo request la pide más de una vez (página + prompt).
 */
export const getHouseholdChains = cache(async (): Promise<HouseholdChains> => {
  const household = await getCurrentHousehold();
  if (!household) return { chains: [], source: "manual" };

  // Las dos consultas a la vez: un hogar sin tiendas configuradas pagaba dos
  // viajes seguidos en /inventario, /lista, el modo compra y Ajustes. Si al
  // final manda lo configurado, la de tickets se descarta, y su posible fallo
  // con ella (el `catch` vacío solo evita un rechazo sin manejar: si hace falta,
  // el `await` de abajo lo sigue lanzando, como antes).
  const seenInReceipts = getChainsSeenInReceipts(household.id);
  seenInReceipts.catch(() => {});
  const configured = await getConfiguredChains(household.id);
  if (configured.length > 0) return { chains: configured, source: "manual" };
  return { chains: await seenInReceipts, source: "receipts" };
});

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
