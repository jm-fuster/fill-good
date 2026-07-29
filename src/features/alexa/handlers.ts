import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordStockEvent } from "@/features/inventory/events";
import {
  mergeIntoExisting,
  nextListPosition,
} from "@/features/shopping-list/items";
import { getExpiryStatus } from "@/lib/dates";
import { loadHouseholdMatchData } from "@/lib/matching";
import { normalizeName } from "@/lib/normalize";
import type { Database, LocationType, UnitType } from "@/lib/supabase/types";
import { defaultListQuantity, roundQuantity } from "@/lib/units";

import {
  planAddition,
  planDeduction,
  resolveProduct,
  summarizeStock,
  type DeductionStep,
  type StockLot,
} from "./resolve";
import {
  emptyResponse,
  linkCard,
  speak,
  speakList,
  speakListQuantity,
  speakQuantity,
  speakUnit,
  SPEECH,
  type AlexaResponse,
} from "./respond";
import {
  getAmazonUserId,
  getPendingProduct,
  getSlotNumber,
  getSlotResolutionId,
  getSlotValue,
  type AlexaEnvelope,
  type AlexaIntent,
} from "./schemas";

/**
 * Lógica de la skill «mi despensa». Corre con el cliente service-role, así que
 * NO HAY RLS: el aislamiento por hogar depende de que cada consulta lleve el
 * `household_id` del vínculo ya verificado. Ese id no sale nunca del payload de
 * Amazon, solo de la fila de `alexa_links` que se buscó por `amazon_user_id`.
 *
 * El servidor es sin estado a propósito: cuando falta un dato se contesta con la
 * sesión abierta y el usuario repite la orden completa, que Alexa vuelve a
 * mandar como un IntentRequest entero. Así no hay que guardar conversaciones a
 * medias ni preocuparse de que caduquen.
 */

type Admin = SupabaseClient<Database>;

/** Ventana y tope de intentos de canje por usuario de Amazon (anti fuerza bruta). */
const LINK_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_LINK_ATTEMPTS = 5;

const UNIT_VALUES: readonly UnitType[] = ["ud", "g", "kg", "ml", "l"];

/** Misma ventana de «caduca pronto» que el resumen diario de caducidades. */
const EXPIRY_WARN_DAYS = 3;

function asUnitType(value: string | null): UnitType | null {
  return value !== null && (UNIT_VALUES as readonly string[]).includes(value)
    ? (value as UnitType)
    : null;
}

type AlexaLink = { id: string; householdId: string; userId: string };

/**
 * Echo sin vincular. Además de decirlo, deja la tarjeta con los pasos en el
 * móvil: es el punto donde se queda quien acaba de habilitar la skill, y lo que
 * necesita está en la app, no en el altavoz.
 */
function notLinkedResponse(): AlexaResponse {
  return speak(SPEECH.notLinked, { card: linkCard() });
}

type ProductInfo = {
  name: string;
  defaultUnit: UnitType;
  defaultLocation: LocationType;
};

/** Todo lo que necesitan por igual «resta…» y «añade…» antes de decidir nada. */
type VoiceTarget = {
  link: AlexaLink;
  productId: string;
  product: ProductInfo;
  /** Lo que hay que restar o sumar. */
  quantity: number;
  /** Unidad dicha, o null si no la dijo. */
  unit: UnitType | null;
  /** TODOS los lotes del producto, del que antes caduca al que después. */
  lots: StockLot[];
};

async function findLink(
  admin: Admin,
  amazonUserId: string,
): Promise<AlexaLink | null> {
  const { data } = await admin
    .from("alexa_links")
    .select("id, household_id, user_id")
    .eq("amazon_user_id", amazonUserId)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, householdId: data.household_id, userId: data.user_id };
}

/** Nombres de catálogo para poder decirlos en voz alta, en el orden pedido. */
async function loadProducts(
  admin: Admin,
  householdId: string,
  productIds: string[],
): Promise<Map<string, ProductInfo>> {
  const products = new Map<string, ProductInfo>();
  if (productIds.length === 0) return products;
  const { data } = await admin
    .from("products")
    .select("id, name, default_unit, default_location")
    .eq("household_id", householdId)
    .in("id", productIds);
  for (const row of data ?? []) {
    products.set(row.id, {
      name: row.name,
      defaultUnit: row.default_unit,
      defaultLocation: row.default_location,
    });
  }
  return products;
}

/** Aplica el plan lote a lote. Devuelve false si alguna escritura falla. */
async function applySteps(
  admin: Admin,
  link: AlexaLink,
  steps: DeductionStep[],
): Promise<boolean> {
  for (const step of steps) {
    const { error } = await admin
      .from("inventory_items")
      .update({ quantity: step.newQuantity, updated_by: link.userId })
      .eq("household_id", link.householdId)
      .eq("id", step.lotId);
    if (error) return false;
  }
  return true;
}

/**
 * Historial: un evento por unidad de lote tocada (un descuento en kilos puede
 * salir de un lote de 500 g y otro de 1 kg). `fold` agrupa con el movimiento
 * reciente del mismo producto y autor, igual que el stepper de la app, para que
 * quitar de tres en tres por voz no llene el historial de líneas de una unidad.
 */
async function recordSteps(
  admin: Admin,
  link: AlexaLink,
  productId: string,
  steps: DeductionStep[],
): Promise<void> {
  const takenByUnit = new Map<UnitType, number>();
  for (const step of steps) {
    takenByUnit.set(step.unit, (takenByUnit.get(step.unit) ?? 0) + step.taken);
  }
  for (const [unit, quantity] of takenByUnit) {
    await recordStockEvent(admin, {
      householdId: link.householdId,
      productId,
      quantity: roundQuantity(quantity),
      unit,
      kind: "consumed",
      userId: link.userId,
      fold: true,
    });
  }
}

/**
 * Resuelve el vínculo, los slots, el producto y sus lotes: el trabajo idéntico
 * que hacen «resta dos yogures» y «añade dos yogures» antes de separarse. Cuando
 * algo falta devuelve ya la respuesta hablada, y quien llama solo tiene que
 * propagarla.
 *
 * `notFound` deja que cada intent redacte su propio «no lo encuentro»: al restar
 * se sugiere añadirlo, y al sumar hay que explicar que por voz no se crean
 * productos.
 */
async function prepareVoiceTarget(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<
  | { ok: true; target: VoiceTarget }
  | { ok: false; response: AlexaResponse }
  | { ok: false; notFound: true; spoken: string }
> {
  const amazonUserId = getAmazonUserId(envelope);
  if (!amazonUserId) return { ok: false, response: notLinkedResponse() };
  const link = await findLink(admin, amazonUserId);
  if (!link) return { ok: false, response: notLinkedResponse() };

  const spoken = getSlotValue(intent, "producto");
  if (!spoken) {
    return {
      ok: false,
      response: speak(SPEECH.productMissing, {
        endSession: false,
        reprompt: SPEECH.fallbackReprompt,
      }),
    };
  }
  // Sin cantidad, «quita yogur» es una unidad. La unidad solo se acepta si Alexa
  // la ha resuelto a uno de nuestros ids canónicos.
  const quantity = getSlotNumber(intent, "cantidad") ?? 1;
  const unit = asUnitType(getSlotResolutionId(intent, "unidad"));

  const [matchData] = await Promise.all([
    loadHouseholdMatchData(admin, link.householdId),
    // Delata en /perfil los vínculos que ya no se usan. Best-effort.
    admin
      .from("alexa_links")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", link.id),
  ]);

  const resolution = resolveProduct(spoken, matchData);
  if (resolution.kind === "none") return { ok: false, notFound: true, spoken };
  if (resolution.kind === "ambiguous") {
    const products = await loadProducts(
      admin,
      link.householdId,
      resolution.productIds,
    );
    const spokenNames = resolution.productIds
      .map((id) => products.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    // Sin nombres que ofrecer no hay pregunta que hacer (no debería pasar: los
    // candidatos salen del catálogo de este mismo hogar).
    if (spokenNames.length === 0) return { ok: false, notFound: true, spoken };
    return {
      ok: false,
      response: speak(SPEECH.ambiguous(spoken, spokenNames), {
        endSession: false,
        reprompt: SPEECH.ambiguousReprompt,
      }),
    };
  }

  const productId = resolution.productId;
  const products = await loadProducts(admin, link.householdId, [productId]);
  const product = products.get(productId);
  if (!product) return { ok: false, notFound: true, spoken };

  // Se cargan TODOS los lotes, también los agotados: una fila a 0 se conserva
  // como «agotado», y al sumar hay que reutilizarla en vez de intentar crear
  // otra en la misma ubicación (la clave (hogar, producto, ubicación) es única).
  // `planDeduction` ya descarta por su cuenta los que están a 0.
  const { data: rows } = await admin
    .from("inventory_items")
    .select("id, quantity, unit, location, expiry_date")
    .eq("household_id", link.householdId)
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  const lots: StockLot[] = (rows ?? []).map((row) => ({
    id: row.id,
    quantity: Number(row.quantity),
    unit: row.unit,
    location: row.location,
    expiryDate: row.expiry_date,
  }));

  return { ok: true, target: { link, productId, product, quantity, unit, lots } };
}

async function handleRestarStock(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const prepared = await prepareVoiceTarget(admin, envelope, intent);
  if (!prepared.ok) {
    return "notFound" in prepared
      ? speak(SPEECH.productUnknown(prepared.spoken))
      : prepared.response;
  }
  const { link, productId, product, quantity, unit, lots } = prepared.target;
  const name = product.name;

  const plan = planDeduction({ quantity, unit, lots });
  switch (plan.kind) {
    case "invalid_quantity":
      return speak(SPEECH.quantityInvalid, {
        endSession: false,
        reprompt: SPEECH.fallbackReprompt,
      });
    case "no_stock":
      return speak(SPEECH.noStock(name));
    case "unit_mismatch":
      return speak(
        SPEECH.unitMismatch(
          name,
          speakUnit(plan.available),
          speakUnit(plan.asked),
        ),
      );
    case "ask_unit":
      return speak(
        SPEECH.askUnit(
          name,
          speakList(plan.stock.map((s) => speakQuantity(s.quantity, s.unit))),
        ),
        { endSession: false, reprompt: SPEECH.askUnitReprompt },
      );
    case "deduct": {
      if (plan.steps.length === 0) return speak(SPEECH.noStock(name));
      const applied = await applySteps(admin, link, plan.steps);
      if (!applied) return speak(SPEECH.error);
      await recordSteps(admin, link, productId, plan.steps);

      const taken = speakQuantity(plan.taken, plan.unit);
      if (!plan.covered) return speak(SPEECH.deductedPartial(taken, name));
      return speak(
        SPEECH.deducted(
          taken,
          name,
          plan.remaining > 0 ? speakQuantity(plan.remaining, plan.unit) : null,
        ),
      );
    }
  }
}

async function handleSumarStock(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const prepared = await prepareVoiceTarget(admin, envelope, intent);
  if (!prepared.ok) {
    return "notFound" in prepared
      ? speak(SPEECH.addProductUnknown(prepared.spoken))
      : prepared.response;
  }
  const { link, productId, product, quantity, unit, lots } = prepared.target;
  const name = product.name;

  const plan = planAddition({
    quantity,
    unit,
    lots,
    defaultUnit: product.defaultUnit,
    defaultLocation: product.defaultLocation,
  });
  switch (plan.kind) {
    case "invalid_quantity":
      return speak(SPEECH.quantityInvalid, {
        endSession: false,
        reprompt: SPEECH.fallbackReprompt,
      });
    case "unit_mismatch":
      return speak(
        SPEECH.addUnitMismatch(
          name,
          speakUnit(plan.available),
          speakUnit(plan.asked),
        ),
      );
    case "ask_unit":
      return speak(SPEECH.addAskUnit(name), {
        endSession: false,
        reprompt: SPEECH.addAskUnitReprompt,
      });
    case "add": {
      // La caducidad no se toca a propósito: por voz no se puede dictar, así que
      // ni se inventa en las filas nuevas ni se pisa la de las existentes.
      const { error } = plan.lotId
        ? await admin
            .from("inventory_items")
            .update({ quantity: plan.newQuantity, updated_by: link.userId })
            .eq("household_id", link.householdId)
            .eq("id", plan.lotId)
        : await admin.from("inventory_items").insert({
            household_id: link.householdId,
            product_id: productId,
            location: plan.location,
            quantity: plan.newQuantity,
            unit: plan.unit,
            updated_by: link.userId,
          });
      if (error) return speak(SPEECH.error);

      await recordStockEvent(admin, {
        householdId: link.householdId,
        productId,
        quantity: plan.added,
        unit: plan.unit,
        kind: "restocked",
        userId: link.userId,
        fold: true,
      });
      // El eco repite lo que dijo el usuario («500 gramos»), no su equivalente en
      // la unidad del lote («0,5 kilos»): así se nota al instante si Alexa
      // entendió otra cantidad. El total sí va en la unidad del lote, que es la
      // que se lee bien («2,5 kilos» mejor que «2500 gramos»).
      return speak(
        SPEECH.added(
          unit ? speakQuantity(quantity, unit) : speakQuantity(plan.added, plan.unit),
          name,
          speakQuantity(plan.total, plan.unit),
        ),
      );
    }
  }
}

/**
 * Coletilla de caducidad para la consulta, o cadena vacía si no urge nada. Solo
 * se menciona lo caducado o lo que caduca dentro de la ventana de aviso: recitar
 * «caduca en 40 días» en cada pregunta sería ruido.
 */
function expiryHint(lots: StockLot[]): string {
  const conStock = lots.filter((lot) => lot.quantity > 0);
  const proxima = conStock
    .map((lot) => lot.expiryDate)
    .filter((date): date is string => date !== null)
    .sort()[0];
  if (!proxima) return "";

  const status = getExpiryStatus(proxima, EXPIRY_WARN_DAYS);
  if (!status || status.status === "ok") return "";
  if (status.days < 0) {
    // Que esté caducado todo o solo un lote cambia lo que harás con ello.
    const todo = conStock.every((lot) => {
      const propio = getExpiryStatus(lot.expiryDate, EXPIRY_WARN_DAYS);
      return propio !== null && propio.days < 0;
    });
    return todo ? SPEECH.stockAllExpired : SPEECH.stockSomeExpired;
  }
  const cuando =
    status.days === 0 ? "hoy" : status.days === 1 ? "mañana" : `en ${status.days} días`;
  return SPEECH.stockExpiringSoon(cuando);
}

async function handleConsultarStock(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const prepared = await prepareVoiceTarget(admin, envelope, intent);
  if (!prepared.ok) {
    return "notFound" in prepared
      ? speak(SPEECH.productUnknown(prepared.spoken))
      : prepared.response;
  }
  const { product, lots } = prepared.target;

  // Solo lectura: este intent no escribe nada en el inventario.
  const stock = summarizeStock(lots.filter((lot) => lot.quantity > 0));
  if (stock.length === 0) return speak(SPEECH.stockEmpty(product.name));

  return speak(
    SPEECH.stockReport(
      product.name,
      speakList(stock.map((s) => speakQuantity(s.quantity, s.unit))),
    ) + expiryHint(lots),
  );
}

/**
 * Id de la lista activa del hogar, creándola si no hay. Replica
 * `ensure_active_list` (20260719131524) en vez de invocarla: esa RPC es SECURITY
 * DEFINER y su guarda usa `clerk_user_id()`, que con el service-role es null y
 * haría saltar `not_a_member`. La pertenencia aquí la garantiza el vínculo.
 */
async function ensureActiveListId(
  admin: Admin,
  householdId: string,
): Promise<string | null> {
  const buscar = async () => {
    const { data } = await admin
      .from("shopping_lists")
      .select("id")
      .eq("household_id", householdId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  };
  const existente = await buscar();
  if (existente) return existente;

  const { data: creada } = await admin
    .from("shopping_lists")
    .insert({
      household_id: householdId,
      name: "Lista de la compra",
      status: "active",
    })
    .select("id")
    .single();
  // Si dos órdenes seguidas la crean a la vez, la segunda relee en vez de fallar.
  return creada?.id ?? (await buscar());
}

/** Primera letra en mayúscula: Alexa transcribe en minúscula y en la lista
 *  conviviría con nombres del catálogo escritos a mano. */
function capitalizar(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function handleApuntarLista(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const amazonUserId = getAmazonUserId(envelope);
  if (!amazonUserId) return notLinkedResponse();
  const link = await findLink(admin, amazonUserId);
  if (!link) return notLinkedResponse();

  const spoken = getSlotValue(intent, "producto");
  if (!spoken) {
    return speak(SPEECH.listMissing, {
      endSession: false,
      reprompt: SPEECH.fallbackReprompt,
    });
  }
  // Aquí la cantidad se queda en null si no la dicen: para la lista eso no es
  // «uno», es «ya veré cuánto cojo», y lo decide `defaultListQuantity` según la
  // unidad (los contables nacen en 1, lo que va a granel sin cantidad).
  const saidQuantity = getSlotNumber(intent, "cantidad");
  const saidUnit = asUnitType(getSlotResolutionId(intent, "unidad"));

  const [matchData] = await Promise.all([
    loadHouseholdMatchData(admin, link.householdId),
    admin
      .from("alexa_links")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", link.id),
  ]);

  // A diferencia del inventario, aquí NO hace falta que el producto exista: la
  // lista admite texto libre (`product_id` es nullable), igual que al escribirlo
  // en la app. Enlazarlo cuando se reconoce sirve para el checkout y los avisos.
  const resolution = resolveProduct(spoken, matchData);
  let productId: string | null = null;
  let name = capitalizar(spoken);
  let defaultUnit: UnitType | null = null;

  if (resolution.kind === "ambiguous") {
    const products = await loadProducts(
      admin,
      link.householdId,
      resolution.productIds,
    );
    const spokenNames = resolution.productIds
      .map((id) => products.get(id)?.name)
      .filter((n): n is string => Boolean(n));
    if (spokenNames.length > 0) {
      return speak(SPEECH.ambiguous(spoken, spokenNames), {
        endSession: false,
        reprompt: SPEECH.ambiguousReprompt,
      });
    }
  } else if (resolution.kind === "match") {
    const products = await loadProducts(admin, link.householdId, [
      resolution.productId,
    ]);
    const product = products.get(resolution.productId);
    if (product) {
      productId = resolution.productId;
      name = product.name;
      defaultUnit = product.defaultUnit;
    }
  }

  const unit = saidUnit ?? defaultUnit;
  const quantity = saidQuantity ?? defaultListQuantity(unit);

  // Aviso de existencias: el sentido de la app es comprar lo justo, así que si
  // aún queda en casa merece decirlo en voz alta antes de que se compre doble.
  let warning = "";
  if (productId) {
    const { data: inv } = await admin
      .from("inventory_items")
      .select("quantity, unit")
      .eq("household_id", link.householdId)
      .eq("product_id", productId)
      .gt("quantity", 0);
    const total = (inv ?? []).reduce((sum, row) => sum + Number(row.quantity), 0);
    if (total > 0 && inv?.[0]) {
      warning = SPEECH.listStockWarning(
        speakQuantity(roundQuantity(total), inv[0].unit),
      );
    }
  }

  const resultado = await apuntarEnLista(admin, link, {
    productId,
    name,
    normalized: normalizeName(spoken),
    quantity,
    unit,
  });
  if (!resultado.ok) return speak(SPEECH.error);
  return speak(resultado.speech + warning);
}

type ApuntarResultado = { ok: false } | { ok: true; speech: string };

/**
 * Mete un artículo en la lista activa (creándola si hace falta) aplicando la
 * deduplicación L3, y devuelve ya lo que hay que decir. Lo comparten el intent
 * de apuntar y el «sí» con el que se confirma un producto agotado.
 */
async function apuntarEnLista(
  admin: Admin,
  link: AlexaLink,
  item: {
    productId: string | null;
    name: string;
    normalized: string;
    quantity: number | null;
    unit: UnitType | null;
  },
): Promise<ApuntarResultado> {
  const listId = await ensureActiveListId(admin, link.householdId);
  if (!listId) return { ok: false };

  const merged = await mergeIntoExisting(
    admin,
    listId,
    { productId: item.productId, normalized: item.normalized },
    { quantity: item.quantity, unit: item.unit },
  );
  if (merged) {
    return {
      ok: true,
      speech: SPEECH.listMerged(
        merged.name,
        speakListQuantity(merged.quantity, merged.unit),
      ),
    };
  }

  const position = await nextListPosition(admin, listId);
  const { error } = await admin.from("shopping_list_items").insert({
    list_id: listId,
    household_id: link.householdId,
    product_id: item.productId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    added_by: link.userId,
    position,
  });
  if (error) return { ok: false };

  return {
    ok: true,
    speech: SPEECH.listAdded(
      item.name,
      speakListQuantity(item.quantity, item.unit),
    ),
  };
}

/**
 * «Se ha acabado el pan»: vacía TODO lo que quede del producto y ofrece
 * apuntarlo en la lista, porque es lo que uno querría a continuación. La
 * pregunta se resuelve con `sessionAttributes` (ver `SessionState`), así que el
 * servidor sigue sin recordar nada entre peticiones.
 *
 * Se registra como `consumed` por la cantidad que quedaba: si había dos panes y
 * se acabaron, dos panes se consumieron, y el historial debe decirlo. Las filas
 * se conservan a 0 (agotado), igual que en el resto de la app.
 */
async function handleAgotarStock(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const prepared = await prepareVoiceTarget(admin, envelope, intent);
  if (!prepared.ok) {
    return "notFound" in prepared
      ? speak(SPEECH.productUnknown(prepared.spoken))
      : prepared.response;
  }
  const { link, productId, product, lots } = prepared.target;
  const conStock = lots.filter((lot) => lot.quantity > 0);

  const pendiente = {
    productId,
    name: product.name,
    normalized: normalizeName(product.name),
  };

  if (conStock.length === 0) {
    // Ya estaba a cero: no hay nada que vaciar, pero la oferta sigue teniendo
    // sentido (si lo dices en voz alta es porque hace falta comprarlo).
    return speak(SPEECH.emptiedAlready(product.name), {
      endSession: false,
      reprompt: SPEECH.emptiedAskReprompt,
      state: { pendiente },
    });
  }

  for (const lot of conStock) {
    const { error } = await admin
      .from("inventory_items")
      .update({ quantity: 0, updated_by: link.userId })
      .eq("household_id", link.householdId)
      .eq("id", lot.id);
    if (error) return speak(SPEECH.error);
  }
  await recordSteps(
    admin,
    link,
    productId,
    conStock.map((lot) => ({
      lotId: lot.id,
      newQuantity: 0,
      taken: lot.quantity,
      unit: lot.unit,
    })),
  );

  return speak(SPEECH.emptiedAsk(product.name), {
    endSession: false,
    reprompt: SPEECH.emptiedAskReprompt,
    state: { pendiente },
  });
}

/** «Sí» a la pregunta de apuntar lo que se acaba de agotar. */
async function handleSi(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<AlexaResponse> {
  const pendiente = getPendingProduct(envelope);
  if (!pendiente) {
    return speak(SPEECH.nothingPending, {
      endSession: false,
      reprompt: SPEECH.fallbackReprompt,
    });
  }
  const amazonUserId = getAmazonUserId(envelope);
  if (!amazonUserId) return notLinkedResponse();
  const link = await findLink(admin, amazonUserId);
  if (!link) return notLinkedResponse();

  // La unidad de la lista sale del catálogo: el producto se acaba de agotar, así
  // que no queda ningún lote del que deducirla.
  const products = await loadProducts(admin, link.householdId, [
    pendiente.productId,
  ]);
  const unit = products.get(pendiente.productId)?.defaultUnit ?? null;

  const resultado = await apuntarEnLista(admin, link, {
    productId: pendiente.productId,
    name: pendiente.name,
    normalized: pendiente.normalized,
    quantity: defaultListQuantity(unit),
    unit,
  });
  return speak(resultado.ok ? resultado.speech : SPEECH.error);
}

async function handleVincular(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const amazonUserId = getAmazonUserId(envelope);
  if (!amazonUserId) return speak(SPEECH.error);

  // AMAZON.NUMBER puede llegar con separadores si se dictan los dígitos de dos
  // en dos; nos quedamos solo con las cifras.
  const code = (getSlotValue(intent, "codigo") ?? "").replace(/\D/g, "");
  if (!/^[1-9][0-9]{5}$/.test(code)) {
    return speak(SPEECH.linkCodeMissing, {
      endSession: false,
      reprompt: SPEECH.linkCodeMissing,
    });
  }

  const since = new Date(Date.now() - LINK_ATTEMPT_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("alexa_link_attempts")
    .select("id", { count: "exact", head: true })
    .eq("amazon_user_id", amazonUserId)
    .gte("attempted_at", since);
  if ((count ?? 0) >= MAX_LINK_ATTEMPTS) return speak(SPEECH.linkRateLimited);

  const { data: found } = await admin
    .from("alexa_link_codes")
    .select("code, household_id, user_id")
    .eq("code", code)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!found) {
    // Solo cuentan los intentos FALLIDOS, igual que en join_household_by_code.
    await admin.from("alexa_link_attempts").insert({ amazon_user_id: amazonUserId });
    return speak(SPEECH.linkCodeInvalid, { card: linkCard() });
  }

  const { error } = await admin.from("alexa_links").upsert(
    {
      amazon_user_id: amazonUserId,
      household_id: found.household_id,
      user_id: found.user_id,
      last_used_at: null,
    },
    { onConflict: "amazon_user_id" },
  );
  if (error) return speak(SPEECH.error);

  // Un código, un uso.
  await admin.from("alexa_link_codes").delete().eq("code", code);

  const { data: household } = await admin
    .from("households")
    .select("name")
    .eq("id", found.household_id)
    .maybeSingle();
  return speak(SPEECH.linked(household?.name ?? "tu hogar"));
}

async function handleIntent(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<AlexaResponse> {
  const intent = envelope.request.intent;
  if (!intent) {
    return speak(SPEECH.fallback, {
      endSession: false,
      reprompt: SPEECH.fallbackReprompt,
    });
  }
  switch (intent.name) {
    case "RestarStockIntent":
      return handleRestarStock(admin, envelope, intent);
    case "SumarStockIntent":
      return handleSumarStock(admin, envelope, intent);
    case "ApuntarListaIntent":
      return handleApuntarLista(admin, envelope, intent);
    case "ConsultarStockIntent":
      return handleConsultarStock(admin, envelope, intent);
    case "AgotarStockIntent":
      return handleAgotarStock(admin, envelope, intent);
    case "AMAZON.YesIntent":
      return handleSi(admin, envelope);
    case "AMAZON.NoIntent":
      // Un «no» sin nada pendiente es tan inofensivo como un «vale»: se cierra.
      return speak(
        getPendingProduct(envelope) ? SPEECH.emptiedNo : SPEECH.stop,
      );
    case "VincularIntent":
      return handleVincular(admin, envelope, intent);
    case "AMAZON.HelpIntent":
      return speak(SPEECH.help, {
        endSession: false,
        reprompt: SPEECH.helpReprompt,
      });
    case "AMAZON.StopIntent":
    case "AMAZON.CancelIntent":
    case "AMAZON.NavigateHomeIntent":
      return speak(SPEECH.stop);
    default:
      return speak(SPEECH.fallback, {
        endSession: false,
        reprompt: SPEECH.fallbackReprompt,
      });
  }
}

/**
 * Intents que ESCRIBEN, los únicos que se protegen contra reintentos. Consultar
 * y pedir ayuda no dejan rastro, así que cobrarles dos escrituras (reclamar y
 * guardar la respuesta) las haría más lentas para prevenir un problema que no
 * tienen — y la lentitud es justo lo que provoca los reintentos.
 */
const MUTATING_INTENTS = new Set([
  "RestarStockIntent",
  "SumarStockIntent",
  "ApuntarListaIntent",
  "AgotarStockIntent",
  "AMAZON.YesIntent",
  "VincularIntent",
]);

/**
 * Estrecha lo que había guardado en `alexa_requests.response`. Viene de la base
 * como jsonb, así que se comprueba como cualquier otra entrada: si no tiene la
 * forma esperada se descarta y se contesta con la disculpa, nunca se reenvía a
 * Amazon un envelope que no lo es.
 */
function storedResponse(value: unknown): AlexaResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { version?: unknown; response?: unknown };
  const ok =
    candidate.version === "1.0" &&
    typeof candidate.response === "object" &&
    candidate.response !== null;
  return ok ? (value as AlexaResponse) : null;
}

/**
 * Idempotencia frente a los reintentos de Amazon. Si el endpoint tarda más de
 * ~8 s (cold start), Amazon reenvía LA MISMA petición con el mismo `requestId`;
 * sin esto, «resta dos yogures» descontaba cuatro.
 *
 * La reclamación es un INSERT: la clave primaria de `alexa_requests` es el
 * cerrojo, así que de dos copias simultáneas solo una llega a escribir. La otra
 * devuelve la respuesta ya calculada — que es la que el usuario oirá, porque el
 * primer envío se lo comió el timeout— y si todavía no está lista, contesta que
 * va con retraso en vez de repetir el movimiento.
 */
async function withRequestDedupe(
  admin: Admin,
  envelope: AlexaEnvelope,
  run: () => Promise<AlexaResponse>,
): Promise<AlexaResponse> {
  const requestId = envelope.request.requestId;
  const intentName = envelope.request.intent?.name;
  if (!requestId || !intentName || !MUTATING_INTENTS.has(intentName)) {
    return run();
  }

  const { error } = await admin
    .from("alexa_requests")
    .insert({ request_id: requestId });

  if (error) {
    // 23505 = clave duplicada: la petición ya estaba reclamada, esto es el
    // reintento. Cualquier otro fallo no debe dejar muda a la skill: se atiende
    // sin protección, como se hacía antes de esta tabla.
    if (error.code !== "23505") {
      console.error("Alexa: no se pudo reclamar la petición.", error);
      return run();
    }
    const { data } = await admin
      .from("alexa_requests")
      .select("response")
      .eq("request_id", requestId)
      .maybeSingle();
    return storedResponse(data?.response) ?? speak(SPEECH.slowRetry);
  }

  const response = await run();
  // Best-effort: si esto falla, un reintento posterior oirá «voy con retraso»,
  // molesto pero inofensivo. Lo importante ya ha pasado: la reclamación.
  await admin
    .from("alexa_requests")
    .update({ response })
    .eq("request_id", requestId);
  return response;
}

/**
 * Punto de entrada: convierte una petición ya verificada en una respuesta de
 * voz. Cualquier excepción se traduce en una disculpa hablada, nunca en un 500:
 * ante un error HTTP el Echo suelta su propio «hay un problema con la skill
 * solicitada», que no dice nada de qué ha pasado.
 */
export async function dispatchAlexaRequest(
  envelope: AlexaEnvelope,
  admin: Admin,
): Promise<AlexaResponse> {
  try {
    switch (envelope.request.type) {
      case "LaunchRequest":
        return speak(SPEECH.welcome, {
          endSession: false,
          reprompt: SPEECH.welcomeReprompt,
        });
      case "IntentRequest":
        return await withRequestDedupe(admin, envelope, () =>
          handleIntent(admin, envelope),
        );
      case "SessionEndedRequest":
      default:
        // SessionEndedRequest llega también cuando el dispositivo aborta por un
        // error: hablar aquí está prohibido por la propia plataforma.
        return emptyResponse();
    }
  } catch (error) {
    console.error("Alexa: fallo al procesar la petición.", error);
    return speak(SPEECH.error);
  }
}
