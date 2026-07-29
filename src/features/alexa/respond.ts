import type { UnitType } from "@/lib/supabase/types";
import { formatQuantityValue } from "@/lib/units";

/**
 * Construcción de las respuestas de voz. Todo el texto que suena por el altavoz
 * vive aquí, por el mismo motivo que la UI no lleva literales sueltos: leer de
 * corrido lo que dice la skill es la única forma de que suene a persona y no a
 * volcado de base de datos.
 */

export type AlexaResponse = {
  version: "1.0";
  response: {
    outputSpeech?: { type: "PlainText"; text: string };
    reprompt?: { outputSpeech: { type: "PlainText"; text: string } };
    shouldEndSession: boolean;
  };
};

/**
 * Respuesta hablada. `endSession: false` deja el micrófono abierto para que el
 * usuario conteste sin repetir «Alexa, dile a mi despensa…»; en ese caso Amazon
 * exige un reprompt (si el usuario calla, lo repite y cierra).
 */
export function speak(
  text: string,
  { endSession = true, reprompt }: { endSession?: boolean; reprompt?: string } = {},
): AlexaResponse {
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      ...(reprompt
        ? { reprompt: { outputSpeech: { type: "PlainText", text: reprompt } } }
        : {}),
      shouldEndSession: endSession,
    },
  };
}

/**
 * Respuesta sin voz, para `SessionEndedRequest` y los tipos que no manejamos.
 * Alexa prohíbe hablar al cerrar la sesión: hacerlo provoca un error en el
 * dispositivo.
 */
export function emptyResponse(): AlexaResponse {
  return { version: "1.0", response: { shouldEndSession: true } };
}

/**
 * Unidades DICHAS, no abreviadas: `UNIT_LABELS` sirve para la pantalla ("2 ud")
 * pero por voz hay que decir "2 unidades". Singular y plural porque "1 unidades"
 * delata a la máquina.
 */
const SPOKEN_UNITS: Record<UnitType, { one: string; many: string }> = {
  ud: { one: "unidad", many: "unidades" },
  g: { one: "gramo", many: "gramos" },
  kg: { one: "kilo", many: "kilos" },
  ml: { one: "mililitro", many: "mililitros" },
  l: { one: "litro", many: "litros" },
};

/** Cantidad con su unidad, tal como se pronuncia: «2 unidades», «1,5 kilos». */
export function speakQuantity(quantity: number, unit: UnitType): string {
  const spoken = SPOKEN_UNITS[unit];
  const label = quantity === 1 ? spoken.one : spoken.many;
  return `${formatQuantityValue(quantity)} ${label}`;
}

/** Nombre de la unidad sin cantidad delante: «unidades», «kilos». */
export function speakUnit(unit: UnitType): string {
  return SPOKEN_UNITS[unit].many;
}

/**
 * Cantidad de un artículo de la lista, o null cuando no aporta nada: al apuntar
 * algo, «una unidad» es lo que se sobreentiende («apuntado: pan» se lee mucho
 * mejor que «apuntado: 1 unidad de pan»). La falta de unidad cuenta como piezas,
 * el mismo criterio que `defaultListQuantity`.
 */
export function speakListQuantity(
  quantity: number | null,
  unit: UnitType | null,
): string | null {
  if (quantity === null) return null;
  const effective = unit ?? "ud";
  if (quantity === 1 && effective === "ud") return null;
  return speakQuantity(quantity, effective);
}

/** Enumeración natural en español: «A, B y C». */
export function speakList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const EXAMPLE = "resta dos yogures";

export const SPEECH = {
  welcome: `Hola. Dime qué gastas o qué traes y lo apunto en el inventario. Por ejemplo: ${EXAMPLE}.`,
  welcomeReprompt: `¿Qué apunto? Por ejemplo: ${EXAMPLE}.`,
  help:
    "Puedo restar lo que gastes, sumar lo que traigas, apuntar en la lista de la " +
    "compra y decirte cuánto queda. Di, por ejemplo: quita dos yogures, añade " +
    "tres leches, apunta pan, o cuánta leche queda. Si este altavoz todavía no " +
    "está vinculado, genera un código en el perfil de Fill Good y dime: vincula " +
    "con código, y los seis dígitos.",
  helpReprompt: `¿Qué apunto? Por ejemplo: ${EXAMPLE}.`,
  stop: "Hasta luego.",
  fallback: `No te he entendido. Prueba a decir: ${EXAMPLE}.`,
  fallbackReprompt: `¿Qué apunto? Por ejemplo: ${EXAMPLE}.`,
  error: "Ha habido un problema con tu despensa. Inténtalo otra vez en un momento.",
  notLinked:
    "Este altavoz todavía no está vinculado a ningún hogar. Abre Fill Good, " +
    "entra en Perfil, genera un código de Alexa y dime: vincula con código, " +
    "seguido de los seis dígitos.",
  linkCodeMissing:
    "Dime el código de seis dígitos que te da Fill Good en la pantalla de Perfil.",
  linkCodeInvalid:
    "Ese código no vale o ya ha caducado. Genera uno nuevo en el perfil de Fill " +
    "Good y vuelve a decírmelo.",
  linkRateLimited:
    "Has probado demasiados códigos seguidos. Espera unos minutos y vuelve a " +
    "intentarlo.",
  linked: (householdName: string) =>
    `Listo, este altavoz ya está vinculado con ${householdName}. Prueba a decir: ${EXAMPLE}.`,
  productMissing: "No he entendido qué producto quitar.",
  productUnknown: (spoken: string) =>
    `No encuentro ${spoken} en tu inventario. Añádelo primero en Fill Good.`,
  ambiguous: (spoken: string, names: string[]) =>
    `Tengo varias cosas que se parecen a ${spoken}: ${speakList(names)}. ` +
    "Repite la orden con el nombre completo.",
  ambiguousReprompt: "¿Cuál de ellos quito?",
  quantityInvalid: "Dime una cantidad que pueda restar, por ejemplo: dos.",
  noStock: (name: string) => `No te queda ${name} en el inventario.`,
  unitMismatch: (name: string, available: string, asked: string) =>
    `Tengo ${name} en ${available}, no en ${asked}. Dime cuánto quito en ${available}.`,
  askUnit: (name: string, stock: string) =>
    `Tienes ${stock} de ${name}. Dime cuánto quito con su unidad, por ejemplo: ` +
    "quita medio kilo.",
  askUnitReprompt: "¿Cuánto quito, y en qué unidad?",
  // Ojo con la concordancia: «te quedan 1 unidad» y «solo quedaba 4 unidades»
  // suenan a robot. Se usa el impersonal («hay», «había»), que en español no
  // cambia con el número, así que vale igual para 1 que para 4.
  deducted: (taken: string, name: string, left: string | null) =>
    left === null
      ? `Vale, he quitado ${taken} de ${name}. Ya no queda nada.`
      : `Vale, he quitado ${taken} de ${name}. Ahora hay ${left}.`,
  deductedPartial: (taken: string, name: string) =>
    `Solo había ${taken} de ${name}, así que lo he quitado todo. Ya no queda nada.`,
  added: (added: string, name: string, total: string) =>
    `Hecho, he añadido ${added} de ${name}. Ahora hay ${total}.`,
  // Al sumar NO se crea el producto: por voz no hay forma de revisar el nombre
  // antes de guardarlo, y una transcripción torcida ensuciaría el catálogo, que
  // es lo que sostiene el emparejado de tickets y el histórico de precios.
  addProductUnknown: (spoken: string) =>
    `No tengo ${spoken} en tu catálogo. Créalo primero en Fill Good y luego ya puedo sumarlo.`,
  addUnitMismatch: (name: string, available: string, asked: string) =>
    `Tengo ${name} en ${available}, no en ${asked}. Dime cuánto añado en ${available}.`,
  addAskUnit: (name: string) =>
    `${name} va a granel, así que dime la unidad, por ejemplo: añade medio kilo.`,
  addAskUnitReprompt: "¿Cuánto añado, y en qué unidad?",
  listMissing: "No he entendido qué apunto en la lista.",
  // En la lista sí vale un nombre libre: un artículo apuntado es efímero y se ve
  // en el móvil antes de comprar, así que una transcripción torcida se corrige de
  // un toque. No es como el catálogo, que sostiene tickets y precios.
  listAdded: (name: string, quantity: string | null) =>
    quantity === null
      ? `Apuntado en la lista: ${name}.`
      : `Apuntado en la lista: ${quantity} de ${name}.`,
  listMerged: (name: string, quantity: string | null) =>
    quantity === null
      ? `Ya lo tenías apuntado, así que lo dejo como estaba: ${name}.`
      : `Ya lo tenías apuntado, así que ahora pone ${quantity} de ${name}.`,
  listStockWarning: (stock: string) =>
    ` Por si acaso: en el inventario todavía te quedan ${stock}.`,
  stockEmpty: (name: string) => `No te queda ${name}.`,
  stockReport: (name: string, stock: string) => `Te quedan ${stock} de ${name}.`,
  // La caducidad, solo si es inminente: en la cocina es justo el dato por el que
  // preguntas, y callarlo sería peor que alargar la frase. Se distingue si está
  // caducado TODO o solo una parte, porque la decisión que tomas es distinta.
  stockAllExpired: " Ojo, ya está caducado.",
  stockSomeExpired: " Ojo, parte de eso ya está caducado.",
  stockExpiringSoon: (cuando: string) => ` Ojo, lo primero caduca ${cuando}.`,
} as const;
