"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/features/household/queries";

export type CategoryActionState = { error?: string; ok?: boolean };

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * Guarda el orden de pasillo de las categorías del hogar: `sort_order` pasa a
 * ser el índice (0..n-1) en el orden recibido. La RLS y el filtro por
 * `household_id` garantizan que solo se toquen categorías del hogar actual.
 * Revalida las vistas que dependen del orden.
 */
export async function reorderCategoriesAction(
  orderedIds: string[],
): Promise<CategoryActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };

  const parsed = reorderSchema.safeParse({ orderedIds });
  if (!parsed.success) return { error: "Datos no válidos." };

  const supabase = createServerSupabaseClient();
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

  revalidatePath("/lista");
  revalidatePath("/lista/compra");
  revalidatePath("/ajustes/orden-tienda");
  return { ok: true };
}
