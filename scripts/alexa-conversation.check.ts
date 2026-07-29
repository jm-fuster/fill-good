/**
 * Comprobaciones de la conversación de la skill de Alexa. Lo ejecuta
 * `npm run check:alexa` (ver `scripts/check-alexa.mjs`, que lo empaqueta con
 * esbuild porque esto es TypeScript y tira del alias `@/`).
 *
 * Ejecuta el despacho REAL (`dispatchAlexaRequest`) contra un cliente de
 * Supabase falso, así que prueba los handlers de verdad sin tocar ninguna base
 * ni necesitar credenciales. Cubre lo que ni el compilador ni el simulador de
 * Amazon pueden cubrir: que el estado de la conversación sobreviva a la ida y
 * vuelta por el dispositivo, y que una orden interrumpida se retome bien.
 *
 * Lo que NO se prueba aquí es el reconocimiento de voz: qué frase cae en qué
 * intent lo decide Alexa, y eso solo se ve en el simulador de la consola.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { dispatchAlexaRequest } from "@/features/alexa/handlers";
import { ordinalFromWord, pickCandidate } from "@/features/alexa/resolve";
import { SPEECH, speak, type SessionState } from "@/features/alexa/respond";
import {
  alexaEnvelopeSchema,
  getSpokenQuantity,
} from "@/features/alexa/schemas";
import type { Database } from "@/lib/supabase/types";

let fallos = 0;
function check(nombre: string, condicion: boolean, extra?: unknown) {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    fallos += 1;
    console.log(
      `  FALLO ${nombre}`,
      extra === undefined ? "" : JSON.stringify(extra),
    );
  }
}

const APP = "amzn1.ask.skill.test";

/**
 * Cliente de Supabase falso: cada tabla declara qué devuelve como fila única y
 * como lista, y toda escritura dice que ha ido bien. Es deliberadamente tonto
 * —no filtra por nada— porque lo que se prueba son las decisiones de la
 * conversación, no el SQL.
 */
type TableData = { single?: unknown; list?: unknown[] };
function fakeAdmin(tables: Record<string, TableData>): SupabaseClient<Database> {
  const chain = (table: string): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          // El eslabón es "thenable": así `await supabase.from(x).select(y)`
          // resuelve igual que en el cliente de verdad.
          if (prop === "then") {
            return (resolve: (value: unknown) => void) =>
              resolve({ data: tables[table]?.list ?? [], error: null });
          }
          if (prop === "maybeSingle" || prop === "single") {
            return () =>
              Promise.resolve({
                data: tables[table]?.single ?? null,
                error: null,
              });
          }
          return () => chain(table);
        },
      },
    );
  return { from: (table: string) => chain(table) } as unknown as SupabaseClient<Database>;
}

const LINK = { single: { id: "l1", household_id: "h1", user_id: "u1" } };
const LISTA = { single: { id: "list1" } };

const YOGUR_NATURAL = {
  id: "p1",
  name: "Yogur natural",
  normalized_name: "yogur natural",
  default_unit: "ud",
  default_location: "fridge",
};
const YOGUR_GRIEGO = {
  id: "p2",
  name: "Yogur griego",
  normalized_name: "yogur griego",
  default_unit: "ud",
  default_location: "fridge",
};
const SEIS_YOGURES = {
  list: [
    { id: "i1", quantity: 6, unit: "ud", location: "fridge", expiry_date: null },
  ],
};

const YOGURES = fakeAdmin({
  alexa_links: LINK,
  products: { list: [YOGUR_NATURAL] },
  inventory_items: SEIS_YOGURES,
  shopping_lists: LISTA,
});

/** Dos productos que se parecen: el caso que obliga a preguntar. */
const DOS_YOGURES = fakeAdmin({
  alexa_links: LINK,
  products: { list: [YOGUR_NATURAL, YOGUR_GRIEGO] },
  inventory_items: SEIS_YOGURES,
  shopping_lists: LISTA,
});

const ARROZ = fakeAdmin({
  alexa_links: LINK,
  products: {
    list: [
      {
        id: "p2",
        name: "Arroz",
        normalized_name: "arroz",
        default_unit: "kg",
        default_location: "pantry",
      },
    ],
  },
  inventory_items: {
    list: [
      { id: "i2", quantity: 2, unit: "kg", location: "pantry", expiry_date: null },
    ],
  },
  shopping_lists: LISTA,
});

const VACIO = fakeAdmin({ alexa_links: LINK, shopping_lists: LISTA });

function envelope(request: unknown, attributes?: SessionState) {
  return {
    version: "1.0",
    session: {
      new: false,
      sessionId: "s1",
      application: { applicationId: APP },
      user: { userId: "amzn1.ask.account.TEST" },
      ...(attributes ? { attributes } : {}),
    },
    request,
  };
}

let contador = 0;
function intentRequest(name: string, slots: Record<string, unknown> = {}) {
  contador += 1;
  return {
    type: "IntentRequest",
    requestId: `r-${contador}`,
    timestamp: "2026-07-29T10:00:00Z",
    locale: "es-ES",
    intent: { name, slots },
  };
}

/** Un slot tal como lo manda Alexa; con `id` si lo resolvió a un valor nuestro. */
function slot(name: string, value: string, id?: string) {
  return {
    name,
    value,
    ...(id
      ? {
          resolutions: {
            resolutionsPerAuthority: [
              {
                status: { code: "ER_SUCCESS_MATCH" },
                values: [{ value: { name: value, id } }],
              },
            ],
          },
        }
      : {}),
  };
}

async function run(
  request: unknown,
  attributes?: SessionState,
  admin: SupabaseClient<Database> = VACIO,
) {
  const parsed = alexaEnvelopeSchema.safeParse(envelope(request, attributes));
  if (!parsed.success) {
    throw new Error(`envelope inválido: ${parsed.error.message}`);
  }
  return dispatchAlexaRequest(parsed.data, admin);
}

type Respuesta = Awaited<ReturnType<typeof run>>;
const text = (r: Respuesta) => r.response.outputSpeech?.text ?? "";

/** Lo que Alexa nos devolvería en el turno siguiente: pasa por JSON, como allí. */
const siguienteTurno = (r: Respuesta) =>
  JSON.parse(JSON.stringify(r.sessionAttributes ?? {})) as SessionState;

const candidatos = [
  { id: "p1", name: "Yogur natural" },
  { id: "p2", name: "Yogur griego" },
];
const elegirRestar = (cantidad: number | null): SessionState => ({
  pendiente: { tipo: "elegir", accion: "restar", candidatos, cantidad, unidad: null },
});

async function main() {
  console.log("\n1. Ida y vuelta del estado de sesión por el esquema");
  {
    const emitido = speak("x", { state: elegirRestar(2) });
    const vuelta = alexaEnvelopeSchema.safeParse(
      envelope(
        intentRequest("RespuestaIntent"),
        JSON.parse(JSON.stringify(emitido.sessionAttributes)) as SessionState,
      ),
    );
    check("el «elegir» emitido vuelve a parsear", vuelta.success);
    const pendiente = vuelta.success
      ? vuelta.data.session?.attributes?.pendiente
      : null;
    check(
      "conserva acción, candidatos y cantidad",
      pendiente?.tipo === "elegir" &&
        pendiente.accion === "restar" &&
        pendiente.candidatos.length === 2 &&
        pendiente.cantidad === 2 &&
        pendiente.unidad === null,
      pendiente,
    );
  }
  {
    const emitido = speak("x", {
      state: {
        pendiente: { tipo: "unidad", accion: "sumar", productId: "p1", name: "Arroz" },
      },
    });
    const vuelta = alexaEnvelopeSchema.safeParse(
      envelope(intentRequest("RespuestaIntent"), emitido.sessionAttributes),
    );
    check(
      "el «unidad» emitido vuelve a parsear",
      vuelta.success &&
        vuelta.data.session?.attributes?.pendiente?.tipo === "unidad",
    );
  }
  {
    const vuelta = alexaEnvelopeSchema.safeParse(
      envelope(intentRequest("AMAZON.YesIntent"), {
        pendiente: { tipo: "loQueSea", cosa: 1 },
      } as unknown as SessionState),
    );
    check(
      "un pendiente corrupto se ignora en vez de dar 400",
      vuelta.success && vuelta.data.session?.attributes?.pendiente === undefined,
    );
  }

  console.log("\n2. Cantidades habladas (AMAZON.NUMBER no sabe de fracciones)");
  check(
    "«medio kilo» → 0,5",
    getSpokenQuantity({
      name: "RestarStockIntent",
      slots: {
        fraccion: slot("fraccion", "medio", "0.5"),
        unidad: slot("unidad", "kilos", "kg"),
      },
    }) === 0.5,
  );
  check(
    "«un cuarto de kilo» → 0,25 aunque el «un» caiga en cantidad",
    getSpokenQuantity({
      name: "RestarStockIntent",
      slots: {
        cantidad: slot("cantidad", "1"),
        fraccion: slot("fraccion", "un cuarto", "0.25"),
      },
    }) === 0.25,
  );
  check(
    "«dos kilos» sigue siendo 2",
    getSpokenQuantity({
      name: "RestarStockIntent",
      slots: {
        cantidad: slot("cantidad", "2"),
        unidad: slot("unidad", "kilos", "kg"),
      },
    }) === 2,
  );
  check(
    "sin cantidad sigue siendo null",
    getSpokenQuantity({ name: "RestarStockIntent", slots: {} }) === null,
  );

  console.log("\n3. Elegir entre candidatos (puro)");
  check("«natural» elige el natural", pickCandidate("natural", candidatos)?.id === "p1");
  check("«el natural» con artículo también", pickCandidate("el natural", candidatos)?.id === "p1");
  check("«griegos» en plural también", pickCandidate("griegos", candidatos)?.id === "p2");
  check("el nombre completo también", pickCandidate("yogur natural", candidatos)?.id === "p1");
  check("«yogur» a secas sigue siendo ambiguo", pickCandidate("yogur", candidatos) === null);
  check("algo que no está devuelve null", pickCandidate("leche", candidatos) === null);
  check("«la primera» → 1", ordinalFromWord("la primera") === 1);
  check("«segundo» → 2", ordinalFromWord("segundo") === 2);
  check("«natural» no es un ordinal", ordinalFromWord("natural") === null);

  console.log("\n4. Modo conversación (¿Algo más?)");
  {
    const r = await run({
      type: "LaunchRequest",
      requestId: "r0",
      timestamp: "2026-07-29T10:00:00Z",
      locale: "es-ES",
    });
    check("abrir la skill enciende el modo", r.sessionAttributes?.conversacion === true);
    check("y deja la sesión abierta", r.response.shouldEndSession === false);
  }
  {
    const r = await run(intentRequest("AMAZON.HelpIntent"), { conversacion: true });
    check("la ayuda propaga el modo", r.sessionAttributes?.conversacion === true);
    check("sin colar un «¿Algo más?» donde ya hay pregunta", !text(r).includes("¿Algo más?"));
  }
  {
    const r = await run(intentRequest("AMAZON.StopIntent"), { conversacion: true });
    check("«para» cierra de verdad", r.response.shouldEndSession === true);
    check("y no se le pega «¿Algo más?»", text(r) === SPEECH.stop, text(r));
  }
  {
    const r = await run(intentRequest("AMAZON.NoIntent"), { conversacion: true });
    check(
      "un «no» sin nada pendiente cierra",
      r.response.shouldEndSession === true && text(r) === SPEECH.stop,
      text(r),
    );
  }
  {
    const r = await run(intentRequest("AMAZON.HelpIntent"));
    check("fuera del modo, la marca no aparece", r.sessionAttributes?.conversacion === undefined);
  }

  console.log("\n5. Guardarraíles de las respuestas sueltas");
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "natural") }),
    );
    check("sin nada pendiente no hace nada", text(r) === SPEECH.nothingPending, text(r));
    check("y deja hablar otra vez", r.response.shouldEndSession === false);
  }
  {
    const r = await run(intentRequest("AMAZON.YesIntent"), elegirRestar(2));
    check(
      "un «sí» a un «¿cuál de ellas?» vuelve a preguntar",
      text(r) === SPEECH.ambiguousRetry(["Yogur natural", "Yogur griego"]),
      text(r),
    );
    check("y NO pierde la pregunta", r.sessionAttributes?.pendiente?.tipo === "elegir");
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "yogur") }),
      elegirRestar(2),
      DOS_YOGURES,
    );
    check(
      "una respuesta que sigue siendo ambigua no adivina",
      text(r) === SPEECH.ambiguousRetry(["Yogur natural", "Yogur griego"]),
      text(r),
    );
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "arroz") }),
      { pendiente: { tipo: "unidad", accion: "sumar", productId: "p2", name: "Arroz" } },
      ARROZ,
    );
    check(
      "una respuesta sin unidad vuelve a preguntar la unidad",
      text(r) === SPEECH.addAskUnitReprompt,
      text(r),
    );
    check("conservando el pendiente", r.sessionAttributes?.pendiente?.tipo === "unidad");
  }
  {
    const r = await run(intentRequest("AMAZON.NoIntent"), {
      pendiente: { tipo: "apuntar", productId: "p1", name: "Pan", normalized: "pan" },
    });
    check("un «no» cancela lo pendiente", text(r) === SPEECH.emptiedNo, text(r));
    check("y no lo devuelve", r.sessionAttributes?.pendiente === undefined);
  }

  console.log("\n6. Retomar la orden interrumpida");
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "natural") }),
      elegirRestar(2),
      YOGURES,
    );
    check(
      "«el natural» retoma el «quita dos yogures» sin repetirlo",
      text(r) === "Vale, he quitado 2 unidades de Yogur natural. Ahora hay 4 unidades.",
      text(r),
    );
    check("y la pregunta ya no sigue viva", r.sessionAttributes?.pendiente === undefined);
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { orden: slot("orden", "1") }),
      {
        pendiente: {
          tipo: "elegir",
          accion: "consultar",
          candidatos,
          cantidad: null,
          unidad: null,
        },
      },
      YOGURES,
    );
    check(
      "«la primera» vale igual, y consultar no escribe",
      text(r) === "Te quedan 6 unidades de Yogur natural.",
      text(r),
    );
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "natural") }),
      elegirRestar(6),
      YOGURES,
    );
    check(
      "quedarse a cero ofrece apuntarlo",
      text(r) ===
        `Vale, he quitado 6 unidades de Yogur natural. Ya no queda nada.${SPEECH.offerList}`,
      text(r),
    );
    check("con la sesión abierta para el «sí»", r.response.shouldEndSession === false);
    check(
      "y el producto guardado",
      r.sessionAttributes?.pendiente?.tipo === "apuntar" &&
        r.sessionAttributes.pendiente.productId === "p1",
      r.sessionAttributes,
    );
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", {
        fraccion: slot("fraccion", "medio", "0.5"),
        unidad: slot("unidad", "kilos", "kg"),
      }),
      { pendiente: { tipo: "unidad", accion: "restar", productId: "p2", name: "Arroz" } },
      ARROZ,
    );
    check(
      "«medio kilo» a secas completa la resta a granel",
      text(r) === "Vale, he quitado 0,5 kilos de Arroz. Ahora hay 1,5 kilos.",
      text(r),
    );
  }
  {
    const r = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "natural") }),
      { ...elegirRestar(2), conversacion: true },
      YOGURES,
    );
    check("en modo conversación remata con «¿Algo más?»", text(r).endsWith("¿Algo más?"), text(r));
    check("y no cierra", r.response.shouldEndSession === false);
    check("con reprompt, que Amazon lo exige", r.response.reprompt !== undefined);
    check("y el modo sigue encendido", r.sessionAttributes?.conversacion === true);
  }
  {
    const r = await run(
      intentRequest("RestarStockIntent", {
        producto: slot("producto", "yogures"),
        cantidad: slot("cantidad", "2"),
      }),
      undefined,
      YOGURES,
    );
    check(
      "la misma orden de una tacada NO se convierte en charla",
      text(r) === "Vale, he quitado 2 unidades de Yogur natural. Ahora hay 4 unidades.",
      text(r),
    );
    check("y cierra al terminar", r.response.shouldEndSession === true);
  }

  console.log("\n7. El otro lado: preguntar cuál era");
  {
    const r = await run(
      intentRequest("RestarStockIntent", {
        producto: slot("producto", "yogures"),
        cantidad: slot("cantidad", "2"),
      }),
      undefined,
      DOS_YOGURES,
    );
    check(
      "con dos parecidos pregunta en vez de adivinar",
      text(r) ===
        "Tengo varias cosas que se parecen a yogures: Yogur natural y Yogur griego. ¿Cuál de ellas?",
      text(r),
    );
    check("dejando la sesión abierta", r.response.shouldEndSession === false);
    const pendiente = r.sessionAttributes?.pendiente;
    check(
      "y guardando la orden entera para retomarla",
      pendiente?.tipo === "elegir" &&
        pendiente.accion === "restar" &&
        pendiente.cantidad === 2 &&
        pendiente.candidatos.length === 2,
      pendiente,
    );
    const r2 = await run(
      intentRequest("RespuestaIntent", { producto: slot("producto", "el griego") }),
      siguienteTurno(r),
      DOS_YOGURES,
    );
    check(
      "y el turno siguiente la completa",
      text(r2) === "Vale, he quitado 2 unidades de Yogur griego. Ahora hay 4 unidades.",
      text(r2),
    );
  }

  if (fallos > 0) {
    console.log(`\n${fallos} comprobaciones FALLIDAS.\n`);
    process.exit(1);
  }
  console.log("\nConversación de Alexa: todo correcto.\n");
}

await main();
