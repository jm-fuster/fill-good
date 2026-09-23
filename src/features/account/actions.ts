"use server";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCurrentHousehold } from "@/features/household/queries";

export type DeleteAccountState = { error?: string; ok?: boolean };

export type ExportDataState = { error?: string; data?: unknown };

/** Tablas del hogar que entran en la exportación (todas con `id` y `household_id`). */
type ExportTable =
  | "household_members"
  | "products"
  | "inventory_items"
  | "shopping_list_items"
  | "recipes"
  | "recipe_ingredients"
  | "weekly_menus"
  | "menu_entries"
  | "receipts"
  | "receipt_items"
  | "shopping_trips";

/**
 * Portabilidad (art. 20 RGPD): devuelve en un objeto los datos de la cuenta y el
 * contenido del hogar activo, en formato estructurado y de uso común (JSON). El
 * cliente lo descarga como archivo. Se acota al hogar activo con .eq() (la RLS
 * solo comprueba membresía) y de los miembros solo se incluye el nombre visible,
 * no los identificadores de otras personas.
 */
export async function exportMyDataAction(): Promise<ExportDataState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };

  const user = await currentUser();
  const supabase = createServerSupabaseClient();
  const hid = household.id;

  /*
    Cada tabla ENTERA, de mil en mil. PostgREST corta cada respuesta a mil filas
    sin avisar, y con diez lecturas a pelo el JSON salía recortado —las líneas de
    ticket pasan de mil en unos cinco meses de uso— mientras la pantalla decía
    «Datos exportados». Y si una lectura fallaba, salía como una lista vacía.
    Un archivo de portabilidad incompleto que se presenta como completo es peor
    que un error: ahora, si falta algo, se dice y no se entrega nada.
  */
  const all = (table: ExportTable, columns = "*") =>
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from(table)
        .select(columns)
        .eq("household_id", hid)
        // Orden total para paginar; no hace falta seleccionar la columna.
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: Record<string, unknown>[] | null;
        error: PostgrestError | null;
      }>,
    );

  const results = await Promise.all([
    all("household_members", "display_name, role, joined_at"),
    all("products"),
    all("inventory_items"),
    all("shopping_list_items"),
    all("recipes"),
    // Los ingredientes de cada receta: sin ellos, una receta escrita a mano se
    // exportaba como un nombre y unos pasos.
    all("recipe_ingredients"),
    all("weekly_menus"),
    all("menu_entries"),
    all("receipts"),
    all("receipt_items"),
    all("shopping_trips"),
  ]);
  const failed = results.find((r) => r.error);
  if (failed) {
    console.error("exportMyDataAction: una lectura falló:", failed.error);
    return {
      error: "No se pudieron reunir todos tus datos. Inténtalo de nuevo.",
    };
  }
  const [
    members,
    products,
    inventory,
    listItems,
    recipes,
    recipeIngredients,
    menus,
    menuEntries,
    receipts,
    receiptItems,
    trips,
  ] = results;

  // La promesa de arriba («no los identificadores de otras personas») hay que
  // cumplirla también en el contenido: `select("*")` arrastra los ids de Clerk
  // de los demás convivientes en los campos de atribución (added_by,
  // checked_by, updated_by…). El propio se conserva —es un dato del
  // solicitante—; el ajeno se sustituye por un marcador neutro que preserva el
  // «lo hizo otro miembro» sin el identificador (minimización, art. 5.1.c).
  const attributionKeys = new Set([
    "added_by",
    "checked_by",
    "updated_by",
    "created_by",
    "uploaded_by",
    "closed_by",
    "cooked_by",
    "rated_by",
    "user_id",
  ]);
  const sanitizeRows = (rows: unknown[] | null): unknown[] =>
    (rows ?? []).map((row) => {
      const out = { ...(row as Record<string, unknown>) };
      for (const key of Object.keys(out)) {
        if (!attributionKeys.has(key)) continue;
        const value = out[key];
        if (typeof value === "string" && value !== userId) {
          out[key] = "otro-miembro";
        }
      }
      return out;
    });

  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      email: user?.primaryEmailAddress?.emailAddress ?? null,
      name: user?.fullName ?? null,
    },
    household: {
      name: household.name,
      monthlyBudget: household.monthlyBudget,
      members: members.data,
    },
    products: sanitizeRows(products.data),
    inventory: sanitizeRows(inventory.data),
    shoppingListItems: sanitizeRows(listItems.data),
    recipes: sanitizeRows(recipes.data),
    recipeIngredients: sanitizeRows(recipeIngredients.data),
    weeklyMenus: sanitizeRows(menus.data),
    menuEntries: sanitizeRows(menuEntries.data),
    receipts: sanitizeRows(receipts.data),
    receiptItems: sanitizeRows(receiptItems.data),
    shoppingTrips: sanitizeRows(trips.data),
  };

  return { data };
}

/**
 * Borrado de cuenta (RGPD). Dos pasos, en este orden:
 *  1. RPC delete_account(): borra los datos del usuario en Supabase con su propio
 *     JWT aún válido. Lanza 'owner_must_transfer' si es propietario de un hogar
 *     con más miembros (debe transferir antes).
 *  2. Backend API de Clerk: elimina la cuenta de acceso.
 * No redirige: el cliente cierra sesión (limpia el estado local de Clerk) y
 * navega a /sign-in al recibir { ok: true }.
 */
export async function deleteAccountAction(): Promise<DeleteAccountState> {
  const { userId } = await auth();
  if (!userId) return { error: "Debes iniciar sesión." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_account");
  if (error) {
    if (error.message?.includes("owner_must_transfer")) {
      return {
        error:
          "Eres propietario de un hogar con más miembros: transfiere la propiedad a otro miembro antes de borrar tu cuenta.",
      };
    }
    return { error: "No se pudieron borrar tus datos. Inténtalo de nuevo." };
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch {
    // Los datos ya se borraron; si la cuenta de acceso no se pudo eliminar, el
    // usuario puede reintentar (el RPC es idempotente al no quedar ya datos).
    return {
      error:
        "Tus datos se borraron, pero no se pudo eliminar la cuenta de acceso. Inténtalo de nuevo.",
    };
  }

  return { ok: true };
}
