import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AlexaLinkView = {
  id: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** Nombre del miembro que vinculó el altavoz, si lo tiene puesto. */
  linkedBy: string | null;
};

/**
 * Altavoces vinculados al hogar (para la card de /perfil). El filtro por
 * `household_id` es obligatorio aunque la RLS ya limite a los hogares de los que
 * eres miembro: con varios hogares, sin él saldrían mezclados los de todos.
 *
 * Los movimientos que dicta cada altavoz se firman con el usuario que lo
 * vinculó, así que se muestra su nombre: es lo que aparecerá en el historial del
 * inventario y conviene que cuadre.
 */
export async function getAlexaLinks(
  householdId: string,
): Promise<AlexaLinkView[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("alexa_links")
    .select("id, created_at, last_used_at, user_id")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  const links = data ?? [];
  if (links.length === 0) return [];

  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, display_name")
    .eq("household_id", householdId)
    .in(
      "user_id",
      links.map((link) => link.user_id),
    );
  const names = new Map(
    (members ?? []).map((m) => [m.user_id, m.display_name] as const),
  );

  return links.map((link) => ({
    id: link.id,
    createdAt: link.created_at,
    lastUsedAt: link.last_used_at,
    linkedBy: names.get(link.user_id) ?? null,
  }));
}
