import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordStockEvent } from "@/features/inventory/events";
import type { MealSlotKey } from "@/features/menus/slots";
import {
  mergeIntoExisting,
  nextListPosition,
} from "@/features/shopping-list/items";
import {
  getExpiryStatus,
  hourInSpain,
  shiftDays,
  todayLocalISO,
} from "@/lib/dates";
import { loadHouseholdMatchData } from "@/lib/matching";
import { normalizeName } from "@/lib/normalize";
import type {
  Database,
  InventoryEventKind,
  LocationType,
  UnitType,
} from "@/lib/supabase/types";
import { defaultListQuantity, roundQuantity } from "@/lib/units";

import {
  ordinalFromWord,
  pickCandidate,
  planAddition,
  planDeduction,
  resolveProduct,
  summarizeStock,
  type DeductionStep,
  type StockLot,
} from "./resolve";
import {
  planCooked,
  readExpiring,
  readShoppingList,
  readTodayDishes,
  readTodayMenu,
} from "./reports";
import {
  emptyResponse,
  linkCard,
  speak,
  speakDue,
  speakList,
  speakListQuantity,
  speakQuantity,
  speakUnit,
  speakWhen,
  SPEECH,
  type AlexaResponse,
  type PendingState,
  type SessionState,
  type VoiceAction,
} from "./respond";
import {
  getAmazonUserId,
  getPending,
  getSlotOrdinal,
  getSlotResolutionId,
  getSlotValue,
  getSpokenQuantity,
  isConversationMode,
  type AlexaEnvelope,
  type AlexaIntent,
} from "./schemas";

/**
 * Lógica de la skill «mi despensa». Corre con el cliente service-role, así que
 * NO HAY RLS: el aislamiento por hogar depende de que cada consulta lleve el
 * `household_id` del vínculo ya verificado. Ese id no sale nunca del payload de
 * Amazon, solo de la fila de `alexa_links` que se buscó por `amazon_user_id`.
 *
 * El servidor sigue siendo sin estado; la conversación, no. Cuando falta un dato
 * se contesta con la sesión abierta y lo que quedó pendiente viaja en los
 * `sessionAttributes` del propio envelope (`PendingState` en respond.ts), nunca
 * en memoria nuestra. Así el usuario contesta SOLO lo que falta —«el natural»,
 * «medio kilo»— en vez de repetir la orden entera, y aquí no hay conversaciones a
 * medias que guardar ni que caducar: si el usuario se va, se va con ellas.
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

const MEAL_SLOTS: readonly MealSlotKey[] = ["breakfast", "lunch", "dinner"];

/** Hueco de comida dicho («de cena»), o null si la pregunta no lo acotaba. */
function asMealSlot(value: string | null): MealSlotKey | null {
  return value !== null && (MEAL_SLOTS as readonly string[]).includes(value)
    ? (value as MealSlotKey)
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
  /**
   * La petición de Amazon que dio esta orden. Viaja hasta aquí para poder
   * anotar en su propia fila cómo deshacerla: es la misma fila que ya sirve de
   * cerrojo contra los reintentos, así que no hace falta inventar otra clave.
   */
  requestId: string | null;
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

/** Delata en Ajustes los vínculos que ya no se usan. Best-effort, sin esperar. */
function touchLink(admin: Admin, link: AlexaLink): PromiseLike<unknown> {
  return admin
    .from("alexa_links")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", link.id);
}

/**
 * El vínculo de este Echo, o ya la respuesta de «no vinculado». Todo lo que
 * toca datos empieza igual, y de aquí sale el `household_id`: el único sitio de
 * donde puede salir, porque el payload de Amazon no lo trae.
 */
async function requireLink(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<
  { ok: true; link: AlexaLink } | { ok: false; response: AlexaResponse }
> {
  const amazonUserId = getAmazonUserId(envelope);
  if (!amazonUserId) return { ok: false, response: notLinkedResponse() };
  const link = await findLink(admin, amazonUserId);
  if (!link) return { ok: false, response: notLinkedResponse() };
  // La membresía puede perderse DESPUÉS de vincular (salir del hogar, ser
  // expulsado). Este cliente es service-role, sin RLS que lo pare, así que el
  // vínculo se re-verifica en cada petición y muere aquí si ya no procede; la
  // migración 20260731180000 limpia además al salir/expulsar.
  //
  // Solo se desvincula ante un «no» de verdad: un error de lectura (un corte
  // de red, un timeout de la base) devolvía `member` nulo igual que una
  // expulsión, y borraba el vínculo — obligando a vincular otra vez desde la
  // app por un fallo de un segundo.
  const { data: member, error: memberErr } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", link.householdId)
    .eq("user_id", link.userId)
    .maybeSingle();
  if (memberErr) return { ok: false, response: speak(SPEECH.error) };
  if (!member) {
    await admin.from("alexa_links").delete().eq("id", link.id);
    return { ok: false, response: notLinkedResponse() };
  }
  // Cada orden que modifica algo queda firmada con su altavoz, tenga o no
  // plan de deshacer: así «deshaz» sabe cuál fue la ÚLTIMA. Antes solo se
  // firmaban las que tenían plan, y «apunta pan» → «deshaz» revertía el
  // «quita dos yogures» de antes. La fila solo existe para las órdenes que
  // modifican (la crea `withRequestDedupe`); para las demás no toca nada.
  const requestId = envelope.request.requestId;
  if (requestId) {
    await admin
      .from("alexa_requests")
      .update({ link_id: link.id })
      .eq("request_id", requestId)
      .is("link_id", null);
  }
  return { ok: true, link };
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

/** Los candidatos con su nombre, para poder ofrecerlos, en el orden pedido. */
function namedCandidates(
  productIds: string[],
  products: Map<string, ProductInfo>,
): { id: string; name: string }[] {
  return productIds
    .map((id) => ({ id, name: products.get(id)?.name }))
    .filter((c): c is { id: string; name: string } => c.name !== undefined);
}

/**
 * Pregunta cuál de los candidatos era, dejando en la sesión TODO lo necesario
 * para retomar la orden con una respuesta suelta. Es lo que evita que el usuario
 * tenga que repetir «quita dos yogures naturales» entero.
 */
function askWhich(
  spoken: string,
  candidatos: { id: string; name: string }[],
  accion: VoiceAction,
  said: { quantity: number | null; unit: UnitType | null },
): AlexaResponse {
  return speak(
    SPEECH.ambiguous(
      spoken,
      candidatos.map((candidate) => candidate.name),
    ),
    {
      endSession: false,
      reprompt: SPEECH.ambiguousReprompt,
      state: {
        pendiente: {
          tipo: "elegir",
          accion,
          candidatos,
          cantidad: said.quantity,
          unidad: said.unit,
        },
      },
    },
  );
}

/**
 * El verbo con el que se pregunta y se contesta cada acción. Va aparte para que
 * el eco use el mismo que dijo el usuario: preguntarle «¿cuánto quito?» a quien
 * acaba de decir que ha TIRADO algo delata que no se le ha escuchado.
 */
function verboDe(accion: VoiceAction): string {
  switch (accion) {
    case "tirar":
    case "estropear":
      return "tiro";
    case "sumar":
      return "añado";
    default:
      return "quito";
  }
}

/** Lo que espera un «sí» para acabar en la lista de la compra. */
function pendingApuntar(productId: string, name: string): PendingState {
  return { tipo: "apuntar", productId, name, normalized: normalizeName(name) };
}

/**
 * Remata un «ya no queda nada» ofreciendo apuntarlo, que es lo que uno querría a
 * continuación —el sentido de la app es comprar lo justo, y algo a cero es justo
 * lo que hay que comprar—. Deja la sesión abierta para que el «sí» llegue sin
 * repetir «Alexa».
 */
function offerToList(
  text: string,
  productId: string,
  name: string,
): AlexaResponse {
  return speak(text + SPEECH.offerList, {
    endSession: false,
    reprompt: SPEECH.emptiedAskReprompt,
    state: { pendiente: pendingApuntar(productId, name) },
  });
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
  kind: InventoryEventKind,
): Promise<UndoEvent[]> {
  const takenByUnit = new Map<UnitType, number>();
  for (const step of steps) {
    takenByUnit.set(step.unit, (takenByUnit.get(step.unit) ?? 0) + step.taken);
  }
  const events: UndoEvent[] = [];
  for (const [unit, quantity] of takenByUnit) {
    const rounded = roundQuantity(quantity);
    const id = await recordStockEvent(admin, {
      householdId: link.householdId,
      productId,
      quantity: rounded,
      unit,
      kind,
      userId: link.userId,
      fold: true,
    });
    if (id) events.push({ id, quantity: rounded });
  }
  return events;
}

/** Cantidad que ESTA orden le sumó a un evento del historial (ver `fold`). */
type UndoEvent = { id: string; quantity: number };

/**
 * Cómo se deshace una orden. Se guarda el ESTADO PREVIO y no el movimiento: un
 * descuento repartido entre varios lotes no se revierte sumando lo mismo de
 * vuelta —el reparto podría salir distinto—, sino devolviendo cada lote a la
 * cantidad que tenía.
 */
type UndoPlan = {
  /** Solo para poder rastrear el origen; deshacer no lo necesita. Ausente
   *  cuando la orden tocó varios productos (una receta cocinada). */
  productId?: string;
  name: string;
  /**
   * Cantidad previa de cada lote tocado (null = la fila no existía) y la que
   * dejó la orden. Con las dos se deshace la DIFERENCIA y no se escribe el
   * número viejo: si entre la orden y el «deshaz» entró una compra o el otro
   * móvil tocó el stepper, restaurar el absoluto se lo llevaba por delante.
   * `after` falta en los planes anteriores a este campo (se deshacen como
   * antes).
   */
  lots: { id: string; quantity: number | null; after?: number }[];
  events: UndoEvent[];
};

/**
 * Estrecha lo guardado en `alexa_requests.undo`. Viene de la base como jsonb, o
 * sea que se comprueba como cualquier otra entrada: ante una forma que no
 * reconocemos se contesta que no hay nada que deshacer, que es mucho mejor que
 * aplicar a medias un plan que no entendemos.
 */
function storedUndo(value: unknown): UndoPlan | null {
  if (typeof value !== "object" || value === null) return null;
  const plan = value as Partial<UndoPlan>;
  if (typeof plan.name !== "string") return null;
  if (!Array.isArray(plan.lots) || !Array.isArray(plan.events)) return null;
  const lotesOk = plan.lots.every(
    (lot) =>
      typeof lot?.id === "string" &&
      (lot.quantity === null || typeof lot.quantity === "number") &&
      (lot.after === undefined || typeof lot.after === "number"),
  );
  const eventosOk = plan.events.every(
    (event) => typeof event?.id === "string" && typeof event.quantity === "number",
  );
  return lotesOk && eventosOk ? (value as UndoPlan) : null;
}

/**
 * Anota cómo deshacer la orden recién aplicada, en la misma fila que ya sirve de
 * cerrojo contra los reintentos. Best-effort: si falla, «deshaz» no encontrará
 * nada, que es exactamente donde estábamos antes de que esto existiera.
 */
async function recordUndo(
  admin: Admin,
  target: VoiceTarget,
  plan: UndoPlan,
): Promise<void> {
  if (!target.requestId) return;
  await admin
    .from("alexa_requests")
    .update({ link_id: target.link.id, undo: plan })
    .eq("request_id", target.requestId);
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
  accion: VoiceAction,
): Promise<
  | { ok: true; target: VoiceTarget }
  | { ok: false; response: AlexaResponse }
  | { ok: false; notFound: true; spoken: string }
> {
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked;
  const link = linked.link;

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
  // La cantidad se guarda TAL COMO SE DIJO (null si no la dijo): si hay que
  // preguntar cuál de varios productos era, al retomar la orden se le aplican
  // los mismos valores por defecto que aquí, en vez de arrastrar un 1 inventado.
  // La unidad solo se acepta si Alexa la ha resuelto a un id canónico nuestro.
  const said = {
    quantity: getSpokenQuantity(intent),
    unit: asUnitType(getSlotResolutionId(intent, "unidad")),
  };

  const [matchData] = await Promise.all([
    loadHouseholdMatchData(admin, link.householdId),
    touchLink(admin, link),
  ]);

  const resolution = resolveProduct(spoken, matchData);
  if (resolution.kind === "none") return { ok: false, notFound: true, spoken };
  if (resolution.kind === "ambiguous") {
    const products = await loadProducts(
      admin,
      link.householdId,
      resolution.productIds,
    );
    const candidatos = namedCandidates(resolution.productIds, products);
    // Sin nombres que ofrecer no hay pregunta que hacer (no debería pasar: los
    // candidatos salen del catálogo de este mismo hogar).
    if (candidatos.length === 0) return { ok: false, notFound: true, spoken };
    return { ok: false, response: askWhich(spoken, candidatos, accion, said) };
  }

  const target = await loadTarget(
    admin,
    link,
    resolution.productId,
    said,
    envelope.request.requestId ?? null,
  );
  if (!target) return { ok: false, notFound: true, spoken };
  return { ok: true, target };
}

/**
 * Carga el producto y sus lotes cuando YA se sabe de cuál se habla. Está
 * separado de la resolución por nombre porque al retomar una orden —el usuario
 * acaba de elegir entre varios candidatos, o de decir la unidad que faltaba— no
 * hay nombre que resolver ni slots que interpretar, solo un id.
 */
async function loadTarget(
  admin: Admin,
  link: AlexaLink,
  productId: string,
  said: { quantity: number | null; unit: UnitType | null },
  requestId: string | null,
): Promise<VoiceTarget | null> {
  const products = await loadProducts(admin, link.householdId, [productId]);
  const product = products.get(productId);
  if (!product) return null;

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

  // Sin cantidad dicha, «quita yogur» es una unidad.
  return {
    link,
    productId,
    product,
    quantity: said.quantity ?? 1,
    unit: said.unit,
    lots,
    requestId,
  };
}

/**
 * Lo que cambia entre gastar y tirar: el descuento del inventario es idéntico,
 * pero la frase no. Se pasa junto para que el cuerpo de `runRestar` no tenga que
 * preguntarse cuál de las dos era en cada rama.
 *
 * `kind` es `consumed` en las dos **mientras la app no contabilice el
 * desperdicio** (ver f0b2404: se quitaron la racha, los euros tirados y la
 * pregunta «¿lo consumiste o lo tiraste?»). Escribir `discarded` que nadie lee
 * solo dejaba en el historial movimientos que la pantalla ya pinta como una baja
 * normal, con la voz y la app discrepando sin motivo. La distinción sigue viva
 * donde de verdad se nota —el verbo con el que se contesta— y volver a
 * contabilizarla es cambiar este campo, no rehacer el flujo.
 */
type RestarFlavor = {
  accion: "restar" | "tirar";
  kind: InventoryEventKind;
  verbo: string;
  done: (taken: string, name: string, left: string | null) => string;
  partial: (taken: string, name: string) => string;
};

const GASTADO: RestarFlavor = {
  accion: "restar",
  kind: "consumed",
  verbo: "quito",
  done: SPEECH.deducted,
  partial: SPEECH.deductedPartial,
};
const TIRADO: RestarFlavor = {
  accion: "tirar",
  kind: "consumed",
  verbo: "tiro",
  done: SPEECH.discarded,
  partial: SPEECH.discardedPartial,
};

/** Lo mismo para vaciar del todo: «se ha acabado» frente a «se ha estropeado». */
type AgotarFlavor = {
  accion: "agotar" | "estropear";
  kind: InventoryEventKind;
  ask: (name: string) => string;
};

const ACABADO: AgotarFlavor = {
  accion: "agotar",
  kind: "consumed",
  ask: SPEECH.emptiedAsk,
};
const ESTROPEADO: AgotarFlavor = {
  accion: "estropear",
  kind: "consumed",
  ask: SPEECH.spoiledAsk,
};

async function handleRestarStock(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
  flavor: RestarFlavor,
): Promise<AlexaResponse> {
  const prepared = await prepareVoiceTarget(admin, envelope, intent, flavor.accion);
  if (!prepared.ok) {
    return "notFound" in prepared
      ? speak(SPEECH.productUnknown(prepared.spoken))
      : prepared.response;
  }
  return runRestar(admin, prepared.target, flavor);
}

/**
 * El descuento en sí, ya con el producto decidido. Vive aparte del intent para
 * que se pueda RETOMAR: cuando el usuario resuelve una ambigüedad o dice la
 * unidad que faltaba, se vuelve aquí sin pasar por los slots.
 */
async function runRestar(
  admin: Admin,
  target: VoiceTarget,
  flavor: RestarFlavor,
): Promise<AlexaResponse> {
  const { link, productId, product, quantity, unit, lots } = target;
  const name = product.name;

  const plan = planDeduction({ quantity, unit, lots });
  switch (plan.kind) {
    case "invalid_quantity":
      return speak(SPEECH.quantityInvalid, {
        endSession: false,
        reprompt: SPEECH.fallbackReprompt,
      });
    case "no_stock":
      return offerToList(SPEECH.noStock(name), productId, name);
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
          flavor.verbo,
        ),
        {
          endSession: false,
          reprompt: SPEECH.askUnitReprompt(flavor.verbo),
          state: {
            pendiente: {
              tipo: "unidad",
              accion: flavor.accion,
              productId,
              name,
            },
          },
        },
      );
    case "deduct": {
      if (plan.steps.length === 0) {
        return offerToList(SPEECH.noStock(name), productId, name);
      }
      // Las cantidades previas se leen ANTES de tocar nada: `lots` es el estado
      // del inventario tal como estaba al empezar la orden.
      const previas = plan.steps.map((step) => ({
        id: step.lotId,
        quantity: lots.find((lot) => lot.id === step.lotId)?.quantity ?? null,
        after: step.newQuantity,
      }));
      const applied = await applySteps(admin, link, plan.steps);
      if (!applied) return speak(SPEECH.error);
      const events = await recordSteps(
        admin,
        link,
        productId,
        plan.steps,
        flavor.kind,
      );
      await recordUndo(admin, target, {
        productId,
        name,
        lots: previas,
        events,
      });

      // Quedarse a cero no es el final de la conversación, es el principio de la
      // siguiente: se ofrece apuntarlo, igual que al decir «se ha acabado».
      const taken = speakQuantity(plan.taken, plan.unit);
      if (!plan.covered) {
        return offerToList(flavor.partial(taken, name), productId, name);
      }
      if (plan.remaining > 0) {
        return speak(
          flavor.done(taken, name, speakQuantity(plan.remaining, plan.unit)),
        );
      }
      return offerToList(flavor.done(taken, name, null), productId, name);
    }
  }
}

async function handleSumarStock(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const prepared = await prepareVoiceTarget(admin, envelope, intent, "sumar");
  if (!prepared.ok) {
    return "notFound" in prepared
      ? speak(SPEECH.addProductUnknown(prepared.spoken))
      : prepared.response;
  }
  return runSumar(admin, prepared.target);
}

/** El alta en sí, ya con el producto decidido (ver {@link runRestar}). */
async function runSumar(
  admin: Admin,
  target: VoiceTarget,
): Promise<AlexaResponse> {
  const { link, productId, product, quantity, unit, lots } = target;
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
        reprompt: SPEECH.askUnitReprompt(verboDe("sumar")),
        state: {
          pendiente: { tipo: "unidad", accion: "sumar", productId, name },
        },
      });
    case "add": {
      // La caducidad no se toca a propósito: por voz no se puede dictar, así que
      // ni se inventa en las filas nuevas ni se pisa la de las existentes.
      //
      // `previa` es lo que hay que restaurar al deshacer: la cantidad anterior
      // del lote, o null cuando la fila la crea esta misma orden (y entonces
      // deshacer no es bajarla a cero, es que no exista).
      let lotId = plan.lotId;
      let previa: number | null = null;
      if (plan.lotId) {
        previa = lots.find((lot) => lot.id === plan.lotId)?.quantity ?? null;
        const { error } = await admin
          .from("inventory_items")
          .update({ quantity: plan.newQuantity, updated_by: link.userId })
          .eq("household_id", link.householdId)
          .eq("id", plan.lotId);
        if (error) return speak(SPEECH.error);
      } else {
        const { data: creado, error } = await admin
          .from("inventory_items")
          .insert({
            household_id: link.householdId,
            product_id: productId,
            location: plan.location,
            quantity: plan.newQuantity,
            unit: plan.unit,
            updated_by: link.userId,
          })
          .select("id")
          .single();
        if (error) return speak(SPEECH.error);
        lotId = creado?.id ?? null;
      }

      const eventId = await recordStockEvent(admin, {
        householdId: link.householdId,
        productId,
        quantity: plan.added,
        unit: plan.unit,
        kind: "restocked",
        userId: link.userId,
        fold: true,
      });
      await recordUndo(admin, target, {
        productId,
        name,
        lots: lotId
          ? [{ id: lotId, quantity: previa, after: plan.newQuantity }]
          : [],
        events: eventId ? [{ id: eventId, quantity: plan.added }] : [],
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
  return SPEECH.stockExpiringSoon(speakWhen(status.days));
}

async function handleConsultarStock(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const prepared = await prepareVoiceTarget(admin, envelope, intent, "consultar");
  if (!prepared.ok) {
    return "notFound" in prepared
      ? speak(SPEECH.productUnknown(prepared.spoken))
      : prepared.response;
  }
  return runConsultar(prepared.target);
}

/** La consulta en sí, ya con el producto decidido (ver {@link runRestar}). */
function runConsultar(target: VoiceTarget): AlexaResponse {
  const { productId, product, lots } = target;

  // Solo lectura: este intent no escribe nada en el inventario.
  const stock = summarizeStock(lots.filter((lot) => lot.quantity > 0));
  // Preguntar por algo que no queda es el momento exacto en que uno decide
  // comprarlo, así que se ofrece apuntarlo en vez de cerrar con la mala noticia.
  if (stock.length === 0) {
    return offerToList(SPEECH.stockEmpty(product.name), productId, product.name);
  }

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
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const link = linked.link;

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
  const said = {
    quantity: getSpokenQuantity(intent),
    unit: asUnitType(getSlotResolutionId(intent, "unidad")),
  };

  const [matchData] = await Promise.all([
    loadHouseholdMatchData(admin, link.householdId),
    touchLink(admin, link),
  ]);

  // A diferencia del inventario, aquí NO hace falta que el producto exista: la
  // lista admite texto libre (`product_id` es nullable), igual que al escribirlo
  // en la app. Enlazarlo cuando se reconoce sirve para el checkout y los avisos.
  const resolution = resolveProduct(spoken, matchData);

  if (resolution.kind === "ambiguous") {
    const products = await loadProducts(
      admin,
      link.householdId,
      resolution.productIds,
    );
    const candidatos = namedCandidates(resolution.productIds, products);
    if (candidatos.length > 0) {
      return askWhich(spoken, candidatos, "apuntar", said);
    }
  } else if (resolution.kind === "match") {
    const products = await loadProducts(admin, link.householdId, [
      resolution.productId,
    ]);
    const product = products.get(resolution.productId);
    if (product) {
      return runApuntar(
        admin,
        link,
        {
          productId: resolution.productId,
          name: product.name,
          normalized: normalizeName(spoken),
          defaultUnit: product.defaultUnit,
        },
        said,
      );
    }
  }

  // Texto libre: ni lo reconoce el catálogo ni había candidatos que ofrecer.
  return runApuntar(
    admin,
    link,
    {
      productId: null,
      name: capitalizar(spoken),
      normalized: normalizeName(spoken),
      defaultUnit: null,
    },
    said,
  );
}

/**
 * El apuntado en sí, ya decidido si va contra un producto del catálogo o es
 * texto libre. Aparte del intent para poder RETOMARLO cuando el usuario acaba de
 * elegir entre varios candidatos (ver {@link runRestar}).
 */
async function runApuntar(
  admin: Admin,
  link: AlexaLink,
  item: {
    productId: string | null;
    name: string;
    normalized: string;
    defaultUnit: UnitType | null;
  },
  said: { quantity: number | null; unit: UnitType | null },
): Promise<AlexaResponse> {
  const unit = said.unit ?? item.defaultUnit;
  const quantity = said.quantity ?? defaultListQuantity(unit);

  // Aviso de existencias: el sentido de la app es comprar lo justo, así que si
  // aún queda en casa merece decirlo en voz alta antes de que se compre doble.
  let warning = "";
  if (item.productId) {
    const { data: inv } = await admin
      .from("inventory_items")
      .select("quantity, unit")
      .eq("household_id", link.householdId)
      .eq("product_id", item.productId)
      .gt("quantity", 0);
    // Los lotes pueden estar en unidades distintas (500 g en despensa, 2 ud en
    // nevera): sumarlos a lo bruto diría «502 unidades». Un total por unidad,
    // como hace summarizeStock.
    const byUnit = new Map<UnitType, number>();
    for (const row of inv ?? []) {
      byUnit.set(row.unit, (byUnit.get(row.unit) ?? 0) + Number(row.quantity));
    }
    const parts = [...byUnit.entries()]
      .filter(([, total]) => total > 0)
      .map(([u, total]) => speakQuantity(roundQuantity(total), u));
    if (parts.length > 0) {
      warning = SPEECH.listStockWarning(parts.join(" y "));
    }
  }

  const resultado = await apuntarEnLista(admin, link, {
    productId: item.productId,
    name: item.name,
    normalized: item.normalized,
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
  const target = { listId, householdId: link.householdId };

  const merged = await mergeIntoExisting(
    admin,
    target,
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

  const position = await nextListPosition(admin, target);
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
 * Se registra por la cantidad que quedaba: si había dos panes y se acabaron, dos
 * panes se movieron, y el historial debe decirlo. Que se acabara gastándolo o
 * porque se puso malo solo cambia la frase, no el evento (ver `AgotarFlavor`).
 * Las filas se conservan a 0 (agotado), igual que en el resto de la app.
 */
async function handleAgotarStock(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
  flavor: AgotarFlavor,
): Promise<AlexaResponse> {
  const prepared = await prepareVoiceTarget(admin, envelope, intent, flavor.accion);
  if (!prepared.ok) {
    return "notFound" in prepared
      ? speak(SPEECH.productUnknown(prepared.spoken))
      : prepared.response;
  }
  return runAgotar(admin, prepared.target, flavor);
}

/** El vaciado en sí, ya con el producto decidido (ver {@link runRestar}). */
async function runAgotar(
  admin: Admin,
  target: VoiceTarget,
  flavor: AgotarFlavor,
): Promise<AlexaResponse> {
  const { link, productId, product, lots } = target;
  const conStock = lots.filter((lot) => lot.quantity > 0);

  const pendiente = pendingApuntar(productId, product.name);

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
  const events = await recordSteps(
    admin,
    link,
    productId,
    conStock.map((lot) => ({
      lotId: lot.id,
      newQuantity: 0,
      taken: lot.quantity,
      unit: lot.unit,
    })),
    flavor.kind,
  );
  await recordUndo(admin, target, {
    productId,
    name: product.name,
    lots: conStock.map((lot) => ({
      id: lot.id,
      quantity: lot.quantity,
      after: 0,
    })),
    events,
  });

  return speak(flavor.ask(product.name), {
    endSession: false,
    reprompt: SPEECH.emptiedAskReprompt,
    state: { pendiente },
  });
}

/**
 * Repite la pregunta que sigue abierta cuando lo que ha contestado el usuario no
 * sirve para responderla —un «sí» a un «¿cuál de ellas?»—. Conserva el
 * pendiente a propósito: la pregunta no se ha caído, solo no se ha entendido la
 * respuesta, y darla por perdida obligaría a repetir la orden entera.
 */
function askAgain(pendiente: PendingState): AlexaResponse {
  const state: SessionState = { pendiente };
  switch (pendiente.tipo) {
    case "apuntar":
      return speak(SPEECH.emptiedAskReprompt, {
        endSession: false,
        reprompt: SPEECH.emptiedAskReprompt,
        state,
      });
    case "descontar":
      return speak(SPEECH.cookedAskReprompt, {
        endSession: false,
        reprompt: SPEECH.cookedAskReprompt,
        state,
      });
    case "plato":
      return speak(
        SPEECH.cookedWhich(pendiente.candidatos.map((c) => c.name)),
        { endSession: false, reprompt: SPEECH.fallbackReprompt, state },
      );
    case "elegir":
      return speak(
        SPEECH.ambiguousRetry(
          pendiente.candidatos.map((candidate) => candidate.name),
        ),
        { endSession: false, reprompt: SPEECH.ambiguousReprompt, state },
      );
    case "unidad": {
      const pregunta = SPEECH.askUnitReprompt(verboDe(pendiente.accion));
      return speak(pregunta, {
        endSession: false,
        reprompt: pregunta,
        state,
      });
    }
  }
}

/** «Sí» a la pregunta de apuntar lo que se acaba de agotar. */
async function handleSi(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<AlexaResponse> {
  const pendiente = getPending(envelope);
  if (!pendiente) {
    return speak(SPEECH.nothingPending, {
      endSession: false,
      reprompt: SPEECH.fallbackReprompt,
    });
  }
  // Un «sí» solo confirma preguntas de sí o no: con un «¿cuál de ellas?» abierto
  // no hay nada que confirmar, así que se vuelve a preguntar.
  if (
    pendiente.tipo === "elegir" ||
    pendiente.tipo === "unidad" ||
    pendiente.tipo === "plato"
  ) {
    return askAgain(pendiente);
  }

  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const link = linked.link;

  if (pendiente.tipo === "descontar") {
    const descontados = await applyCookedDeductions(
      admin,
      link,
      pendiente.lines,
      pendiente.recipeName,
      envelope.request.requestId ?? null,
    );
    return speak(
      descontados > 0 ? SPEECH.cookedDeducted(descontados) : SPEECH.error,
    );
  }

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

/**
 * El candidato elegido, por nombre («el natural») o por posición («la primera»).
 *
 * El nombre se prueba ANTES que la posición hablada: si un producto se llamara
 * «Harina de primera», su nombre debe ganarle a la lectura de «primera» como
 * ordinal. El slot `orden` sí va primero porque ahí Alexa ya ha decidido que era
 * un ordinal y no hay nada que interpretar.
 */
function chooseCandidate(
  intent: AlexaIntent,
  candidatos: { id: string; name: string }[],
): { id: string; name: string } | null {
  const ordinal = getSlotOrdinal(intent, "orden");
  if (ordinal !== null) return candidatos[ordinal - 1] ?? null;

  const spoken = getSlotValue(intent, "producto");
  if (!spoken) return null;
  const porNombre = pickCandidate(spoken, candidatos);
  if (porNombre) return porNombre;

  const dicho = ordinalFromWord(spoken);
  return dicho === null ? null : (candidatos[dicho - 1] ?? null);
}

/**
 * Retoma la orden que se quedó a medias, ya con el producto resuelto. Es el
 * punto donde la conversación vuelve al carril: a partir de aquí se ejecuta
 * exactamente lo mismo que si el usuario lo hubiera dicho todo a la primera.
 */
async function resume(
  admin: Admin,
  link: AlexaLink,
  accion: VoiceAction,
  producto: { id: string; name: string },
  said: { quantity: number | null; unit: UnitType | null },
  requestId: string | null,
): Promise<AlexaResponse> {
  // La lista no necesita lotes ni existencias: va por otro camino desde el
  // principio (admite texto libre, no descuenta nada).
  if (accion === "apuntar") {
    const products = await loadProducts(admin, link.householdId, [producto.id]);
    const product = products.get(producto.id);
    if (!product) return speak(SPEECH.productUnknown(producto.name));
    return runApuntar(
      admin,
      link,
      {
        productId: producto.id,
        name: product.name,
        normalized: normalizeName(product.name),
        defaultUnit: product.defaultUnit,
      },
      said,
    );
  }

  const target = await loadTarget(admin, link, producto.id, said, requestId);
  if (!target) return speak(SPEECH.productUnknown(producto.name));
  switch (accion) {
    case "restar":
      return runRestar(admin, target, GASTADO);
    case "tirar":
      return runRestar(admin, target, TIRADO);
    case "sumar":
      return runSumar(admin, target);
    case "agotar":
      return runAgotar(admin, target, ACABADO);
    case "estropear":
      return runAgotar(admin, target, ESTROPEADO);
    case "consultar":
      return runConsultar(target);
  }
}

/**
 * La respuesta suelta a una pregunta abierta: «el natural», «la primera»,
 * «medio kilo». Es UN SOLO intent, y no uno por pregunta, porque sus muestras
 * son casi comodines («{producto}», «{cantidad} {unidad}») y dos comodines se
 * pelearían entre sí en el reconocedor de Alexa. Lo que significa la frase lo
 * decide lo que quedó pendiente en la sesión, no la frase.
 *
 * Sin nada pendiente no hace absolutamente nada: ese es el guardarraíl que hace
 * inofensivo que las muestras sean tan amplias.
 */
async function handleRespuesta(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const pendiente = getPending(envelope);
  if (!pendiente) {
    return speak(SPEECH.nothingPending, {
      endSession: false,
      reprompt: SPEECH.fallbackReprompt,
    });
  }
  // Una pregunta de sí o no no se contesta con un nombre ni con una cantidad.
  if (pendiente.tipo === "apuntar" || pendiente.tipo === "descontar") {
    return askAgain(pendiente);
  }

  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const link = linked.link;

  const requestId = envelope.request.requestId ?? null;
  if (pendiente.tipo === "plato") {
    const elegido = chooseCandidate(intent, pendiente.candidatos);
    const plato = pendiente.candidatos.find((c) => c.id === elegido?.id);
    if (!plato) return askAgain(pendiente);
    return markCooked(
      admin,
      link,
      { entryId: plato.id, name: plato.name, recipeId: plato.recipeId },
      pendiente.dia,
    );
  }
  if (pendiente.tipo === "elegir") {
    const elegido = chooseCandidate(intent, pendiente.candidatos);
    if (!elegido) return askAgain(pendiente);
    return resume(
      admin,
      link,
      pendiente.accion,
      elegido,
      { quantity: pendiente.cantidad, unit: pendiente.unidad },
      requestId,
    );
  }

  // Faltaba saber cuánto, y en qué. Sin las dos cosas no se puede seguir: la
  // unidad es justo el dato que no se puede adivinar (por eso se preguntó).
  const unit = asUnitType(getSlotResolutionId(intent, "unidad"));
  const quantity = getSpokenQuantity(intent);
  if (unit === null || quantity === null) return askAgain(pendiente);
  return resume(
    admin,
    link,
    pendiente.accion,
    { id: pendiente.productId, name: pendiente.name },
    { quantity, unit },
    requestId,
  );
}

/**
 * Hasta qué hora la noche sigue siendo del día anterior en la cocina. «Ya
 * hemos cenado» dicho a la 01:00 habla de la cena de ANOCHE, y con la fecha
 * del calendario marcaba la del día nuevo (que ni se había hecho) y descontaba
 * sus ingredientes.
 */
const KITCHEN_DAY_ROLLOVER_HOUR = 4;

/** El día del que habla quien dice «hemos cenado»: hoy, o ayer de madrugada. */
function kitchenDay(): string {
  const today = todayLocalISO();
  return hourInSpain() < KITCHEN_DAY_ROLLOVER_HOUR ? shiftDays(today, -1) : today;
}

/**
 * «Hemos cenado la lasaña»: marca el plato de hoy como cocinado y, si tiene
 * receta, ofrece descontar sus ingredientes.
 *
 * Se busca solo entre los platos de HOY, no en todo el recetario: si lo dices es
 * casi siempre el día que lo tenías planificado, y limitarlo así evita el
 * problema distinto de haber cocinado algo que no estaba en el menú (que
 * exigiría crear entradas por voz). Sin plato dicho, «hemos cenado» resuelve la
 * cena de hoy si hay una sola.
 */
async function handleCocinado(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const link = linked.link;

  const hueco = asMealSlot(getSlotResolutionId(intent, "comida"));
  const dia = kitchenDay();
  const [platos] = await Promise.all([
    readTodayDishes(admin, link.householdId, hueco, dia),
    touchLink(admin, link),
  ]);
  if (platos.length === 0) return speak(SPEECH.cookedNoDish);

  const dicho = getSlotValue(intent, "plato");
  // Sin nombre, solo se resuelve si no hay ambigüedad posible: dar por cocinado
  // el plato equivocado descuenta ingredientes de una receta que no era.
  const plato = dicho
    ? pickCandidate(dicho, platos)
    : platos.length === 1
      ? platos[0]
      : null;
  if (!plato) {
    if (dicho) return speak(SPEECH.cookedNoDish);
    // La pregunta queda PENDIENTE: la respuesta suelta («la lasaña», «la
    // segunda») la recoge `handleRespuesta`.
    return askAgain({
      tipo: "plato",
      dia,
      candidatos: platos.map((p) => ({
        id: p.entryId,
        name: p.name,
        recipeId: p.recipeId,
      })),
    });
  }
  if (plato.cookedAt) return speak(SPEECH.cookedAlready(plato.name));
  return markCooked(admin, link, plato, dia);
}

/**
 * Marca el plato como cocinado y, si tiene receta, ofrece el descuento. Lo
 * comparten «hemos cenado la lasaña» y la respuesta a «¿cuál has hecho?».
 */
async function markCooked(
  admin: Admin,
  link: AlexaLink,
  plato: { entryId: string; name: string; recipeId: string | null },
  dia: string,
): Promise<AlexaResponse> {
  // Marcar cocinado va primero y sin preguntar: es reversible desde la app y no
  // toca existencias. `skipped_at` se limpia porque las dos marcas se excluyen,
  // y con él su motivo: la base no admite un motivo sin descarte, así que sin
  // esta línea decir «ya lo cociné» por voz fallaría —contestando el error
  // genérico— justo en los platos que alguien había descartado con motivo.
  // Condicionada a que siga sin cocinar: entre «¿cuál has hecho?» y la
  // respuesta pudo marcarlo alguien desde la app, y volver a ofrecer el
  // descuento restaría los ingredientes dos veces.
  const { data: marcadas, error } = await admin
    .from("menu_entries")
    .update({
      cooked_at: dia,
      skipped_at: null,
      skipped_reason: null,
    })
    .eq("household_id", link.householdId)
    .eq("id", plato.entryId)
    .is("cooked_at", null)
    .select("id");
  if (error) return speak(SPEECH.error);
  if (!marcadas || marcadas.length === 0) {
    return speak(SPEECH.cookedAlready(plato.name));
  }

  if (!plato.recipeId) return speak(SPEECH.cookedNoRecipe(plato.name));

  const plan = await planCooked(admin, link.householdId, plato.recipeId);
  if (plan.lines.length === 0) return speak(SPEECH.cookedNothing(plato.name));

  return speak(
    SPEECH.cookedAsk(
      plato.name,
      plan.lines.length + plan.skipped,
      plan.lines.length,
    ),
    {
      endSession: false,
      reprompt: SPEECH.cookedAskReprompt,
      state: {
        pendiente: {
          tipo: "descontar",
          recipeName: plato.name,
          lines: plan.lines,
        },
      },
    },
  );
}

/**
 * Descuenta los ingredientes confirmados, producto a producto y con el mismo
 * FIFO por caducidad que el resto de la skill (`planDeduction`), en vez de
 * repetir esa lógica aquí. Devuelve cuántos se descontaron de verdad y deja la
 * orden lista para deshacerse de una sola vez.
 */
async function applyCookedDeductions(
  admin: Admin,
  link: AlexaLink,
  lines: {
    productId: string;
    productName: string;
    unit: UnitType;
    quantity: number;
  }[],
  recipeName: string,
  requestId: string | null,
): Promise<number> {
  const undoLots: UndoPlan["lots"] = [];
  const undoEvents: UndoEvent[] = [];
  let descontados = 0;

  for (const line of lines) {
    const { data: rows } = await admin
      .from("inventory_items")
      .select("id, quantity, unit, location, expiry_date")
      .eq("household_id", link.householdId)
      .eq("product_id", line.productId)
      .order("expiry_date", { ascending: true, nullsFirst: false });
    const lots: StockLot[] = (rows ?? []).map((row) => ({
      id: row.id,
      quantity: Number(row.quantity),
      unit: row.unit,
      location: row.location,
      expiryDate: row.expiry_date,
    }));

    const plan = planDeduction({
      quantity: line.quantity,
      unit: line.unit,
      lots,
    });
    if (plan.kind !== "deduct" || plan.steps.length === 0) continue;

    for (const step of plan.steps) {
      undoLots.push({
        id: step.lotId,
        quantity: lots.find((lot) => lot.id === step.lotId)?.quantity ?? null,
        after: step.newQuantity,
      });
    }
    if (!(await applySteps(admin, link, plan.steps))) continue;
    undoEvents.push(
      ...(await recordSteps(
        admin,
        link,
        line.productId,
        plan.steps,
        "consumed",
      )),
    );
    descontados += 1;
  }

  // Un solo plan para toda la receta: «deshaz» revierte los ingredientes de
  // golpe, que es como se cocinaron.
  if (undoLots.length > 0 && requestId) {
    await admin
      .from("alexa_requests")
      .update({
        link_id: link.id,
        undo: {
          name: recipeName,
          lots: undoLots,
          events: undoEvents,
        } satisfies UndoPlan,
      })
      .eq("request_id", requestId);
  }
  return descontados;
}

/**
 * Cuánto hacia atrás se puede deshacer. Corto a propósito: «deshaz» dicho media
 * hora después casi nunca se refiere a lo que el servidor cree, y revertir por
 * sorpresa un movimiento que ya diste por bueno es peor que no deshacer nada.
 */
const UNDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * Descuenta del historial lo que la orden le sumó. No se borra el evento sin
 * más: con el agrupado (`fold`), esa misma fila puede llevar movimientos
 * anteriores que nadie ha pedido deshacer. Solo desaparece si se queda a cero.
 */
async function revertEvents(
  admin: Admin,
  link: AlexaLink,
  events: UndoEvent[],
): Promise<void> {
  for (const event of events) {
    const { data } = await admin
      .from("inventory_events")
      .select("quantity")
      .eq("household_id", link.householdId)
      .eq("id", event.id)
      .maybeSingle();
    if (!data) continue;
    const resto = roundQuantity(Number(data.quantity) - event.quantity);
    if (resto > 0) {
      await admin
        .from("inventory_events")
        .update({ quantity: resto })
        .eq("household_id", link.householdId)
        .eq("id", event.id);
    } else {
      await admin
        .from("inventory_events")
        .delete()
        .eq("household_id", link.householdId)
        .eq("id", event.id);
    }
  }
}

type RevertibleLot = { id: string; quantity: number | null; after: number };

/**
 * Deshace lo que la orden le hizo a un lote sumando la diferencia sobre lo que
 * haya AHORA (condicionado a esa lectura, con reintentos, como el stepper).
 * Una fila que creó la orden solo se borra si sigue exactamente como la dejó;
 * si después entró más, se le resta lo de la orden y se queda. Devuelve false
 * solo ante un error de la base.
 */
async function revertLot(
  admin: Admin,
  link: AlexaLink,
  lot: RevertibleLot,
): Promise<boolean> {
  const delta = (lot.quantity ?? 0) - lot.after;
  for (let intento = 0; intento < 3; intento++) {
    const { data: row, error: readErr } = await admin
      .from("inventory_items")
      .select("quantity")
      .eq("household_id", link.householdId)
      .eq("id", lot.id)
      .maybeSingle();
    if (readErr) return false;
    if (!row) return true; // ya no existe: nada que devolver
    const actual = Number(row.quantity);
    const nueva = Math.max(0, roundQuantity(actual + delta));
    const q =
      lot.quantity === null && nueva === 0
        ? admin
            .from("inventory_items")
            .delete()
            .eq("household_id", link.householdId)
            .eq("id", lot.id)
            .eq("quantity", row.quantity)
            .select("id")
        : admin
            .from("inventory_items")
            .update({ quantity: nueva, updated_by: link.userId })
            .eq("household_id", link.householdId)
            .eq("id", lot.id)
            .eq("quantity", row.quantity)
            .select("id");
    const { data: tocadas, error } = await q;
    if (error) return false;
    if (tocadas && tocadas.length > 0) return true;
  }
  return false;
}

/**
 * «Deshaz lo último»: devuelve el inventario a como estaba antes de la última
 * orden dictada por ESTE altavoz. Es la red de seguridad que faltaba — si Alexa
 * entiende «doce» en vez de «dos», hasta ahora la única salida era abrir el
 * móvil.
 *
 * Solo se deshace **la última** orden y **una sola vez**. Encadenar deshaceres
 * por voz, sin una pantalla que enseñe por dónde vas, es la forma más rápida de
 * dejar el inventario peor que al empezar.
 */
async function handleDeshacer(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<AlexaResponse> {
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const link = linked.link;

  const [{ data: row }] = await Promise.all([
    admin
      .from("alexa_requests")
      .select("request_id, undo, undone_at")
      .eq("link_id", link.id)
      // La última orden, tenga plan o no (una sin plan no se puede deshacer,
      // y eso es lo que hay que contestar). Sin contar este mismo «deshaz».
      .neq("request_id", envelope.request.requestId ?? "")
      .gte("created_at", new Date(Date.now() - UNDO_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    touchLink(admin, link),
  ]);
  if (!row) return speak(SPEECH.nothingToUndo);
  if (row.undone_at) return speak(SPEECH.alreadyUndone);
  if (row.undo === null) return speak(SPEECH.nothingToUndo);

  const plan = storedUndo(row.undo);
  if (!plan) return speak(SPEECH.nothingToUndo);

  for (const lot of plan.lots) {
    if (lot.after !== undefined) {
      if (!(await revertLot(admin, link, lot as RevertibleLot))) {
        return speak(SPEECH.error);
      }
      continue;
    }
    // Plan antiguo, sin `after`: se restaura el absoluto como antes.
    // Sin cantidad previa, la fila la creó la propia orden: deshacerla no es
    // dejarla a cero (eso sería un «agotado» que nunca existió), es borrarla.
    const { error } =
      lot.quantity === null
        ? await admin
            .from("inventory_items")
            .delete()
            .eq("household_id", link.householdId)
            .eq("id", lot.id)
        : await admin
            .from("inventory_items")
            .update({ quantity: lot.quantity, updated_by: link.userId })
            .eq("household_id", link.householdId)
            .eq("id", lot.id);
    if (error) return speak(SPEECH.error);
  }
  await revertEvents(admin, link, plan.events);

  await admin
    .from("alexa_requests")
    .update({ undone_at: new Date().toISOString() })
    .eq("request_id", row.request_id);

  return speak(SPEECH.undone(plan.name));
}

type ListItem = { id: string; name: string; isChecked: boolean };

/**
 * Localiza en la lista activa el artículo del que habla el usuario, o devuelve
 * ya la respuesta hablada cuando no hay nada que hacer. Lo comparten tachar y
 * borrar, que solo se diferencian en lo que hacen DESPUÉS.
 *
 * El emparejado se hace contra LA LISTA y no contra el catálogo, y es lo
 * correcto aunque parezca un atajo: la lista admite texto libre sin producto
 * detrás, así que un artículo puede no estar en el catálogo y aun así estar ahí
 * esperando. Se casa por nombre con las mismas reglas que al elegir candidatos.
 */
async function findListItem(
  admin: Admin,
  link: AlexaLink,
  spoken: string,
): Promise<
  | { ok: true; item: ListItem; items: ListItem[] }
  | { ok: false; response: AlexaResponse }
> {
  const [{ data: list }] = await Promise.all([
    admin
      .from("shopping_lists")
      .select("id")
      .eq("household_id", link.householdId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    touchLink(admin, link),
  ]);
  const noEncontrado = {
    ok: false as const,
    response: speak(SPEECH.listItemUnknown(spoken)),
  };
  if (!list) return noEncontrado;

  const { data: rows } = await admin
    .from("shopping_list_items")
    .select("id, name, is_checked, product:products(name)")
    .eq("household_id", link.householdId)
    .eq("list_id", list.id);

  // El doble `as unknown as` es la costumbre del repo con este embed: los tipos
  // de Supabase están escritos a mano y no declaran la relación, aunque en la
  // base exista (la misma consulta la hace `getListItems`).
  const items: ListItem[] = (rows ?? []).map((row) => ({
    id: row.id,
    name: (row.product as unknown as { name: string } | null)?.name ?? row.name,
    isChecked: row.is_checked,
  }));
  if (items.length === 0) return noEncontrado;

  const elegido = pickCandidate(spoken, items);
  if (elegido) return { ok: true, item: elegido, items };

  // Se distingue «no está» de «hay varios parecidos»: con lo segundo, repetir
  // con el nombre completo sí sirve de algo, y soltar «no lo encuentro» sobre
  // algo que SÍ está apuntado es lo que hace desconfiar de la skill.
  const parecidos = items.filter(
    (item) => pickCandidate(spoken, [item]) !== null,
  );
  if (parecidos.length <= 1) return noEncontrado;
  return {
    ok: false,
    response: speak(
      SPEECH.listItemAmbiguous(parecidos.map((item) => item.name)),
    ),
  };
}

/** El artículo dicho, o la respuesta de por qué no se puede seguir. */
async function prepareListItem(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<
  | { ok: true; link: AlexaLink; item: ListItem; items: ListItem[] }
  | { ok: false; response: AlexaResponse }
> {
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked;

  const spoken = getSlotValue(intent, "producto");
  if (!spoken) {
    return {
      ok: false,
      response: speak(SPEECH.listMissing, {
        endSession: false,
        reprompt: SPEECH.fallbackReprompt,
      }),
    };
  }

  const found = await findListItem(admin, linked.link, spoken);
  if (!found.ok) return found;
  return { ok: true, link: linked.link, item: found.item, items: found.items };
}

/**
 * «Ya he comprado el pan»: tacha el artículo, sin tocar existencias. Es lo mismo
 * que pulsarlo en la app — el stock entra al finalizar la compra, y sumarlo aquí
 * lo contaría dos veces.
 */
async function handleMarcarComprado(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const prepared = await prepareListItem(admin, envelope, intent);
  if (!prepared.ok) return prepared.response;
  const { link, item, items } = prepared;

  if (item.isChecked) return speak(SPEECH.listAlreadyChecked(item.name));

  const { error } = await admin
    .from("shopping_list_items")
    .update({
      is_checked: true,
      checked_by: link.userId,
      checked_at: new Date().toISOString(),
    })
    .eq("household_id", link.householdId)
    .eq("id", item.id);
  if (error) return speak(SPEECH.error);

  const quedaban = items.filter((i) => !i.isChecked).length;
  return speak(
    quedaban === 1
      ? SPEECH.listCheckedLast(item.name)
      : SPEECH.listChecked(item.name),
  );
}

/**
 * «Quita el pan de la lista»: lo BORRA, que no es lo mismo que tacharlo.
 *
 * La diferencia importa de verdad y no es cosmética: al finalizar la compra,
 * todo lo tachado se da de alta en el inventario. Tachar lo que en realidad ya
 * no quieres te metería en casa un pan que nunca compraste, y ese stock fantasma
 * se arrastra luego al histórico de precios y a los avisos.
 *
 * Se borra sin pedir confirmación, igual que en la app, pero aquí no hay
 * deshacer: la red es repetir el nombre completo en la respuesta —para que un
 * error se oiga al instante— y no borrar nada cuando hay varios parecidos.
 */
async function handleBorrarDeLista(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const prepared = await prepareListItem(admin, envelope, intent);
  if (!prepared.ok) return prepared.response;
  const { link, item } = prepared;

  // Lo marcado ya está en el carro y es lo que «Finalizar compra» pasa al
  // inventario: borrarlo por voz perdía esa compra sin rastro. La app lo
  // prohíbe igual (`removeProductFromListAction`), y la escritura lo vuelve a
  // exigir por si alguien lo marcó entre la lectura y el borrado.
  if (item.isChecked) return speak(SPEECH.listDeleteChecked(item.name));

  const { data: borradas, error } = await admin
    .from("shopping_list_items")
    .delete()
    .eq("household_id", link.householdId)
    .eq("id", item.id)
    .eq("is_checked", false)
    .select("id");
  if (error) return speak(SPEECH.error);
  if (!borradas || borradas.length === 0) {
    return speak(SPEECH.listDeleteChecked(item.name));
  }

  return speak(SPEECH.listDeleted(item.name));
}

/**
 * Cuántos artículos se recitan antes de remitir a la app. Por voz no se retiene
 * una lista de veinte cosas, y quien necesita la lista entera la quiere en la
 * mano, no en el aire. El de caducidades es más corto porque cada línea lleva
 * además su fecha.
 */
const SPOKEN_LIST_MAX = 8;
const SPOKEN_EXPIRY_MAX = 5;

/**
 * Enumera hasta `max` dentro de `frase` y, si se ha cortado, añade el «y N cosas
 * más» DESPUÉS. Va fuera y no dentro de la enumeración porque es otra frase: si
 * se cuela dentro, el punto de `frase` acaba detrás del añadido.
 */
function speakSome(
  items: string[],
  max: number,
  frase: (items: string) => string,
): string {
  const rest = items.length - max;
  return frase(speakList(items.slice(0, max))) + (rest > 0 ? SPEECH.andMore(rest) : "");
}

/** «¿Qué hay en la lista?» — solo lectura, y no crea lista si no hay. */
async function handleLeerLista(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<AlexaResponse> {
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const link = linked.link;

  const [items] = await Promise.all([
    readShoppingList(admin, link.householdId),
    touchLink(admin, link),
  ]);
  if (items.length === 0) return speak(SPEECH.listEmpty);
  return speak(speakSome(items, SPOKEN_LIST_MAX, SPEECH.listReport));
}

/** «¿Qué caduca?» — la misma ventana que el resumen diario por push. */
async function handleCaducidades(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<AlexaResponse> {
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const link = linked.link;

  const [items] = await Promise.all([
    readExpiring(admin, link.householdId, EXPIRY_WARN_DAYS),
    touchLink(admin, link),
  ]);
  if (items.length === 0) return speak(SPEECH.expiryNone);
  return speak(
    speakSome(
      items.map((item) => `${item.name} ${speakDue(item.days)}`),
      SPOKEN_EXPIRY_MAX,
      SPEECH.expiryReport,
    ),
  );
}

/** «¿Qué hay de cena?» — lo planificado para hoy, entero o de un solo hueco. */
async function handleMenuHoy(
  admin: Admin,
  envelope: AlexaEnvelope,
  intent: AlexaIntent,
): Promise<AlexaResponse> {
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const link = linked.link;

  const only = asMealSlot(getSlotResolutionId(intent, "comida"));
  const [huecos] = await Promise.all([
    readTodayMenu(admin, link.householdId, only),
    touchLink(admin, link),
  ]);
  if (huecos.length === 0) return speak(SPEECH.menuNone);
  return speak(
    SPEECH.menuReport(
      speakList(
        huecos.map((hueco) => SPEECH.menuPart(hueco.label, speakList(hueco.names))),
      ),
    ),
  );
}

/**
 * Bienvenida al abrir la skill. Se aprovecha para decir lo urgente —lo que
 * caduca y lo que hay apuntado— porque es el único momento en que el usuario
 * está escuchando de verdad; si no hay nada que avisar, el saludo de siempre.
 *
 * Sin vínculo se explica cómo vincular, con la tarjeta en el móvil: soltar el
 * saludo genérico solo retrasaría el tropiezo a la primera orden.
 */
async function handleLaunch(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<AlexaResponse> {
  const linked = await requireLink(admin, envelope);
  if (!linked.ok) return linked.response;
  const { householdId } = linked.link;

  const [caducan, lista] = await Promise.all([
    readExpiring(admin, householdId, EXPIRY_WARN_DAYS),
    readShoppingList(admin, householdId),
  ]);
  const avisos = [
    caducan.length > 0 ? SPEECH.expiryHeadline(caducan.length) : null,
    lista.length > 0 ? SPEECH.listHeadline(lista.length) : null,
  ].filter((aviso): aviso is string => aviso !== null);

  return speak(
    avisos.length > 0
      ? SPEECH.welcomeWithContext(avisos.join(" "))
      : SPEECH.welcome,
    {
      endSession: false,
      reprompt: SPEECH.welcomeReprompt,
      // Abrir la skill es lo que enciende el modo conversación: a partir de aquí
      // las confirmaciones encadenan con «¿Algo más?» (ver `applySessionMode`).
      state: { conversacion: true },
    },
  );
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

  // Un código generado justo antes de salir del hogar (o de una expulsión)
  // sobreviviría a la limpieza si nadie lo re-comprueba: el canje solo vale si
  // quien lo generó sigue siendo miembro. Se trata como código inválido, sin
  // revelar el porqué.
  const { data: stillMember } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", found.household_id)
    .eq("user_id", found.user_id)
    .maybeSingle();
  if (!stillMember) {
    await admin.from("alexa_link_codes").delete().eq("code", code);
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

/**
 * Respuestas que CIERRAN la sesión aunque estemos en modo conversación. Tras un
 * fallo, dejar el micrófono abierto invita a repetir la orden, que es justo lo
 * que la idempotencia viene a evitar; y a una despedida no se le pega un «¿algo
 * más?». Lo demás sí encadena.
 */
const CLOSING_SPEECH: readonly string[] = [
  SPEECH.stop,
  SPEECH.error,
  SPEECH.slowRetry,
  SPEECH.notLinked,
  SPEECH.linkCodeInvalid,
  SPEECH.linkRateLimited,
];

/**
 * Encadena órdenes cuando el usuario ABRIÓ la skill: en lugar de cerrar tras
 * cada confirmación, se remata con «¿Algo más?» y el micrófono sigue abierto.
 * Es lo que convierte deshacer la compra en una conversación en vez de en diez
 * invocaciones seguidas de «Alexa, dile a mi despensa que…».
 *
 * Va en un único sitio, y no respuesta a respuesta, para que ningún intent pueda
 * olvidarse. A las órdenes de una tacada no las toca: quien dice «dile a mi
 * despensa que reste dos yogures» quiere despachar y marcharse.
 */
function applySessionMode(
  envelope: AlexaEnvelope,
  response: AlexaResponse,
): AlexaResponse {
  if (!isConversationMode(envelope)) return response;

  const text = response.response.outputSpeech?.text;
  // Sin voz (SessionEnded) o con una respuesta de cierre, el modo se va con la
  // sesión: no se propaga la marca.
  if (text === undefined || CLOSING_SPEECH.includes(text)) return response;

  const sessionAttributes: SessionState = {
    ...response.sessionAttributes,
    conversacion: true,
  };
  // Las respuestas que ya dejan la sesión abierta traen su propia pregunta;
  // añadirles «¿algo más?» sería preguntar dos cosas a la vez.
  if (!response.response.shouldEndSession) {
    return { ...response, sessionAttributes };
  }
  return {
    ...response,
    sessionAttributes,
    response: {
      ...response.response,
      outputSpeech: { type: "PlainText", text: `${text} ${SPEECH.anythingElse}` },
      reprompt: {
        outputSpeech: { type: "PlainText", text: SPEECH.anythingElseReprompt },
      },
      shouldEndSession: false,
    },
  };
}

async function handleIntent(
  admin: Admin,
  envelope: AlexaEnvelope,
): Promise<AlexaResponse> {
  return applySessionMode(envelope, await routeIntent(admin, envelope));
}

async function routeIntent(
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
      return handleRestarStock(admin, envelope, intent, GASTADO);
    case "TirarStockIntent":
      return handleRestarStock(admin, envelope, intent, TIRADO);
    case "SumarStockIntent":
      return handleSumarStock(admin, envelope, intent);
    case "ApuntarListaIntent":
      return handleApuntarLista(admin, envelope, intent);
    case "MarcarCompradoIntent":
      return handleMarcarComprado(admin, envelope, intent);
    case "BorrarDeListaIntent":
      return handleBorrarDeLista(admin, envelope, intent);
    case "DeshacerIntent":
      return handleDeshacer(admin, envelope);
    case "ConsultarStockIntent":
      return handleConsultarStock(admin, envelope, intent);
    case "AgotarStockIntent":
      return handleAgotarStock(admin, envelope, intent, ACABADO);
    case "EstropearStockIntent":
      return handleAgotarStock(admin, envelope, intent, ESTROPEADO);
    case "LeerListaIntent":
      return handleLeerLista(admin, envelope);
    case "CaducidadesIntent":
      return handleCaducidades(admin, envelope);
    case "MenuHoyIntent":
      return handleMenuHoy(admin, envelope, intent);
    case "CocinadoIntent":
      return handleCocinado(admin, envelope, intent);
    case "AMAZON.YesIntent":
      return handleSi(admin, envelope);
    case "AMAZON.NoIntent": {
      // Un «no» cancela lo que hubiera pendiente (no se devuelve el estado, así
      // que la pregunta muere aquí). Sin nada pendiente es tan inofensivo como
      // un «vale»: se cierra.
      const pendiente = getPending(envelope);
      if (!pendiente) return speak(SPEECH.stop);
      return speak(
        pendiente.tipo === "descontar" ? SPEECH.cookedKept : SPEECH.emptiedNo,
      );
    }
    case "RespuestaIntent":
      return handleRespuesta(admin, envelope, intent);
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
  "TirarStockIntent",
  "SumarStockIntent",
  "ApuntarListaIntent",
  "MarcarCompradoIntent",
  "BorrarDeListaIntent",
  "AgotarStockIntent",
  "EstropearStockIntent",
  // Marca la entrada del menú como cocinada; el descuento viene después, con el
  // «sí», que también está protegido.
  "CocinadoIntent",
  // Deshacer escribe tanto como lo que deshace. Su propia fila queda con `undo`
  // a null, así que nunca se encuentra a sí misma como «lo último deshacible».
  "DeshacerIntent",
  "AMAZON.YesIntent",
  "VincularIntent",
  // Retoma una orden interrumpida, así que hereda lo que escribiera aquella: un
  // «el natural» puede acabar restando dos yogures. Se protege siempre, aunque a
  // veces solo consulte, porque desde aquí no se sabe cuál de las dos era.
  "RespuestaIntent",
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
        return await handleLaunch(admin, envelope);
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
