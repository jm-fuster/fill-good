import type { UnitType } from "@/lib/supabase/types";
import { formatQuantityValue } from "@/lib/units";

/**
 * Construcción de las respuestas de voz. Todo el texto que suena por el altavoz
 * vive aquí, por el mismo motivo que la UI no lleva literales sueltos: leer de
 * corrido lo que dice la skill es la única forma de que suene a persona y no a
 * volcado de base de datos.
 */

/**
 * Estado que se lleva de un turno al siguiente. Va en el envelope, no en el
 * servidor: Alexa devuelve tal cual lo que le mandemos aquí mientras la sesión
 * siga abierta, así que se puede hacer una pregunta de sí/no sin guardar
 * conversaciones a medias en ningún sitio (ni caducarlas).
 *
 * Solo se conserva si la respuesta lo vuelve a incluir: cualquier otra orden
 * limpia lo pendiente por sí sola, que es justo lo que se quiere.
 */
/**
 * Orden de voz a la que se vuelve cuando el usuario contesta una pregunta.
 *
 * «tirar» y «estropear» son las mismas operaciones que «restar» y «agotar» sobre
 * el inventario; lo que cambia es lo que queda escrito en el historial
 * (`discarded` en vez de `consumed`) y el verbo con el que se contesta. Merece
 * la pena distinguirlas porque gastar y desperdiciar no son lo mismo, y es lo
 * único que puede sostener una historia de ahorro creíble.
 */
export type VoiceAction =
  | "restar"
  | "tirar"
  | "sumar"
  | "agotar"
  | "estropear"
  | "consultar"
  | "apuntar";

/**
 * La pregunta que quedó abierta en el turno anterior. Es una unión discriminada
 * porque un «sí» o un «el natural» no significan lo mismo según lo que se
 * preguntara: sin el `tipo`, la respuesta suelta del usuario no se puede
 * interpretar.
 */
export type PendingState =
  /** Producto sin existencias, a la espera de un sí para apuntarlo en la lista. */
  | { tipo: "apuntar"; productId: string; name: string; normalized: string }
  /**
   * Varios productos se parecen a lo que se dijo. Se guardan los candidatos y lo
   * que hace falta para RETOMAR la orden, que es justo la gracia: el usuario
   * contesta solo el nombre y no repite la frase entera. `cantidad` y `unidad`
   * son las que dijo —null si no las dijo—, para que al reanudar se apliquen los
   * mismos valores por defecto que en la primera pasada.
   */
  | {
      tipo: "elegir";
      accion: VoiceAction;
      candidatos: { id: string; name: string }[];
      cantidad: number | null;
      unidad: UnitType | null;
    }
  /** Producto a granel del que falta la unidad: «¿medio kilo o dos kilos?». */
  | { tipo: "unidad"; accion: VoiceAction; productId: string; name: string };

export type SessionState = {
  pendiente?: PendingState;
  /**
   * El usuario ABRIÓ la skill («Alexa, abre mi despensa») en vez de soltar una
   * orden de una tacada. Solo entonces se encadena «¿Algo más?»: quien dice
   * «dile a mi despensa que…» quiere despachar y marcharse, no conversar.
   */
  conversacion?: true;
};

/**
 * Tarjeta que Alexa deja ESCRITA en el móvil (app de Alexa → Actividad). Se usa
 * solo para lo que no se puede resolver hablando: quien acaba de habilitar la
 * skill tiene que ir a la app a por un código, y una frase que suena una vez y
 * se olvida no basta. El resto de respuestas no llevan tarjeta a propósito —
 * dejar un aviso en el móvil por cada yogur restado sería ruido.
 */
export type SimpleCard = { type: "Simple"; title: string; content: string };

export type AlexaResponse = {
  version: "1.0";
  sessionAttributes?: SessionState;
  response: {
    outputSpeech?: { type: "PlainText"; text: string };
    reprompt?: { outputSpeech: { type: "PlainText"; text: string } };
    card?: SimpleCard;
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
  {
    endSession = true,
    reprompt,
    state,
    card,
  }: {
    endSession?: boolean;
    reprompt?: string;
    state?: SessionState;
    card?: SimpleCard;
  } = {},
): AlexaResponse {
  return {
    version: "1.0",
    ...(state ? { sessionAttributes: state } : {}),
    response: {
      outputSpeech: { type: "PlainText", text },
      ...(reprompt
        ? { reprompt: { outputSpeech: { type: "PlainText", text: reprompt } } }
        : {}),
      ...(card ? { card } : {}),
      shouldEndSession: endSession,
    },
  };
}

/**
 * Tarjeta con los pasos para vincular: el punto exacto en el que se atasca quien
 * estrena la skill, porque oye «genera un código en Ajustes» y no tiene dónde
 * pinchar.
 *
 * El enlace sale de `VERCEL_PROJECT_PRODUCTION_URL`, que Vercel define en cada
 * despliegue sin tener que configurar nada. En local no existe y la tarjeta se
 * queda solo con los pasos, que da igual: ahí no hay app de Alexa que la muestre.
 */
export function linkCard(): SimpleCard {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return {
    type: "Simple",
    title: "Vincula este altavoz con Fill Good",
    content:
      "1. Abre Fill Good y entra en Ajustes, y luego en Alexa.\n" +
      "2. Pulsa «Generar el código»: son seis dígitos.\n" +
      "3. Dime: «Alexa, dile a mi despensa que vincule con código», y los seis dígitos.\n" +
      (host ? `\nhttps://${host}/ajustes/alexa` : ""),
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

/** Cuándo pasa algo, dicho en corto: «hoy», «mañana», «en 3 días». */
export function speakWhen(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/**
 * La urgencia de una caducidad ya con su verbo: «ya está caducado», «caduca
 * mañana». Se dice dentro de una enumeración, así que va sin nombre delante ni
 * puntuación detrás.
 */
export function speakDue(days: number): string {
  return days < 0 ? "ya está caducado" : `caduca ${speakWhen(days)}`;
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
    "tres leches, apunta pan, o cuánta leche queda. También puedo leerte la " +
    "lista, decirte qué caduca pronto y qué toca hoy de menú, apuntar lo que " +
    "tires, tachar lo que ya hayas comprado y borrar de la lista lo que ya no " +
    "haga falta. Si me equivoco, dime: deshaz lo último. Si este altavoz " +
    "todavía no está vinculado, genera un código en Fill Good, en Ajustes, " +
    "Alexa, y dime: vincula con código, y los seis dígitos.",
  helpReprompt: `¿Qué apunto? Por ejemplo: ${EXAMPLE}.`,
  // Despedida. Está en CLOSING_SPEECH (handlers.ts): cierra la sesión aunque
  // estemos en modo conversación, porque «Hasta luego. ¿Algo más?» no se sostiene.
  stop: "Hasta luego.",
  // Coletilla del modo conversación. Se pega a las confirmaciones cuando el
  // usuario abrió la skill, para poder encadenar órdenes sin repetir «Alexa».
  anythingElse: "¿Algo más?",
  anythingElseReprompt: "¿Algo más? Si ya está, di: no.",
  fallback: `No te he entendido. Prueba a decir: ${EXAMPLE}.`,
  fallbackReprompt: `¿Qué apunto? Por ejemplo: ${EXAMPLE}.`,
  error: "Ha habido un problema con tu despensa. Inténtalo otra vez en un momento.",
  // Reintento de Amazon (la primera copia de la petición sigue en vuelo). NO
  // invita a repetir la orden a propósito: repetirla es justo lo que duplicaría
  // el movimiento que acabamos de proteger. Se remite a la app, que es la verdad.
  slowRetry:
    "Voy con retraso, pero lo estoy apuntando. Míralo en Fill Good dentro de un momento.",
  notLinked:
    "Este altavoz todavía no está vinculado a ningún hogar. Abre Fill Good, " +
    "entra en Ajustes y luego en Alexa, genera un código y dime: vincula con " +
    "código, seguido de los seis dígitos.",
  linkCodeMissing:
    "Dime el código de seis dígitos que te da Fill Good en Ajustes, Alexa.",
  linkCodeInvalid:
    "Ese código no vale o ya ha caducado. Genera uno nuevo en Fill Good, en " +
    "Ajustes, Alexa, y vuelve a decírmelo.",
  linkRateLimited:
    "Has probado demasiados códigos seguidos. Espera unos minutos y vuelve a " +
    "intentarlo.",
  linked: (householdName: string) =>
    `Listo, este altavoz ya está vinculado con ${householdName}. Prueba a decir: ${EXAMPLE}.`,
  productMissing: "No he entendido qué producto quitar.",
  productUnknown: (spoken: string) =>
    `No encuentro ${spoken} en tu inventario. Añádelo primero en Fill Good.`,
  // Se PREGUNTA, no se manda repetir: la respuesta suelta («el natural», «la
  // primera») la recoge RespuestaIntent y retoma la orden con lo que quedó
  // guardado en la sesión, así que el usuario no vuelve a decir la frase entera.
  ambiguous: (spoken: string, names: string[]) =>
    `Tengo varias cosas que se parecen a ${spoken}: ${speakList(names)}. ¿Cuál de ellas?`,
  ambiguousReprompt: "Dime cuál de ellas, o di: la primera.",
  ambiguousRetry: (names: string[]) =>
    `No he cogido cuál. Puedes decir: ${speakList(names)}, o: la primera.`,
  quantityInvalid: "Dime una cantidad que pueda restar, por ejemplo: dos.",
  noStock: (name: string) => `No te queda ${name} en el inventario.`,
  unitMismatch: (name: string, available: string, asked: string) =>
    `Tengo ${name} en ${available}, no en ${asked}. Dime cuánto quito en ${available}.`,
  // El ejemplo va DESNUDO («medio kilo», no «quita medio kilo»): la sesión se
  // queda abierta y RespuestaIntent recoge la cantidad suelta, así que pedir la
  // orden entera sería mandar trabajo de más. El verbo lo pone quien pregunta
  // («quito», «tiro», «añado»): preguntar «¿cuánto quito?» a quien acaba de
  // decir que ha tirado algo delata que no se le ha escuchado.
  askUnit: (name: string, stock: string, verbo: string) =>
    `Tienes ${stock} de ${name}. ¿Cuánto ${verbo}? Por ejemplo: medio kilo.`,
  askUnitReprompt: (verbo: string) => `¿Cuánto ${verbo}, y en qué unidad?`,
  // Ojo con la concordancia: «te quedan 1 unidad» y «solo quedaba 4 unidades»
  // suenan a robot. Se usa el impersonal («hay», «había»), que en español no
  // cambia con el número, así que vale igual para 1 que para 4.
  deducted: (taken: string, name: string, left: string | null) =>
    left === null
      ? `Vale, he quitado ${taken} de ${name}. Ya no queda nada.`
      : `Vale, he quitado ${taken} de ${name}. Ahora hay ${left}.`,
  deductedPartial: (taken: string, name: string) =>
    `Solo había ${taken} de ${name}, así que lo he quitado todo. Ya no queda nada.`,
  // Tirar se dice distinto que gastar aunque el descuento sea idéntico: si el
  // usuario se molesta en distinguirlo, la respuesta también debe hacerlo.
  discarded: (taken: string, name: string, left: string | null) =>
    left === null
      ? `Vale, he tirado ${taken} de ${name}. Ya no queda nada.`
      : `Vale, he tirado ${taken} de ${name}. Ahora hay ${left}.`,
  discardedPartial: (taken: string, name: string) =>
    `Solo había ${taken} de ${name}, así que lo he tirado todo. Ya no queda nada.`,
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
    `${name} va a granel, así que dime cuánto. Por ejemplo: medio kilo.`,
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
  // Marcar comprado NO suma existencias, igual que tachar en la app: el stock
  // entra al finalizar la compra, y adelantarlo aquí lo contaría dos veces.
  //
  // Todas estas frases evitan concordar en género con el nombre del producto,
  // que lo escribe el usuario y no conocemos: se dice «he tachado X» (participio
  // invariable) y nunca «X queda tachado», que canta con «Leche».
  listChecked: (name: string) => `Hecho, he tachado ${name} de la lista.`,
  listCheckedLast: (name: string) =>
    `Hecho, he tachado ${name}. Ya no queda nada por comprar.`,
  listAlreadyChecked: (name: string) =>
    `Ya habías tachado ${name} de la lista.`,
  // Borrar NO es tachar: lo tachado acaba en el inventario al finalizar la
  // compra, y esto es justo lo que ya no quieres.
  listDeleted: (name: string) => `Hecho, he borrado ${name} de la lista.`,

  // Deshacer. La respuesta nombra el producto para que se oiga si se ha
  // deshecho otra cosa distinta de la que el usuario tenía en la cabeza.
  undone: (name: string) =>
    `Hecho, lo he deshecho. ${name} vuelve a estar como estaba.`,
  nothingToUndo:
    "No tengo nada reciente que deshacer. Si hace un rato de eso, míralo en Fill Good.",
  alreadyUndone: "Eso ya lo había deshecho.",
  listItemUnknown: (spoken: string) =>
    `No encuentro ${spoken} entre lo que queda por comprar.`,
  listItemAmbiguous: (names: string[]) =>
    `Tengo varias cosas parecidas en la lista: ${speakList(names)}. ` +
    "Dímelo con el nombre completo.",
  stockEmpty: (name: string) => `No te queda ${name}.`,
  stockReport: (name: string, stock: string) => `Te quedan ${stock} de ${name}.`,
  // La caducidad, solo si es inminente: en la cocina es justo el dato por el que
  // preguntas, y callarlo sería peor que alargar la frase. Se distingue si está
  // caducado TODO o solo una parte, porque la decisión que tomas es distinta.
  stockAllExpired: " Ojo, ya está caducado.",
  stockSomeExpired: " Ojo, parte de eso ya está caducado.",
  stockExpiringSoon: (cuando: string) => ` Ojo, lo primero caduca ${cuando}.`,
  // Coletilla que convierte un callejón sin salida en la acción que de verdad
  // viene después: si algo se ha quedado a cero, lo siguiente es comprarlo. Se
  // pega a las respuestas que dejan el stock vacío, y la sesión se queda abierta
  // para poder contestar «sí» sin repetir «Alexa».
  offerList: " ¿Lo apunto en la lista de la compra?",
  emptiedAsk: (name: string) =>
    `Vale, ya no queda ${name}. ¿Lo apunto en la lista de la compra?`,
  // Se dice «lo que quedaba de X» y no «todo el X» a propósito: el nombre del
  // producto lo escribe el usuario y no sabemos su género, y «todo el Leche»
  // delata a la máquina en la primera frase.
  spoiledAsk: (name: string) =>
    `Vaya. He tirado lo que quedaba de ${name}. ¿Lo apunto en la lista de la compra?`,
  emptiedAskReprompt: "¿Lo apunto en la lista?",
  emptiedAlready: (name: string) =>
    `Ya no te quedaba ${name}. ¿Lo apunto en la lista de la compra?`,
  emptiedNo: "Vale, lo dejo así.",
  // «Sí» sin nada pendiente: la sesión ya se había cerrado o venía de otra orden.
  nothingPending: `No sé a qué te refieres. Prueba a decir: ${EXAMPLE}.`,

  // Consultas de solo lectura. Todas se cortan a unos pocos artículos: por voz
  // no se retiene una lista de veinte cosas, y quien necesita la lista entera la
  // quiere en la mano, no en el aire. El resto se resume y se remite a la app.
  andMore: (rest: number) =>
    rest === 1
      ? " Y una cosa más, que la tienes en Fill Good."
      : ` Y ${rest} cosas más, que las tienes en Fill Good.`,
  listEmpty: "No tienes nada apuntado en la lista de la compra.",
  listReport: (items: string) => `En la lista tienes ${items}.`,
  expiryNone: "No tienes nada a punto de caducar.",
  expiryReport: (items: string) => `Ojo con esto: ${items}.`,
  menuNone: "Hoy no tienes nada planificado en el menú.",
  menuReport: (partes: string) => `Hoy toca ${partes}.`,
  /** Un hueco del día dentro de la enumeración: «de cena, Tortilla». */
  menuPart: (label: string, names: string) =>
    `de ${label.toLowerCase()}, ${names}`,

  // Bienvenida con lo urgente por delante: abrir la skill y oír solo «dime qué
  // gastas» desaprovecha el único momento en que el usuario está escuchando.
  welcomeWithContext: (avisos: string) => `Hola. ${avisos} ¿Qué apunto?`,
  expiryHeadline: (count: number) =>
    count === 1 ? "Te caduca una cosa pronto." : `Te caducan ${count} cosas pronto.`,
  listHeadline: (count: number) =>
    count === 1
      ? "Tienes una cosa apuntada en la lista."
      : `Tienes ${count} cosas apuntadas en la lista.`,
} as const;
