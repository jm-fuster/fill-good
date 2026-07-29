import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordStockEvent } from "@/features/inventory/events";
import { loadHouseholdMatchData } from "@/lib/matching";
import type { Database, LocationType, UnitType } from "@/lib/supabase/types";
import { roundQuantity } from "@/lib/units";

import {
  planAddition,
  planDeduction,
  resolveProduct,
  type DeductionStep,
  type StockLot,
} from "./resolve";
import {
  emptyResponse,
  speak,
  speakList,
  speakQuantity,
  speakUnit,
  SPEECH,
  type AlexaResponse,
} from "./respond";
import {
  getAmazonUserId,
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

function asUnitType(value: string | null): UnitType | null {
  return value !== null && (UNIT_VALUES as readonly string[]).includes(value)
    ? (value as UnitType)
    : null;
}

type AlexaLink = { id: string; householdId: string; userId: string };

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
  if (!amazonUserId) return { ok: false, response: speak(SPEECH.notLinked) };
  const link = await findLink(admin, amazonUserId);
  if (!link) return { ok: false, response: speak(SPEECH.notLinked) };

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
    return speak(SPEECH.linkCodeInvalid);
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
        return await handleIntent(admin, envelope);
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
