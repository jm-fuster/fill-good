"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/normalize";
import {
  addStockQuantity,
  defaultListQuantity,
  formatQuantity,
  roundQuantity,
  UNIT_LABELS,
  type UnitContent,
} from "@/lib/units";
import { getCurrentHousehold } from "@/features/household/queries";
import { recordStockEvent } from "@/features/inventory/events";
import { findUnclaimedRecentReceipt } from "./trips";
import type { UnitType } from "@/lib/supabase/types";
import {
  getActiveList,
  getActiveListBadge,
  getListItems,
  getShoppingModeItems,
  type ListItem,
  type ShoppingModeItem,
} from "./queries";
import {
  addManyToList,
  mergeIntoExisting,
  nextListPosition,
  type BulkAddItem,
} from "./items";
import {
  addListItemSchema,
  addListItemsSchema,
  reorderListItemsSchema,
  restoreListItemSchema,
  updateListItemSchema,
  type AddListItemsInput,
} from "./schemas";

export type ActionState = {
  error?: string;
  ok?: boolean;
  warning?: string;
  /** Id de la fila recién insertada (para reconciliar el alta optimista). */
  itemId?: string;
  /** Presente cuando el alta se fusionó con un ítem existente (L3). */
  merged?: { name: string; quantity: number | null; unit: UnitType | null };
};

// ── Relecturas para el cliente ("curas") ────────────────────────────────────
// La lista se sincroniza con CAMBIOS SUELTOS de Realtime (ver `list-sync.ts`).
// Lo que un cambio suelto no puede traer —la categoría y el precio de un alta
// ajena, o lo que pasara mientras el móvil dormía— se pide con esto: UNA
// consulta, en vez del `router.refresh()` que re-renderizaba la página entera
// (sugerencias, catálogo, pasillos, tiendas… seis consultas) por cada toque de
// cualquiera de los dos móviles.
//
// El `listId` llega del cliente y no se valida aparte: las lecturas van acotadas
// al hogar activo, así que un id ajeno devuelve la lista vacía, no datos de otra
// casa (ver la regla del hogar activo en AGENTS.md).

export async function fetchListItemsAction(
  listId: string,
): Promise<{ items?: ListItem[]; error?: string }> {
  try {
    return { items: await getListItems(listId) };
  } catch {
    // La cura es best-effort: el cliente se queda con lo que tiene y lo
    // reintenta en el siguiente latido. Devolver un error aquí solo sirve para
    // que no se aplique una lista a medias.
    return { error: "No se pudo leer la lista." };
  }
}

export async function fetchShoppingModeItemsAction(
  listId: string,
): Promise<{ items?: ShoppingModeItem[]; error?: string }> {
  try {
    return { items: await getShoppingModeItems(listId) };
  } catch {
    return { error: "No se pudo leer la lista." };
  }
}

/** Pendientes de la lista activa, para el badge de la navbar. */
export async function fetchListBadgeAction(): Promise<{
  listId: string | null;
  pendingCount: number;
}> {
  try {
    return await getActiveListBadge();
  } catch {
    return { listId: null, pendingCount: 0 };
  }
}

export async function addListItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const parsed = addListItemSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;

  const supabase = createServerSupabaseClient();
  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  // Enlazar con el catálogo si el nombre coincide (para checkout y avisos).
  const normalized = normalizeName(d.name);
  const { data: product } = await supabase
    .from("products")
    .select("id, default_unit")
    .eq("household_id", household.id)
    .eq("normalized_name", normalized)
    .maybeSingle();

  // Aviso si ya tienes existencias de ese producto. Un total POR UNIDAD: los
  // lotes pueden estar en unidades distintas, y sumarlos a lo bruto decía
  // «501 g» con 500 g en la despensa y 1 kg en la nevera.
  let warning: string | undefined;
  if (product) {
    const { data: inv } = await supabase
      .from("inventory_items")
      .select("quantity, unit")
      .eq("household_id", household.id)
      .eq("product_id", product.id)
      .gt("quantity", 0);
    const byUnit = new Map<UnitType, number>();
    for (const r of inv ?? []) {
      byUnit.set(r.unit, (byUnit.get(r.unit) ?? 0) + Number(r.quantity));
    }
    const parts = [...byUnit.entries()]
      .filter(([, t]) => t > 0)
      .map(([u, t]) => formatQuantity(t, u));
    if (parts.length > 0) {
      warning = `Ya tienes ${parts.join(" y ")} en el inventario`;
    }
  }

  const unit = d.unit ?? product?.default_unit ?? null;
  const quantity = d.quantity ?? defaultListQuantity(unit);

  // L3: si ya está en la lista (sin marcar), fusionar en vez de duplicar.
  const merged = await mergeIntoExisting(
    supabase,
    list.id,
    { productId: product?.id ?? null, normalized },
    { quantity, unit },
  );
  if (merged) {
    revalidatePath("/lista");
    return {
      ok: true,
      warning,
      itemId: merged.itemId,
      merged: {
        name: merged.name,
        quantity: merged.quantity,
        unit: merged.unit,
      },
    };
  }

  const position = await nextListPosition(supabase, list.id);

  const { data: inserted, error } = await supabase
    .from("shopping_list_items")
    .insert({
      list_id: list.id,
      household_id: household.id,
      product_id: product?.id ?? null,
      name: d.name,
      quantity,
      unit,
      added_by: userId,
      position,
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo añadir a la lista." };

  revalidatePath("/lista");
  return { ok: true, warning, itemId: inserted.id };
}

export async function addProductToListAction(
  productId: string,
  quantity?: number | null,
  unit?: UnitType | null,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  // El productId llega del cliente: acotarlo al hogar activo evita enlazar la
  // lista con un producto del OTRO hogar del usuario (la RLS lo permitiría).
  const { data: product } = await supabase
    .from("products")
    .select("id, name, default_unit")
    .eq("household_id", household.id)
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { error: "Producto no encontrado." };

  const resolvedUnit = unit ?? product.default_unit;
  const qty =
    typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
      ? quantity
      : defaultListQuantity(resolvedUnit);

  // L3: fusionar con el ítem existente (sin marcar) si ya está en la lista.
  const merged = await mergeIntoExisting(
    supabase,
    list.id,
    { productId: product.id, normalized: normalizeName(product.name) },
    { quantity: qty, unit: resolvedUnit },
  );
  if (merged) {
    revalidatePath("/lista");
    return {
      ok: true,
      itemId: merged.itemId,
      merged: {
        name: merged.name,
        quantity: merged.quantity,
        unit: merged.unit,
      },
    };
  }

  const position = await nextListPosition(supabase, list.id);

  const { data: inserted, error } = await supabase
    .from("shopping_list_items")
    .insert({
      list_id: list.id,
      household_id: household.id,
      product_id: product.id,
      name: product.name,
      quantity: qty,
      unit: resolvedUnit,
      added_by: userId,
      position,
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo añadir a la lista." };

  revalidatePath("/lista");
  return { ok: true, itemId: inserted.id };
}

/**
 * Quita de la lista activa lo apuntado de un producto: el otro medio giro de
 * `addProductToListAction`. Hace falta porque en el inventario «En la lista» es
 * el MISMO botón con el que se apuntó, y hasta ahora un añadido por error solo
 * se podía arreglar yéndose a `/lista` a buscar el artículo.
 *
 * Nunca toca una fila ya MARCADA: eso no sería quitar de la lista, sino borrar
 * una compra a medias —el checkout dejaría de reponer ese producto al inventario
 * y nadie se enteraría—, así que se contesta que ya está en el carro y la lista
 * se queda como está.
 *
 * Devuelve la instantánea de la fila para el «Deshacer» de quien llama
 * (`restoreListItemAction`). Volver a añadir NO equivale a deshacer: la fila
 * pudo llegar a cuatro unidades por fusión (L3) o venir del otro móvil con su
 * cantidad, y un alta nueva traería una.
 */
export async function removeProductFromListAction(
  productId: string,
): Promise<ActionState & { deleted?: DeletedListItem }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  // Solo lectura, a diferencia de `getActiveList`: si el hogar no tiene lista
  // activa no hay nada que quitar, y crearla para borrar de ella sería absurdo.
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", household.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // Sin lista, el producto ya no está apuntado en ninguna parte: es el estado
  // que pedía el usuario, no un fallo.
  if (!list) return { ok: true };

  const { data: rows } = await supabase
    .from("shopping_list_items")
    .select(
      "id, list_id, household_id, product_id, name, quantity, unit, is_checked, checked_by, checked_at, added_by, position, created_at",
    )
    .eq("household_id", household.id)
    .eq("list_id", list.id)
    .eq("product_id", productId);

  const pending = (rows ?? []).find((r) => !r.is_checked);
  if (!pending) {
    // Solo queda lo ya marcado: «En la lista» sigue siendo verdad, y quitarlo
    // desde aquí sería justo lo que este action no hace.
    return (rows ?? []).length > 0
      ? { error: "Ya está marcado en la compra: quítalo desde la lista." }
      : { ok: true };
  }

  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", pending.id)
    .eq("household_id", household.id);
  if (error) return { error: "No se pudo quitar de la lista." };

  revalidatePath("/lista");
  return {
    ok: true,
    deleted: {
      ...pending,
      quantity: pending.quantity === null ? null : Number(pending.quantity),
    },
  };
}

/** Resultado del alta múltiple: qué se creó y qué se sumó a lo que ya había. */
export type BulkAddState = {
  error?: string;
  ok?: boolean;
  /** Filas nuevas en la lista. */
  added?: number;
  /** Altas que se sumaron a un artículo que ya estaba sin marcar (L3). */
  merged?: number;
};

/**
 * L17 — Alta de varios artículos de golpe (el selector que abre el «+»). Un solo
 * viaje: las Server Actions se despachan de una en una desde el cliente, así que
 * marcar quince productos y llamar quince veces al alta suelta las pondría en
 * cola una detrás de otra.
 *
 * A diferencia del alta suelta NO avisa de existencias en el inventario: quince
 * altas serían quince avisos, y el sitio donde eso se dice sin estorbar es la
 * propia ficha de cada producto.
 */
export async function addListItemsAction(
  input: AddListItemsInput,
): Promise<BulkAddState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();

  const parsed = addListItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const supabase = createServerSupabaseClient();
  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  // Lo que llega del cliente son REFERENCIAS (ids y nombres); se resuelven contra
  // el catálogo del hogar activo. Acotar por hogar no es una formalidad: sin ese
  // filtro se podría enlazar la lista con un producto del otro hogar del usuario
  // (la RLS solo comprueba que seas miembro de alguno).
  const productIds = [
    ...new Set(
      parsed.data.flatMap((e) => (e.kind === "product" ? [e.productId] : [])),
    ),
  ];
  // Nombre normalizado → tal cual lo escribió el usuario.
  const freeNames = new Map<string, string>();
  for (const entry of parsed.data) {
    if (entry.kind !== "free") continue;
    const normalized = normalizeName(entry.name);
    if (normalized.length > 0 && !freeNames.has(normalized)) {
      freeNames.set(normalized, entry.name);
    }
  }

  type CatalogRow = { id: string; name: string; default_unit: UnitType };
  const byId = new Map<string, CatalogRow>();
  const byNormalized = new Map<string, CatalogRow>();
  if (productIds.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, name, default_unit")
      .eq("household_id", household.id)
      .in("id", productIds);
    for (const p of data ?? []) byId.set(p.id, p);
  }
  // Un nombre nuevo puede existir ya como producto (lo acaba de crear otro
  // miembro del hogar, o nunca se compró): enlazarlo es lo que hace que el
  // checkout reponga en la ficha correcta en vez de crear un duplicado.
  if (freeNames.size > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, name, default_unit, normalized_name")
      .eq("household_id", household.id)
      .in("normalized_name", [...freeNames.keys()]);
    for (const p of data ?? []) byNormalized.set(p.normalized_name, p);
  }

  const items: BulkAddItem[] = [];
  for (const entry of parsed.data) {
    if (entry.kind === "product") {
      const product = byId.get(entry.productId);
      // Id desconocido (o de otro hogar): se ignora en silencio, el resto entra.
      if (!product) continue;
      items.push({
        productId: product.id,
        name: product.name,
        normalized: normalizeName(product.name),
        quantity: entry.quantity ?? defaultListQuantity(product.default_unit),
        unit: product.default_unit,
        ifMissing: entry.ifMissing,
      });
      continue;
    }
    const normalized = normalizeName(entry.name);
    if (normalized.length === 0) continue;
    const product = byNormalized.get(normalized);
    const unit = entry.unit ?? product?.default_unit ?? null;
    items.push({
      productId: product?.id ?? null,
      name: entry.name,
      normalized,
      quantity: entry.quantity ?? defaultListQuantity(unit),
      unit,
    });
  }
  if (items.length === 0) return { error: "No se pudo añadir a la lista." };

  const result = await addManyToList(
    supabase,
    { listId: list.id, householdId: household.id, userId },
    items,
  );
  if (!result) return { error: "No se pudo añadir a la lista." };

  revalidatePath("/lista");
  return { ok: true, added: result.added, merged: result.merged };
}

/** Cuánto se calla una sugerencia descartada antes de volver a ofrecerse. */
const SUGGESTION_SNOOZE_DAYS = 30;

/**
 * «Descartar» una sugerencia de la lista: silencia ese producto un mes. Es un
 * silencio temporal y no un "nunca más" porque casi todo en una despensa es
 * cíclico — el bote que hoy no repones puede hacerte falta el mes que viene, y
 * un descarte permanente obligaría a acordarse de deshacerlo.
 *
 * Va en el producto (por hogar), no por usuario: la lista es compartida y lo que
 * uno descarta no debe reaparecerle al otro.
 */
export async function dismissSuggestionAction(
  productId: string,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const until = new Date();
  until.setDate(until.getDate() + SUGGESTION_SNOOZE_DAYS);

  const { error } = await supabase
    .from("products")
    .update({ suggestions_snoozed_until: until.toISOString() })
    .eq("household_id", household.id)
    .eq("id", productId);
  if (error) return { error: "No se pudo descartar la sugerencia." };

  revalidatePath("/lista");
  return { ok: true };
}

/** Deshace un «Descartar»: el producto vuelve a poder sugerirse ya mismo. */
export async function restoreSuggestionAction(
  productId: string,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("products")
    .update({ suggestions_snoozed_until: null })
    .eq("household_id", household.id)
    .eq("id", productId);
  if (error) return { error: "No se pudo recuperar la sugerencia." };

  revalidatePath("/lista");
  return { ok: true };
}

export async function updateListItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateListItemSchema.safeParse({
    itemId: formData.get("itemId"),
    name: formData.get("name"),
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const d = parsed.data;
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();

  // Si el ítem está vinculado al catálogo, el nombre que se ve en la lista es el
  // del producto, así que editarlo aquí tiene que renombrar el producto: escribir
  // solo en la fila sería un guardado que no cambia nada de lo que el usuario ve.
  const { data: row } = await supabase
    .from("shopping_list_items")
    .select("product_id, product:products(name)")
    .eq("id", d.itemId)
    .eq("household_id", household.id)
    .maybeSingle();
  const linked = row as unknown as {
    product_id: string | null;
    product: { name: string } | null;
  } | null;

  if (linked?.product_id && linked.product && linked.product.name !== d.name) {
    const normalized = normalizeName(d.name);
    // Misma regla que al renombrar desde el inventario: la unicidad es por
    // (household_id, normalized_name) y ante un choque se rechaza en vez de
    // fusionar, que perdería el histórico enlazado al otro producto.
    const { data: clash } = await supabase
      .from("products")
      .select("id")
      .eq("household_id", household.id)
      .eq("normalized_name", normalized)
      .neq("id", linked.product_id)
      .maybeSingle();
    if (clash) return { error: "Ya existe otro producto con ese nombre." };

    const { error: renameErr } = await supabase
      .from("products")
      .update({ name: d.name, normalized_name: normalized })
      .eq("household_id", household.id)
      .eq("id", linked.product_id);
    if (renameErr) return { error: "No se pudo guardar el nombre." };
    // El inventario y las sugerencias también lo muestran.
    revalidatePath("/inventario");
  }

  const unit = d.unit ?? null;
  const { data, error } = await supabase
    .from("shopping_list_items")
    .update({
      // Se guarda igualmente aunque el nombre vivo salga del producto: es el
      // fallback si algún día se desvincula la fila, y dejarlo desfasado a
      // propósito solo sería una trampa para el siguiente que lo lea.
      name: d.name,
      // Sostiene el invariante «un contable siempre tiene cantidad»: vaciar el
      // campo en el editor vale 1, no el estado sin stepper. Cambiar la unidad a
      // granel sí devuelve el ítem a «sin cantidad» si se deja en blanco.
      quantity: d.quantity ?? defaultListQuantity(unit),
      unit,
    })
    .eq("id", d.itemId)
    .eq("household_id", household.id)
    .select("id");
  if (error) return { error: "No se pudo guardar." };
  /*
    Como en el editor del inventario, aquí el «ok» sobre cero filas podía llegar
    después de haber renombrado ya el producto en `products` (arriba), así que
    el guardado quedaba a medias y la pantalla decía que había ido bien.

    Basta con que el otro móvil quite ese artículo mientras lo editas. También
    lo provoca la cookie de hogar activo cambiada en otra pestaña: entonces el
    filtro por `household_id` no encuentra nada y NINGUNA de las dos escrituras
    ocurre en el hogar que se está mirando.
  */
  if (!data || data.length === 0) {
    return { error: "Ese artículo ya no está en la lista." };
  }

  revalidatePath("/lista");
  return { ok: true };
}

/**
 * L9 — Ajuste ligero de solo la cantidad (stepper ±1). Optimista en cliente y
 * SIN `revalidatePath`: el cambio llega al resto de dispositivos como cambio
 * suelto de Realtime, que lo aplican en memoria. Es lo que hace que sumar
 * cantidad no cueste un render de la página por toque.
 */
export async function setListItemQuantityAction(
  itemId: string,
  quantity: number | null,
): Promise<ActionState> {
  // `quantity` llega del cliente: null (sin cantidad) o un número finito >= 0.
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    return { error: "Cantidad no válida." };
  }
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shopping_list_items")
    .update({ quantity })
    .eq("id", itemId)
    .eq("household_id", household.id)
    .select("id");
  if (error) return { error: "No se pudo actualizar." };
  // Sin revalidatePath, lo que se ve es puro estado de cliente: si la fila ya no
  // existe, nadie iba a corregir ese número hasta la siguiente cura.
  if (!data || data.length === 0) {
    return { error: "Ese artículo ya no está en la lista." };
  }
  return { ok: true };
}

/**
 * L14 — Reordenar la lista a mano: fija `position` = índice (0..n-1) según el
 * orden recibido de artículos pendientes. `getListItems` ordena por is_checked
 * y luego por position, así que basta con posicionar los pendientes. Optimista
 * en cliente (sin revalidatePath): Realtime reconcilia el resto de dispositivos.
 */
export async function reorderListItemsAction(
  orderedIds: string[],
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const parsedIds = reorderListItemsSchema.safeParse(orderedIds);
  if (!parsedIds.success) return { error: "Datos no válidos." };
  const supabase = createServerSupabaseClient();
  const results = await Promise.all(
    parsedIds.data.map((id, index) =>
      supabase
        .from("shopping_list_items")
        .update({ position: index })
        .eq("id", id)
        .eq("household_id", household.id)
        .select("id"),
    ),
  );
  if (results.some((r) => r.error)) {
    return { error: "No se pudo guardar el orden." };
  }
  /*
    Aquí no se exige colocar TODAS las filas, al revés que en las acciones de
    un solo artículo: reordenar diez y que una se haya borrado mientras
    arrastrabas no invalida la posición de las otras nueve. Lo que no puede
    pasar por bueno es que no se colocara ninguna, que es lo que ocurre cuando
    la lista entera dejó de ser alcanzable — el caso de la pestaña que se quedó
    con el hogar viejo.
  */
  const colocadas = results.reduce((n, r) => n + (r.data?.length ?? 0), 0);
  if (parsedIds.data.length > 0 && colocadas === 0) {
    return { error: "Esa lista ya no está disponible. Recarga la página." };
  }
  return { ok: true };
}

export async function toggleItemAction(
  itemId: string,
  isChecked: boolean,
): Promise<ActionState> {
  const { userId } = await auth();
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shopping_list_items")
    .update({
      is_checked: isChecked,
      checked_by: isChecked ? userId : null,
      checked_at: isChecked ? new Date().toISOString() : null,
    })
    .eq("id", itemId)
    .eq("household_id", household.id)
    .select("id");
  if (error) return { error: "No se pudo actualizar." };
  // Marcar es el gesto más repetido de la compra y el más silencioso: sin
  // revalidatePath y sin contar filas, una casilla marcada sobre un artículo
  // que ya no existe se quedaba marcada hasta que la cura la deshiciera sola.
  if (!data || data.length === 0) {
    return { error: "Ese artículo ya no está en la lista." };
  }
  // Sin revalidatePath: optimista en cliente, y al resto de dispositivos llega
  // como cambio suelto de Realtime (marcar es el gesto más repetido de la
  // compra; recargar la ruta por cada uno era la mitad del problema).
  return { ok: true };
}

/** Instantánea de una fila borrada, suficiente para restaurarla tal cual. */
export type DeletedListItem = {
  id: string;
  list_id: string;
  household_id: string;
  product_id: string | null;
  name: string;
  quantity: number | null;
  unit: UnitType | null;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  added_by: string | null;
  position: number;
  created_at: string;
};

/**
 * Borra un ítem de la lista. El borrado se confirma en el servidor de inmediato
 * (así sobrevive a una recarga de la página; no depende de un temporizador en el
 * cliente). Devuelve una instantánea de la fila para poder deshacerlo con
 * `restoreListItemAction`, conservando id, posición y `added_by`.
 *
 * El `revalidatePath("/lista")` NO es para la pantalla que llama (esa ya se
 * actualizó sola, y el cliente descarta esta instantánea si va por detrás): es
 * para invalidar el caché de router del cliente —que sirve la página hasta 30 s,
 * ver `staleTimes`— y para que las sugerencias vuelvan a contar con este producto.
 * Sin él, volver a `/lista` desde otra pestaña enseñaría el artículo borrado.
 */
export async function deleteListItemAction(
  itemId: string,
): Promise<ActionState & { deleted?: DeletedListItem }> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const supabase = createServerSupabaseClient();
  const { data: row } = await supabase
    .from("shopping_list_items")
    .select(
      "id, list_id, household_id, product_id, name, quantity, unit, is_checked, checked_by, checked_at, added_by, position, created_at",
    )
    .eq("id", itemId)
    .eq("household_id", household.id)
    .maybeSingle();

  /*
    El borrado es la ÚNICA de estas acciones que no trata «cero filas» como un
    error, y es deliberado: aquí lo que el usuario quería —que el artículo no
    esté en la lista— ya se cumple, así que un borrado repetido es idempotente
    y no hay nada que reprochar. Devolver error tendría además un efecto peor
    que el problema: la vista restaura la fila cuando la acción falla, así que
    borrar algo que el otro móvil acababa de quitar lo haría REAPARECER un
    instante antes de que la cura lo volviera a tirar.

    Lo que sí cambia según haya fila o no es el «Deshacer»: sin instantánea no
    se ofrece, porque no habría nada que restaurar.
  */
  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", itemId)
    .eq("household_id", household.id);
  if (error) return { error: "No se pudo eliminar." };

  revalidatePath("/lista");
  return {
    ok: true,
    deleted: row
      ? { ...row, quantity: row.quantity === null ? null : Number(row.quantity) }
      : undefined,
  };
}

/**
 * Deshace un borrado re-insertando la fila exactamente como estaba (mismo id,
 * posición y `added_by`). RLS exige pertenecer al hogar de `household_id`, así
 * que no se puede restaurar en un hogar ajeno.
 */
export async function restoreListItemAction(
  item: DeletedListItem,
): Promise<ActionState> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  // La instantánea hizo ida y vuelta por el cliente: se re-valida entera. La
  // forma con zod, y las referencias contra la base — sin esto, un cliente
  // manipulado podía reinsertar la fila en una lista de OTRO de sus hogares
  // (fila híbrida invisible) o firmarla con la atribución de otro conviviente.
  const parsed = restoreListItemSchema.safeParse(item);
  if (!parsed.success) return { error: "No se pudo restaurar." };
  const d = parsed.data;
  const supabase = createServerSupabaseClient();

  const [{ data: listRow }, { data: members }] = await Promise.all([
    supabase
      .from("shopping_lists")
      .select("id")
      .eq("household_id", household.id)
      .eq("id", d.list_id)
      .maybeSingle(),
    supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", household.id),
  ]);
  if (!listRow) return { error: "No se pudo restaurar." };
  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const attributionOk =
    (d.added_by === null || memberIds.has(d.added_by)) &&
    (d.checked_by === null || memberIds.has(d.checked_by));
  if (!attributionOk) return { error: "No se pudo restaurar." };
  if (d.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("household_id", household.id)
      .eq("id", d.product_id)
      .maybeSingle();
    if (!product) return { error: "No se pudo restaurar." };
  }

  const { error } = await supabase.from("shopping_list_items").insert({
    id: d.id,
    list_id: d.list_id,
    // Forzamos el hogar activo en lugar de fiarnos del payload del cliente: no se
    // puede reinsertar la fila con un household_id fabricado.
    household_id: household.id,
    product_id: d.product_id,
    name: d.name,
    quantity: d.quantity,
    unit: d.unit,
    is_checked: d.is_checked,
    checked_by: d.checked_by,
    checked_at: d.checked_at,
    added_by: d.added_by,
    position: d.position,
    created_at: d.created_at,
  });
  if (error) return { error: "No se pudo restaurar." };
  revalidatePath("/lista");
  return { ok: true };
}

/**
 * Finalizar compra: los items marcados pasan al inventario y se quitan de la
 * lista. Los items de texto libre crean/actualizan su producto en el catálogo.
 */
export async function checkoutAction(): Promise<
  ActionState & { added?: number; inventoryItemIds?: string[] }
> {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No perteneces a ningún hogar." };
  const { userId } = await auth();
  const supabase = createServerSupabaseClient();

  const list = await getActiveList();
  if (!list) return { error: "No hay lista activa." };

  /*
    Reclamo de lo marcado: se desmarca y se pide de vuelta lo que ESTA ejecución
    consiguió cambiar. No es un rodeo para leer, es lo que impide que la compra
    entre dos veces.

    Leyendo a secas, dos móviles que pulsan «Finalizar compra» con segundos de
    diferencia —el caso normal: dos personas en la misma caja, y el bucle de
    abajo tarda varios segundos con la lista llena— leían ambos las mismas
    líneas, porque el borrado no llega hasta el final. Resultado: el stock se
    sumaba dos veces, dos eventos «repuesto» por producto, `bump_product_purchase`
    doble (que corre la cadencia de reposición) y DOS filas en `shopping_trips`,
    una de las cuales se queda pidiendo ticket para siempre. Nada de eso se
    deshace desde la app.

    Con el UPDATE condicional lo decide Postgres: de dos ejecuciones a la vez,
    solo una ve `is_checked = true` y se lleva las filas; la otra recibe cero y
    contesta «No hay productos marcados», que es exactamente lo que pasó. El
    botón ya estaba protegido por dispositivo (`loading` lo deshabilita), así que
    esto cubre justo lo que faltaba: dos dispositivos distintos.

    El reclamo NO desmarca (hasta sep-2026 sí: era lo más barato sin tocar el
    esquema). Desmarcar es justo lo que se ve, así que durante el checkout el
    carro volvía a «pendiente» en los dos móviles, y si la otra persona lo
    volvía a marcar y finalizaba antes del borrado final, su reclamo lo
    procesaba otra vez. Ahora el reclamo es `checkout_claimed_at`, que la
    interfaz no pinta, puesto por `claim_checked_items` en una sola sentencia
    con el reloj de la base; caduca a los 5 minutos por si esta función se
    cortara a mitad (ver la migración `20260923103427`).
  */
  const { data: claimed, error: fetchErr } = await supabase.rpc(
    "claim_checked_items",
    { p_household_id: household.id, p_list_id: list.id },
  );
  if (fetchErr) return { error: "No se pudieron leer los productos." };
  if (!claimed || claimed.length === 0) {
    // Nada libre pero sí marcado = otro «Finalizar» lo tiene reclamado ahora
    // mismo (el reclamo ya no desmarca, así que lo marcado sigue a la vista).
    // Decir «no hay productos marcados» con el carro lleno en pantalla sería
    // falso.
    const { count } = await supabase
      .from("shopping_list_items")
      .select("id", { count: "exact", head: true })
      .eq("household_id", household.id)
      .eq("list_id", list.id)
      .eq("is_checked", true);
    if (count && count > 0) {
      return {
        error: "Otra persona está finalizando esta compra. Espera un momento.",
      };
    }
    return { error: "No hay productos marcados." };
  }

  const inventoryItemIds: string[] = [];
  // Snapshot de la compra (G2): los productos que realmente se llevaron, ya
  // resueltos. Se acumula durante el bucle porque los items de texto libre no
  // tienen product_id hasta que se crean aquí.
  const tripProductIds: string[] = [];
  // Solo salen de la lista las líneas RESUELTAS: si una escritura falla (red,
  // BD), la línea se queda marcada y reintentable, en vez de esfumarse con la
  // compra a medio pasar y sin dejar rastro.
  const doneIds: string[] = [];
  const unitConflicts: string[] = [];
  let added = 0;
  let failures = 0;
  // Ticket de esta misma compra escaneado ANTES de finalizar: lo suyo ya entró
  // en el inventario, así que aquí cuenta como compra pero no suma stock (ver
  // `findUnclaimedRecentReceipt`). Solo se enlaza si de verdad coincide algo.
  const receiptFirst = await findUnclaimedRecentReceipt(supabase, household.id);
  let matchedReceipt = false;

  for (const item of claimed) {
    // Resolver producto: enlazado, o resolver/crear por nombre normalizado.
    let productId = item.product_id;
    let defaultUnit = item.unit ?? "ud";
    let location: "pantry" | "fridge" | "freezer" | "other" = "pantry";
    let packSize: number | null = null;
    let content: UnitContent = null;

    if (productId) {
      const { data: p } = await supabase
        .from("products")
        .select(
          "default_unit, default_location, pack_size, content_size, content_unit, content_is_estimate",
        )
        .eq("household_id", household.id)
        .eq("id", productId)
        .maybeSingle();
      if (p) {
        defaultUnit = item.unit ?? p.default_unit;
        location = p.default_location;
        packSize = p.pack_size;
        if (p.content_size !== null && p.content_unit !== null) {
          content = {
            size: Number(p.content_size),
            unit: p.content_unit,
            estimate: p.content_is_estimate,
          };
        }
      }
    } else {
      const normalized = normalizeName(item.name);
      const { data: existing } = await supabase
        .from("products")
        .select(
          "id, default_unit, default_location, pack_size, content_size, content_unit, content_is_estimate",
        )
        .eq("household_id", household.id)
        .eq("normalized_name", normalized)
        .maybeSingle();
      if (existing) {
        productId = existing.id;
        defaultUnit = item.unit ?? existing.default_unit;
        location = existing.default_location;
        packSize = existing.pack_size;
        if (existing.content_size !== null && existing.content_unit !== null) {
          content = {
            size: Number(existing.content_size),
            unit: existing.content_unit,
            estimate: existing.content_is_estimate,
          };
        }
      } else {
        const { data: created } = await supabase
          .from("products")
          .insert({
            household_id: household.id,
            name: item.name,
            normalized_name: normalized,
            default_unit: item.unit ?? "ud",
            default_location: "pantry",
          })
          .select("id")
          .single();
        if (!created) {
          failures += 1;
          continue;
        }
        productId = created.id;
      }
    }
    if (!productId) {
      failures += 1;
      continue;
    }

    if (receiptFirst?.productIds.has(productId)) {
      matchedReceipt = true;
      // Sin bump_product_purchase: ya lo contó el ticket, y contarlo dos
      // veces corre la cadencia de reposición.
      tripProductIds.push(productId);
      doneIds.push(item.id);
      continue;
    }

    // Pack (F4): con pack y movimiento en ud, entran `cantidad × pack` unidades.
    const baseQty = item.quantity ?? 1;
    const qty = defaultUnit === "ud" && packSize ? baseQty * packSize : baseQty;

    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id, quantity, unit")
      .eq("household_id", household.id)
      .eq("product_id", productId)
      .eq("location", location)
      .maybeSingle();

    // Lo que REALMENTE entra en la fila, en la unidad de la fila: la política
    // de reposición es addStockQuantity y la unidad del inventario no se pisa.
    let storedQty = qty;
    let storedUnit: UnitType = defaultUnit;
    let addedToInventory = false;

    if (inv) {
      const merged = addStockQuantity(
        Number(inv.quantity),
        inv.unit,
        qty,
        defaultUnit,
        content,
      );
      if (merged === null) {
        // Unidades incompatibles: la compra cuenta (habitualidad, snapshot),
        // pero el stock no se suma a ciegas — mismo aviso que el ticket.
        unitConflicts.push(
          `«${item.name}»: compraste ${formatQuantity(qty, defaultUnit)} pero en tu inventario está en ${UNIT_LABELS[inv.unit]}. No se sumó automáticamente; ajústalo a mano.`,
        );
      } else {
        const { error: invErr } = await supabase
          .from("inventory_items")
          .update({
            quantity: merged,
            updated_by: userId,
            // Reponer una fila a cero: la fecha y el «gastar pronto» eran del
            // lote que se acabó (mismo criterio que el ticket).
            ...(Number(inv.quantity) === 0
              ? { expiry_date: null, use_soon: false }
              : {}),
          })
          .eq("id", inv.id);
        if (invErr) {
          failures += 1;
          continue;
        }
        storedQty = roundQuantity(merged - Number(inv.quantity));
        storedUnit = inv.unit;
        inventoryItemIds.push(inv.id);
        addedToInventory = true;
      }
    } else {
      const { data: created, error: invErr } = await supabase
        .from("inventory_items")
        .insert({
          household_id: household.id,
          product_id: productId,
          location,
          quantity: qty,
          unit: defaultUnit,
          updated_by: userId,
        })
        .select("id")
        .single();
      if (invErr || !created) {
        failures += 1;
        continue;
      }
      inventoryItemIds.push(created.id);
      addedToInventory = true;
    }
    if (addedToInventory) added += 1;

    // Historial (F5): un evento "repuesto" por lo que entró de verdad, en la
    // unidad de la fila. Sin folding (es una compra puntual, no el stepper).
    if (addedToInventory && storedQty > 0) {
      await recordStockEvent(supabase, {
        householdId: household.id,
        productId,
        quantity: storedQty,
        unit: storedUnit,
        kind: "restocked",
        userId,
      });
    }

    // Memoria de habitualidad: este producto se ha comprado (también con
    // conflicto de unidad: la compra ocurrió aunque el stock no se sumara).
    await supabase.rpc("bump_product_purchase", { pid: productId });
    tripProductIds.push(productId);
    doneIds.push(item.id);
  }

  // Lo reclamado que no se pudo pasar se suelta: sigue marcado (el reclamo ya
  // no lo desmarca), así que basta con quitarle la marca de reclamo para que el
  // siguiente «Finalizar» lo pueda reintentar sin esperar a que caduque.
  const done = new Set(doneIds);
  const unresolvedIds = claimed
    .map((i) => i.id)
    .filter((id) => !done.has(id));
  if (unresolvedIds.length > 0) {
    await supabase
      .from("shopping_list_items")
      .update({ checkout_claimed_at: null })
      .eq("household_id", household.id)
      .in("id", unresolvedIds);
  }

  if (doneIds.length === 0) {
    revalidatePath("/lista");
    return {
      error: "No se pudo pasar la compra al inventario. Inténtalo de nuevo.",
    };
  }

  /*
    Snapshot de la compra (G2) ANTES del borrado: es el único instante en que
    existe la información de qué había en la lista. Best-effort — perder el
    snapshot degrada una comparación futura, pero no puede impedir que el
    usuario cierre su compra.

    Va DESPUÉS de comprobar que algo entró de verdad. Antes se escribía siempre,
    así que un checkout que fallaba entero dejaba un trip con cero productos: la
    lista se ponía a ofrecer «¿tienes el ticket de esta compra?» por una compra
    que no ocurrió y, al reintentar, el ticket podía emparejarse con el trip
    vacío en vez de con el bueno — y entonces TODO lo comprado contaba como
    «extra», o sea «0 de 1 compras perfectas» y un «capricho recurrente» hecho
    con la lista de la compra.
  */
  try {
    // El cliente NO lanza en error de BD: devuelve { error }. Hay que mirarlo, o
    // un snapshot fallido pasaría desapercibido, que es justo el dato que esta
    // escritura existe para no perder.
    const { error: tripErr } = await supabase.from("shopping_trips").insert({
      household_id: household.id,
      closed_by: userId,
      product_ids: [...new Set(tripProductIds)],
      item_count: doneIds.length,
      ...(matchedReceipt && receiptFirst
        ? { receipt_id: receiptFirst.receiptId }
        : {}),
    });
    if (tripErr) {
      console.error("Snapshot de compra falló (best-effort):", tripErr);
    }
  } catch (err) {
    console.error("Snapshot de compra falló (best-effort):", err);
  }

  await supabase
    .from("shopping_list_items")
    .delete()
    .eq("household_id", household.id)
    .in("id", doneIds);

  revalidatePath("/lista");
  revalidatePath("/inventario");

  const failureNote =
    failures === 0
      ? []
      : [
          failures === 1
            ? "1 producto no se pudo pasar al inventario; sigue marcado en la lista para reintentar."
            : `${failures} productos no se pudieron pasar al inventario; siguen marcados en la lista para reintentar.`,
        ];
  const warning = [...unitConflicts, ...failureNote].join(" ") || undefined;

  return { ok: true, added, inventoryItemIds, warning };
}
