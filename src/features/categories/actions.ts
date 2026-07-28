"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";
import { CHAIN_NAME_MAX, canonicalizeChains } from "@/features/prices/chains";

export type CategoryActionState = { error?: string; ok?: boolean };

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(100),
  /** null = orden general del hogar; una cadena = orden propio de esa tienda. */
  chain: z.string().trim().min(1).max(CHAIN_NAME_MAX).nullable(),
});

/** Revalida las tres vistas que dependen del orden de pasillos. */
function revalidateOrderViews() {
  revalidatePath("/lista");
  revalidatePath("/lista/compra");
  revalidatePath("/ajustes/orden-tienda");
}

/**
 * Guarda el orden de pasillo del hogar: `sort_order` pasa a ser el índice
 * (0..n-1) en el orden recibido. La RLS y el filtro por `household_id`
 * garantizan que solo se toquen categorías del hogar actual.
 *
 * Con `chain` se guarda el orden PROPIO de esa tienda en
 * `category_chain_order` y el general queda intacto: son excepciones, y la
 * tienda que no tenga fila sigue usando el orden general.
 */
export async function reorderCategoriesAction(
  orderedIds: string[],
  chain: string | null = null,
): Promise<CategoryActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const parsed = reorderSchema.safeParse({ orderedIds, chain });
  if (!parsed.success) return { error: "Datos no válidos." };

  const supabase = createServerSupabaseClient();

  if (parsed.data.chain === null) {
    const results = await Promise.all(
      parsed.data.orderedIds.map((id, index) =>
        supabase
          .from("categories")
          .update({ sort_order: index })
          .eq("id", id)
          .eq("household_id", household.id),
      ),
    );
    if (results.some((r) => r.error)) {
      return { error: "No se pudo guardar el orden." };
    }
    revalidateOrderViews();
    return { ok: true };
  }

  // Se canoniza igual que al guardar las tiendas del hogar: si no, "Lidl" y
  // "lidl" serían dos tiendas con dos órdenes y el modo compra —que trabaja con
  // la clave— no encontraría ninguno.
  const [canonical] = canonicalizeChains([parsed.data.chain]);
  if (!canonical) return { error: "Esa tienda no es válida." };

  // Las categorías de OTRO hogar se rechazan aquí: a diferencia del UPDATE de
  // arriba (donde el `.eq("household_id")` las convierte en un no-op), un
  // insert con `household_id` propio y una categoría ajena sí entraría.
  const { data: owned, error: ownedError } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", household.id)
    .in("id", parsed.data.orderedIds);
  if (ownedError) return { error: "No se pudo guardar el orden." };
  const ownedIds = new Set((owned ?? []).map((c) => c.id));
  if (parsed.data.orderedIds.some((id) => !ownedIds.has(id))) {
    return { error: "Datos no válidos." };
  }

  const { error } = await supabase.from("category_chain_order").upsert(
    parsed.data.orderedIds.map((id, index) => ({
      household_id: household.id,
      chain: canonical,
      category_id: id,
      sort_order: index,
    })),
    { onConflict: "household_id,chain,category_id" },
  );
  if (error) return { error: "No se pudo guardar el orden." };

  revalidateOrderViews();
  return { ok: true };
}

const chainSchema = z.string().trim().min(1).max(CHAIN_NAME_MAX);

/**
 * Devuelve una tienda al orden general borrando su orden propio. Borrar es la
 * forma correcta de "volver al general": copiarlo dejaría una foto congelada que
 * ya no seguiría los cambios del orden general.
 */
export async function resetChainOrderAction(
  chain: string,
): Promise<CategoryActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const parsed = chainSchema.safeParse(chain);
  if (!parsed.success) return { error: "Datos no válidos." };
  const [canonical] = canonicalizeChains([parsed.data]);
  if (!canonical) return { error: "Esa tienda no es válida." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("category_chain_order")
    .delete()
    .eq("household_id", household.id)
    .eq("chain", canonical);
  if (error) return { error: "No se pudo volver al orden general." };

  revalidateOrderViews();
  return { ok: true };
}
